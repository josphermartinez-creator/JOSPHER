"""
Quantum Bot - Puente Python a IQ Options
=========================================
Expone la API de iqoptionapi como HTTP para que el resto del bot (Node/Next.js)
pueda pedir velas reales, colocar ordenes reales y consultar resultados reales.

REGLA DE ORO DE ESTE ARCHIVO:
    Si algo no se puede hacer contra el broker, se devuelve un ERROR.
    NUNCA se devuelve un dato inventado ni un exito falso.

INSTALACION:
    pip install flask flask-cors requests
    pip install https://github.com/iqoptionapi/iqoptionapi/archive/refs/heads/master.zip

USO:
    python iqoption_bridge.py
"""

import sys
import time
import logging
import threading

try:
    from flask import Flask, request, jsonify
    from flask_cors import CORS
except ImportError:
    print("ERROR: Flask no instalado")
    print("Ejecuta: pip install flask flask-cors")
    sys.exit(1)

# ====== Comprobacion de websocket-client ANTES de nada ======
# iqoptionapi esta escrita para websocket-client 0.56 (su setup.py lo fija asi).
# En la version 1.x cambiaron como se llaman los callbacks: ahora siempre
# reciben la instancia del websocket como primer argumento, y los de la
# libreria (on_message(self, message), on_close(wss)) no la esperan. El
# resultado es que la conexion revienta con un TypeError raro justo al iniciar
# sesion. Mejor avisar aqui, claro, que fallar despues sin explicacion.
try:
    import websocket as _ws
    _WS_VERSION = str(getattr(_ws, '__version__', '?'))
except ImportError:
    _WS_VERSION = None

if _WS_VERSION is None or not _WS_VERSION.startswith('0.5'):
    print("=" * 62)
    print("  ERROR: version incorrecta de websocket-client")
    print("=" * 62)
    print()
    print("  Instalada : %s" % (_WS_VERSION or "no instalada"))
    print("  Necesaria : 0.56")
    print()
    print("  La libreria de IQ Option solo funciona con la 0.56. Con una")
    print("  version mas nueva el login falla sin decir por que.")
    print()
    print("  Arreglo: cierra esta ventana y haz doble clic en reparar.bat")
    print()
    print("  O a mano:  python -m pip install \"websocket-client==0.56\"")
    print()
    sys.exit(1)

try:
    from iqoptionapi.stable_api import IQ_Option
    from iqoptionapi.constants import ACTIVES
    print("[OK] iqoptionapi importada correctamente (websocket-client %s)" % _WS_VERSION)
except ImportError as e:
    print("[ERROR] iqoptionapi no instalada o version incorrecta: %s" % e)
    print()
    print("Arreglo: cierra esta ventana y haz doble clic en reparar.bat")
    print()
    print("O a mano:")
    print("  pip install https://github.com/iqoptionapi/iqoptionapi/archive/refs/heads/master.zip")
    print("  pip install \"websocket-client==0.56\"")
    sys.exit(1)

# ====== CONFIGURACION ======
PORT = 5005

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%H:%M:%S'
)
logger = logging.getLogger("Bridge")
logging.getLogger('werkzeug').setLevel(logging.WARNING)

app = Flask(__name__)
CORS(app)

# ====== ESTADO GLOBAL ======
# iqoptionapi NO es seguro entre hilos: usa variables globales internas para
# correlacionar peticion y respuesta. Flask corre en modo threaded, asi que
# TODA llamada al cliente pasa por este lock. Sin el, una peticion de velas y
# una orden simultaneas se pisan la respuesta la una a la otra.
_lock = threading.RLock()

iq_client = None
_credentials = {'email': None, 'password': None, 'account_type': 'PRACTICE'}

connection_state = {
    'connected': False,
    'email': None,
    'account_type': 'PRACTICE',
    'balance': 0,
    'currency': 'USD',
    'profile': None,
    'last_error': None,
}

# Cache de payouts (se refresca cada 60s; pedirlo en cada orden cuesta ~1s)
_payout_cache = {'data': {}, 'ts': 0}
_PAYOUT_TTL = 60

# Cache de activos abiertos
_open_cache = {'data': {}, 'ts': 0}
_OPEN_TTL = 60


# ====== CONEXION ======

