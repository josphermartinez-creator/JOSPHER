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

# Todo queda tambien en logs\python-bridge.log, para poder mirarlo despues.
try:
    import os
    _LOG_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'logs')
    os.makedirs(_LOG_DIR, exist_ok=True)
    _fh = logging.FileHandler(os.path.join(_LOG_DIR, 'python-bridge.log'), encoding='utf-8')
    _fh.setFormatter(logging.Formatter('%(asctime)s [%(levelname)s] %(message)s'))
    logging.getLogger().addHandler(_fh)
    print("[OK] Registro en logs/python-bridge.log")
except Exception as _e:
    print("[AVISO] No se pudo crear el archivo de registro: %s" % _e)

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

# Cache de activos (nombre -> abierto + payout). Se refresca cada 60s.
_assets_cache = {'data': {}, 'ts': 0}
_ASSETS_TTL = 60

# ====== CONEXION ======

def _esperar_respuesta(leer, limite=25.0, paso=0.05):
    """
    Espera un dato del broker cediendo el procesador.

    La libreria hace esto con bucles `while dato is None: pass`, SIN pausa. Eso
    deja un nucleo al 100% y, por como funciona Python (un solo hilo ejecuta a
    la vez), bloquea al resto del puente hasta 30 segundos. Mientras tanto la
    comprobacion de salud no llegaba a responder y el bot creia que el puente
    se habia caido o que se habia perdido la conexion con el broker.

    La pausa arranca en 2 ms y va creciendo hasta `paso`. Importa: el broker
    suele contestar en decimas, y con una pausa fija de 50 ms se perdian hasta
    50 ms en cada peticion. Con dos peticiones por entrada (velas y orden) eso
    es un decimo de segundo regalado justo en el momento de entrar al mercado.
    Pasado el primer medio segundo ya se espera con calma, para no calentar el
    procesador en las esperas largas (login, lista de activos).
    """
    inicio = time.time()
    espera = 0.002
    while True:
        valor = leer()
        if valor is not None:
            return valor
        if time.time() - inicio > limite:
            return None
        time.sleep(espera)
        if espera < paso:
            espera = min(paso, espera * 1.6)


def _pedir_init_v2(limite=25.0):
    """Lista de activos (turbo + binary) sin bucle de espera activa."""
    api = iq_client.api
    api.api_option_init_all_result_v2 = None
    api.get_api_option_init_all_v2()
    return _esperar_respuesta(lambda: api.api_option_init_all_result_v2, limite)


def _pedir_velas(pair, timeframe, count, limite=15.0):
    """Velas sin bucle de espera activa. Se llama cada minuto por cada par."""
    api = iq_client.api
    api.candles.candles_data = None
    api.getcandles(ACTIVES[pair], timeframe, count, int(time.time()))
    return _esperar_respuesta(lambda: api.candles.candles_data, limite)


def _reset_estado_libreria():
    """
    iqoptionapi guarda el estado del websocket en variables GLOBALES del modulo
    (iqoptionapi/global_value.py), compartidas por todas las sesiones. Si
    quedan valores de la sesion anterior, el siguiente connect() puede darse
    por cerrado nada mas empezar, o quedarse girando para siempre.
    """
    try:
        from iqoptionapi import global_value
        global_value.check_websocket_if_connect = None
        global_value.check_websocket_if_error = False
        global_value.websocket_error_reason = None
        global_value.ssl_Mutual_exclusion = False
        global_value.ssl_Mutual_exclusion_write = False
        global_value.SSID = None
        global_value.balance_id = None
    except Exception as e:
        logger.warning("No se pudo limpiar el estado de la libreria: %s", e)


def _cerrar_cliente(cliente):
    """
    Cierra la conexion de verdad.

    stable_api.IQ_Option NO tiene metodo disconnect(): antes se llamaba a
    `iq_client.disconnect()`, saltaba un AttributeError que el try/except se
    tragaba, y el websocket viejo se quedaba abierto. Al volver a entrar, su
    callback on_close pisaba el estado global de la sesion nueva y el login se
    quedaba colgado. El metodo bueno es api.close().

    Se llama SIEMPRE desde un hilo suelto: close() hace join() del hilo del
    websocket y puede tardar o no volver nunca.
    """
    if cliente is None:
        return
    try:
        cliente.api.close()
    except Exception as e:
        logger.debug("Cierre del websocket: %s", e)


def _cerrar_en_segundo_plano(cliente):
    if cliente is None:
        return
    threading.Thread(target=_cerrar_cliente, args=(cliente,), daemon=True).start()


def _conectar_con_limite(email, password, account_type, limite=45):
    """
    connect() de la libreria puede quedarse en un bucle infinito: start_websocket()
    gira sobre variables globales sin ningun tiempo maximo. Se ejecuta en un hilo
    aparte para poder rendirse y devolver un error en vez de dejar el puente mudo.
    """
    caja = {}

    def trabajo():
        try:
            caja['r'] = _do_connect(email, password, account_type)
        except Exception as e:
            caja['r'] = (False, 'Error conectando: %s' % e)

    hilo = threading.Thread(target=trabajo, daemon=True)
    hilo.start()
    hilo.join(limite)

    if hilo.is_alive():
        return False, ('IQ Option no respondio en %ds. Cierra el bot con '
                       'detener.bat y vuelve a abrirlo con arrancar.bat.' % limite)
    return caja.get('r', (False, 'Error desconocido al conectar'))


