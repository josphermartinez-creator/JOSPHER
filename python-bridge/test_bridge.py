"""
TEST - Verificar conexion a IQ Options
=======================================
Mismo metodo que tu otro bot que funciona.

USO:
    python test_bridge.py tu-email@gmail.com tu-password
"""

import sys
import time
import json
import requests

print("=" * 60)
print("  TEST - Verificando conexion a IQ Options")
print("=" * 60)
print()

# ====== PASO 1: Verificar modulos ======
print("[1/5] Verificando modulos...")

try:
    import requests
    print("  [OK] requests")
except ImportError:
    print("  [ERROR] requests no instalado")
    print("  Ejecuta: pip install requests")
    sys.exit(1)

try:
    import flask
    print("  [OK] flask")
except ImportError:
    print("  [ERROR] flask no instalado")
    print("  Ejecuta: pip install flask flask-cors")
    sys.exit(1)

try:
    import websocket
    print(f"  [OK] websocket-client version: {websocket.__version__}")
    if websocket.__version__ != "0.56":
        print(f"  [AVISO] Tu version: {websocket.__version__}")
        print(f"  [AVISO] iqoptionapi funciona mejor con websocket-client==0.56")
except ImportError:
    print("  [ERROR] websocket-client no instalado")
    print("  Ejecuta: pip install websocket-client==0.56")
    sys.exit(1)

print()

# ====== PASO 2: Verificar iqoptionapi ======
print("[2/5] Verificando iqoptionapi...")

try:
    from iqoptionapi.stable_api import IQ_Option
    print("  [OK] iqoptionapi.stable_api.IQ_Option disponible")
except ImportError:
    print("  [ERROR] iqoptionapi no instalada o version incorrecta")
    print()
    print("  Instala la version correcta:")
    print("    pip uninstall iqoptionapi -y")
    print("    pip install https://github.com/iqoptionapi/iqoptionapi/archive/refs/heads/master.zip")
    sys.exit(1)

print()

# ====== PASO 3: Verificar conexion a IQ Option (sin login) ======
print("[3/5] Verificando conexion a IQ Option...")

try:
    # Test simple: podemos alcanzar iqoption.com?
    r = requests.get("https://iqoption.com/", timeout=10, verify=False)
    print(f"  [OK] iqoption.com responde (HTTP {r.status_code})")
except Exception as e:
    print(f"  [ERROR] No se puede conectar a iqoption.com: {e}")
    print("  Verifica tu conexion a internet")
    sys.exit(1)

# Test del endpoint de login
try:
    r = requests.post("https://api.iqoption.com/api/login",
                      data={"email": "test@test.com", "password": "test"},
                      timeout=10, verify=False)
    if r.status_code == 404:
        print("  [ERROR] IQ Option bloqueo el endpoint de login (404)")
        print("  Esto puede ser por:")
        print("    1. Tu IP fue bloqueada por IQ Option")
        print("    2. Necesitas usar VPN")
        print("    3. IQ Option cambio su API")
    elif r.status_code == 200:
        print("  [OK] Endpoint de login responde")
    else:
        print(f"  [INFO] Endpoint de login responde HTTP {r.status_code}")
except Exception as e:
    print(f"  [ERROR] Error conectando a API de IQ Option: {e}")

print()

# ====== PASO 4: Probar login real ======
if len(sys.argv) < 3:
    print("[4/5] OMITIDO - No se proporcionaron credenciales")
    print("  Para probar conexion, ejecuta:")
    print("  python test_bridge.py tu-email@gmail.com tu-password")
    print()
    print("=" * 60)
    print("  TEST COMPLETADO (sin probar login)")
    print("=" * 60)
    sys.exit(0)

email = sys.argv[1]
password = sys.argv[2]

print(f"[4/5] Conectando a IQ Options como {email}...")

try:
    iq = IQ_Option(email, password)
    check, reason = iq.connect()

    if check:
        print("  [OK] CONECTADO a IQ Options!")
        try:
            balance = iq.get_balance()
            print(f"  [OK] Balance: ${balance:.2f}")
        except:
            print("  [OK] (no se pudo obtener balance)")
    else:
        print(f"  [ERROR] No se pudo conectar: {reason}")
        print()
        print("  Posibles causas:")
        print("    1. Credenciales incorrectas")
        print("    2. IQ Option bloqueo tu IP (espera 24h o usa VPN)")
        print("    3. Version incorrecta de websocket-client")
        print("       Solucion: pip install websocket-client==0.56")
        sys.exit(1)

except Exception as e:
    error_msg = str(e)
    print(f"  [ERROR] Error conectando: {error_msg}")

    if "Expecting value" in error_msg or "json" in error_msg.lower():
        print()
        print("  [DIAGNOSTICO] IQ Option esta devolviendo HTML en vez de JSON")
        print("  Esto significa que IQ Option BLOQUEO tu conexion.")
        print()
        print("  SOLUCIONES:")
        print("    1. Instala websocket-client==0.56:")
        print("       pip install websocket-client==0.56")
        print("    2. Espera 24h si IQ Option bloqueo tu IP")
        print("    3. Usa VPN")
        print("    4. Verifica que tu otro bot funciona con las mismas credenciales")

    sys.exit(1)

print()

# ====== PASO 5: Desconectar ======
print("[5/5] Desconectando...")
try:
    iq.disconnect()
    print("  [OK] Desconectado")
except:
    pass

print()
print("=" * 60)
print("  TODO OK - El puente Python funcionara correctamente")
print("=" * 60)