def _do_connect(email, password, account_type):
    """Conecta y deja el cliente listo. Devuelve (ok, perfil_o_mensaje)."""
    global iq_client

    logger.info("Conectando a IQ Options como %s (%s)...", email, account_type)
    client = IQ_Option(email, password)
    check, reason = client.connect()

    if not check:
        msg = "IQ Option rechazo la conexion: %s" % reason
        logger.error(msg)
        return False, msg

    client.change_balance(account_type)
    time.sleep(1.5)

    try:
        balance = client.get_balance() or 0
    except Exception as e:
        logger.warning("No se pudo leer el balance: %s", e)
        balance = 0

    iq_client = client

    profile = {
        'email': email,
        'name': email.split('@')[0],
        'balance': balance,
        'currency': 'USD',
        'accountType': account_type,
    }

    connection_state.update({
        'connected': True,
        'email': email,
        'account_type': account_type,
        'balance': balance,
        'profile': profile,
        'last_error': None,
    })

    logger.info("CONECTADO - Balance: $%.2f (%s)", balance, account_type)
    return True, profile


def _ensure_connection():
    """Verifica el socket y reconecta si hace falta. Devuelve (ok, error)."""
    global iq_client

    if iq_client is None or not _credentials['email']:
        connection_state['connected'] = False
        return False, 'No hay sesion iniciada. Inicia sesion desde el bot.'

    try:
        if iq_client.check_connect():
            return True, None
    except Exception:
        pass

    logger.warning("Websocket caido. Reconectando...")
    try:
        ok, result = _do_connect(
            _credentials['email'],
            _credentials['password'],
            _credentials['account_type'],
        )
        if ok:
            logger.info("Reconexion correcta")
            return True, None
        connection_state['connected'] = False
        connection_state['last_error'] = result
        return False, 'No se pudo reconectar: %s' % result
    except Exception as e:
        connection_state['connected'] = False
        connection_state['last_error'] = str(e)
        return False, 'No se pudo reconectar: %s' % e


def _fail(message, code=400):
    return jsonify({'success': False, 'error': message}), code


# ====== ACTIVOS ======

def _asset_exists(pair):
    return pair in ACTIVES


def _get_open_assets(force=False):
    """{'EURUSD-OTC': {'open': True, 'kind': 'turbo'}, ...} desde el broker."""
    now = time.time()
    if not force and _open_cache['data'] and now - _open_cache['ts'] < _OPEN_TTL:
        return _open_cache['data']

    with _lock:
        raw = iq_client.get_all_open_time()

    result = {}
    for kind in ('turbo', 'binary'):
        for name, info in (raw.get(kind) or {}).items():
            is_open = bool(info.get('open'))
            if name not in result or is_open:
                result[name] = {'open': is_open, 'kind': kind}

    _open_cache['data'] = result
    _open_cache['ts'] = now
    return result


def _get_payouts(force=False):
    """{'EURUSD-OTC': 87.0, ...} - payout REAL en porcentaje."""
    now = time.time()
    if not force and _payout_cache['data'] and now - _payout_cache['ts'] < _PAYOUT_TTL:
        return _payout_cache['data']

    with _lock:
        raw = iq_client.get_all_profit()

    result = {}
    for name, info in raw.items():
        # get_all_profit devuelve fracciones: 0.87 = 87%
        value = info.get('turbo') or info.get('binary') or 0
        try:
            value = float(value)
        except (TypeError, ValueError):
            continue
        if value > 0:
            result[name] = round(value * 100, 2)

    _payout_cache['data'] = result
    _payout_cache['ts'] = now
    return result


# ====== ENDPOINTS ======

@app.route('/health', methods=['GET'])
def health():
    """El servicio Node consulta esto. 'connected' = sesion viva en el broker."""
    alive = False
    if iq_client is not None:
        try:
            alive = bool(iq_client.check_connect())
        except Exception:
            alive = False

    connection_state['connected'] = alive
    return jsonify({
        'status': 'ok',
        'connected': alive,
        'email': connection_state['email'],
        'accountType': connection_state['account_type'],
        'lib': 'iqoptionapi.stable_api',
    })


@app.route('/status', methods=['GET'])
def status():
    return jsonify(connection_state)