def _do_connect(email, password, account_type):
    """Conecta y deja el cliente listo. Devuelve (ok, perfil_o_mensaje)."""
    global iq_client

    logger.info("Conectando a IQ Options como %s (%s)...", email, account_type)
    _reset_estado_libreria()
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
    _cerrar_en_segundo_plano(iq_client)
    iq_client = None
    try:
        ok, result = _conectar_con_limite(
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


def _get_binary_assets(force=False):
    """
    {'EURUSD-OTC': {'open': True, 'kind': 'turbo', 'payout': 87.0}, ...}

    UNA sola llamada al broker. Antes esto usaba get_all_open_time() +
    get_all_profit(), que juntos hacen cinco viajes al servidor (incluidos
    digital, cfd, forex y crypto, que este bot ni siquiera opera) y varios con
    esperas internas de 30 segundos. La pantalla de pares se pasaba de tiempo y
    salia "el puente no esta disponible".

    get_all_init_v2() devuelve de golpe, para turbo y binary: el nombre, si
    esta habilitado, si esta suspendido y la comision (de donde sale el payout).
    """
    now = time.time()
    if not force and _assets_cache['data'] and now - _assets_cache['ts'] < _ASSETS_TTL:
        return _assets_cache['data']

    with _lock:
        raw = _pedir_init_v2()

    if not raw:
        raise RuntimeError('el broker no devolvio la lista de activos')

    result = {}
    for kind in ('turbo', 'binary'):
        actives = ((raw.get(kind) or {}).get('actives') or {})
        for active in actives.values():
            # el nombre viene como "front.EURUSD-OTC"
            name = str(active.get('name', ''))
            name = name.split('.')[-1]
            if not name:
                continue

            is_open = active.get('enabled') is True and active.get('is_suspended') is not True

            payout = 0.0
            try:
                commission = active['option']['profit']['commission']
                payout = round(100.0 - float(commission), 2)
            except (KeyError, TypeError, ValueError):
                payout = 0.0

            anterior = result.get(name)
            # Si el par sale en turbo y en binary, se queda el que este abierto
            if anterior is None or (is_open and not anterior['open']):
                result[name] = {'open': is_open, 'kind': kind, 'payout': payout}

    _assets_cache['data'] = result
    _assets_cache['ts'] = now
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

    # Cerrar la sesion anterior SIN bloquear: si el cierre se atasca, el puente
    # entero se quedaria mudo y el sintoma seria "no se puede conectar al puente".
    anterior, iq_client = iq_client, None
    _cerrar_en_segundo_plano(anterior)
    if anterior is not None:
        time.sleep(1)  # margen para que el websocket viejo termine de morir
    _reset_estado_libreria()

    try:
        ok, result = _conectar_con_limite(email, password, account_type)
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
    _assets_cache['ts'] = 0

    # Se precarga la lista de pares en segundo plano: asi la pantalla de Pares
    # responde al instante en vez de tener que esperar al broker.
    def _precargar():
        try:
            _get_binary_assets(force=True)
            logger.info("Lista de pares precargada")
        except Exception as e:
            logger.warning("No se pudo precargar la lista de pares: %s", e)

    threading.Thread(target=_precargar, daemon=True).start()

    return jsonify({
        'success': True,
        'profile': result,
        'message': 'Conectado - Balance: $%.2f' % result['balance'],
    })


@app.route('/logout', methods=['POST'])
def logout():
    global iq_client
    # Primero se suelta la referencia, luego se cierra en segundo plano. Si se
    # hiciera al reves y el cierre se atascara, el siguiente login no podria
    # entrar nunca.
    anterior, iq_client = iq_client, None
    _cerrar_en_segundo_plano(anterior)
    _assets_cache['ts'] = 0
    _reset_estado_libreria()

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
        assets = _get_binary_assets()
    except Exception as e:
        logger.error("Error leyendo activos: %s", e)
        return _fail('Error leyendo activos: %s' % e, 500)

    result = []
    for name, info in assets.items():
        if name not in ACTIVES:
            # No se puede operar con iq.buy() si no esta en ACTIVES
            continue
        result.append({
            'id': name,
            'name': name,
            'isOTC': name.endswith('-OTC'),
            'open': info['open'],
            'kind': info['kind'],
            'payout': info['payout'],
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
            raw = _pedir_velas(pair, timeframe, count)
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
    payout = 0
    try:
        assets = _get_binary_assets()
        info = assets.get(pair)
        if info is not None and not info['open']:
            return _fail('El mercado de %s esta cerrado ahora mismo' % pair, 409)
        if info is not None:
            payout = info['payout']
    except Exception as e:
        logger.warning("No se pudo comprobar si %s esta abierto: %s", pair, e)

    expiration_minutes = max(1, int(round(expiration / 60.0)))

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