@app.route('/login', methods=['POST'])
def login():
    global iq_client

    data = request.json or {}
    email = data.get('email')
    password = data.get('password')
    account_type = (data.get('accountType') or 'PRACTICE').upper()

    if not email or not password:
        return _fail('Email y password requeridos')
    if account_type not in ('PRACTICE', 'REAL'):
        return _fail('accountType debe ser PRACTICE o REAL')

    with _lock:
        if iq_client is not None:
            try:
                iq_client.disconnect()
            except Exception:
                pass
            iq_client = None

        try:
            ok, result = _do_connect(email, password, account_type)
        except Exception as e:
            logger.error("Error conectando: %s", e)
            connection_state['connected'] = False
            connection_state['last_error'] = str(e)
            return _fail('Error conectando: %s' % e, 500)

    if not ok:
        connection_state['connected'] = False
        connection_state['last_error'] = result
        return _fail(result, 401)

    _credentials.update({
        'email': email,
        'password': password,
        'account_type': account_type,
    })
    _payout_cache['ts'] = 0
    _open_cache['ts'] = 0

    return jsonify({
        'success': True,
        'profile': result,
        'message': 'Conectado - Balance: $%.2f' % result['balance'],
    })


@app.route('/logout', methods=['POST'])
def logout():
    global iq_client
    with _lock:
        if iq_client is not None:
            try:
                iq_client.disconnect()
            except Exception:
                pass
        iq_client = None

    _credentials.update({'email': None, 'password': None})
    connection_state.update({
        'connected': False,
        'email': None,
        'profile': None,
    })
    return jsonify({'success': True})


@app.route('/assets', methods=['GET'])
def assets():
    """Pares REALES del broker, con su estado de apertura y payout real."""
    ok, error = _ensure_connection()
    if not ok:
        return _fail(error)

    try:
        open_assets = _get_open_assets()
        payouts = _get_payouts()
    except Exception as e:
        logger.error("Error leyendo activos: %s", e)
        return _fail('Error leyendo activos: %s' % e, 500)

    result = []
    for name, info in open_assets.items():
        if name not in ACTIVES:
            # No se puede operar con iq.buy() si no esta en ACTIVES
            continue
        result.append({
            'id': name,
            'name': name,
            'isOTC': name.endswith('-OTC'),
            'open': info['open'],
            'kind': info['kind'],
            'payout': payouts.get(name, 0),
        })

    result.sort(key=lambda a: (not a['open'], a['id']))
    return jsonify({'success': True, 'assets': result})


@app.route('/candles', methods=['GET'])
def get_candles():
    """Velas REALES. Si no hay, devuelve error: nunca velas inventadas."""
    pair = request.args.get('pair', 'EURUSD')
    count = int(request.args.get('count', 80))
    timeframe = int(request.args.get('timeframe', 60))

    ok, error = _ensure_connection()
    if not ok:
        return _fail(error)

    if not _asset_exists(pair):
        return _fail('El par %s no existe en IQ Option (revisa el nombre)' % pair, 404)

    try:
        with _lock:
            # IMPORTANTE: get_candles espera el NOMBRE del par, no el id numerico.
            # Pasarle un int hace que devuelva None en silencio.
            raw = iq_client.get_candles(pair, timeframe, count, int(time.time()))
    except Exception as e:
        logger.error("Error pidiendo velas de %s: %s", pair, e)
        return _fail('Error pidiendo velas: %s' % e, 500)

    if not raw:
        return _fail('El broker no devolvio velas para %s' % pair, 502)

    candles = []
    for c in raw:
        try:
            candles.append({
                'time': int(c.get('from', c.get('at', 0))),   # segundos (epoch)
                'open': float(c['open']),
                'high': float(c.get('max', c.get('high'))),
                'low': float(c.get('min', c.get('low'))),
                'close': float(c['close']),
                'volume': float(c.get('volume', 0) or 0),
            })
        except (KeyError, TypeError, ValueError):
            continue

    if not candles:
        return _fail('Velas de %s con formato inesperado' % pair, 502)

    return jsonify({'success': True, 'pair': pair, 'candles': candles, 'source': 'real'})


@app.route('/place-order', methods=['POST'])
def place_order():
    """Coloca una orden REAL. Solo devuelve success si el broker la acepto."""
    data = request.json or {}
    pair = data.get('pair')
    direction = (data.get('direction') or 'CALL').upper()
    expiration = int(data.get('expiration', 60))

    try:
        amount = float(data.get('amount', 0))
    except (TypeError, ValueError):
        return _fail('Importe invalido')

    if not pair:
        return _fail('Falta el par')
    if amount <= 0:
        return _fail('El importe debe ser mayor que 0')
    if direction not in ('CALL', 'PUT'):
        return _fail('Direccion debe ser CALL o PUT')

    ok, error = _ensure_connection()
    if not ok:
        return _fail(error)

    if not _asset_exists(pair):
        return _fail('El par %s no se puede operar con esta API' % pair, 404)

    # El mercado tiene que estar abierto: si no, buy() falla o se queda colgado
    try:
        open_assets = _get_open_assets()
        info = open_assets.get(pair)
        if info is not None and not info['open']:
            return _fail('El mercado de %s esta cerrado ahora mismo' % pair, 409)
    except Exception as e:
        logger.warning("No se pudo comprobar si %s esta abierto: %s", pair, e)

    expiration_minutes = max(1, int(round(expiration / 60.0)))

    try:
        payout = _get_payouts().get(pair, 0)
    except Exception:
        payout = 0

    logger.info("Orden REAL: %s %s $%.2f exp=%dmin", pair, direction, amount, expiration_minutes)

    try:
        with _lock:
            check, order_id = iq_client.buy(
                amount, pair, 'call' if direction == 'CALL' else 'put', expiration_minutes
            )
    except KeyError:
        return _fail('El par %s no existe en la lista de activos de la libreria' % pair, 404)
    except Exception as e:
        logger.error("Error colocando orden: %s", e)
        return _fail('Error colocando orden: %s' % e, 500)

    if not check or not order_id:
        reason = order_id if isinstance(order_id, str) else 'IQ Option rechazo la orden'
        logger.warning("Orden RECHAZADA (%s): %s", pair, reason)
        return _fail(reason, 400)

    logger.info("Orden colocada: %s %s (ID: %s)", pair, direction, order_id)
    return jsonify({
        'success': True,
        'orderId': str(order_id),
        'pair': pair,
        'direction': direction,
        'amount': amount,
        'payout': payout,
        'expirationMinutes': expiration_minutes,
        'placedAt': int(time.time()),
        'real': True,
    })


@app.route('/check-result/<order_id>', methods=['GET'])
def check_result(order_id):
    """
    Resultado REAL de una orden.
    Devuelve status: 'pending' | 'closed'. No bloquea (a diferencia de
    check_win_v3/v4 de la libreria, que se quedan en bucle infinito).
    """
    ok, error = _ensure_connection()
    if not ok:
        return _fail(error)

    try:
        with _lock:
            info = iq_client.get_optioninfo_v2(50)
    except Exception as e:
        logger.error("Error consultando resultado %s: %s", order_id, e)
        return _fail('Error consultando resultado: %s' % e, 500)

    closed = ((info or {}).get('msg') or {}).get('closed_options') or []

    for option in closed:
        raw_id = option.get('id')
        # 'id' llega a veces como lista, a veces como escalar
        ids = raw_id if isinstance(raw_id, (list, tuple)) else [raw_id]
        if str(order_id) not in [str(i) for i in ids if i is not None]:
            continue

        win_flag = option.get('win')          # 'win' | 'loose' | 'equal'
        amount = float(option.get('amount') or 0)
        win_amount = float(option.get('win_amount') or 0)

        if win_flag == 'win':
            profit = win_amount - amount
            result = 'WIN'
        elif win_flag == 'equal':
            profit = 0.0
            result = 'DRAW'
        else:
            profit = -amount
            result = 'LOSS'

        return jsonify({
            'success': True,
            'status': 'closed',
            'orderId': str(order_id),
            'result': result,
            'win': result == 'WIN',
            'profit': round(profit, 2),
            'amount': amount,
            'entryPrice': option.get('value'),        # precio real de entrada
            'exitPrice': option.get('exp_value'),     # precio real de cierre
        })

    return jsonify({'success': True, 'status': 'pending', 'orderId': str(order_id)})


@app.route('/balance', methods=['GET'])
def get_balance():
    ok, error = _ensure_connection()
    if not ok:
        return _fail(error)

    try:
        with _lock:
            balance = iq_client.get_balance()
    except Exception as e:
        return _fail('Error leyendo balance: %s' % e, 500)

    balance = float(balance or 0)
    connection_state['balance'] = balance
    return jsonify({'success': True, 'balance': balance})


# ====== INICIO ======
if __name__ == '__main__':
    print("=" * 60)
    print("  Quantum Bot - Puente Python a IQ Options")
    print("=" * 60)
    print()
    print("  Puerto: %d" % PORT)
    print("  Libreria: iqoptionapi.stable_api")
    print("  Activos conocidos: %d" % len(ACTIVES))
    print()
    print("  Esperando conexiones del bot...")
    print("  Ctrl+C para detener")
    print("=" * 60)
    print()

    app.run(host='127.0.0.1', port=PORT, debug=False, threaded=True)
