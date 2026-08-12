"""
Quantum Bot - Instalador de iqoptionapi
========================================
Instala la MISMA versión que tu otro bot que funciona.

USO:
    python instalar_iqoptionapi.py
"""

import os
import sys
import subprocess

# URL exacta que usa tu otro bot (de requirements.txt)
URL = "https://github.com/iqoptionapi/iqoptionapi/archive/refs/heads/master.zip"

def run(cmd):
    print(f"  > {cmd}")
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if result.stdout:
        print(f"    {result.stdout.strip()[:300]}")
    if result.returncode != 0 and result.stderr:
        print(f"    STDERR: {result.stderr.strip()[:300]}")
    return result.returncode == 0

def main():
    print("=" * 60)
    print("  Instalador de iqoptionapi (version GitHub)")
    print("  Misma version que tu otro bot")
    print("=" * 60)
    print()

    # Paso 1: Desinstalar version vieja
    print("[1/4] Desinstalando version vieja...")
    run("pip uninstall iqoptionapi -y")
    run("pip uninstall websocket-client -y")
    print()

    # Paso 2: Instalar requests
    print("[2/4] Instalando requests...")
    run("pip install requests")
    print()

    # Paso 3: Instalar iqoptionapi desde GitHub (URL exacta de tu otro bot)
    print("[3/4] Instalando iqoptionapi desde GitHub...")
    print(f"  URL: {URL}")
    success = run(f'pip install "{URL}"')
    if not success:
        print()
        print("  [ERROR] No se pudo instalar desde GitHub")
        print()
        print("  Instala manualmente abriendo CMD y ejecutando:")
        print(f'  pip install "{URL}"')
        return False
    print()

    # Paso 4: Verificar
    print("[4/4] Verificando instalacion...")
    success = run('python -c "from iqoptionapi.stable_api import IQ_Option; print(\'OK - iqoptionapi instalada correctamente\')"')
    if not success:
        print()
        print("  [ERROR] La verificacion fallo")
        return False

    print()
    print("=" * 60)
    print("  INSTALACION COMPLETADA!")
    print("  iqoptionapi version GitHub instalada correctamente")
    print("=" * 60)
    print()
    print("  Ahora puedes ejecutar: arrancar.bat")
    print()
    input("Presiona Enter para cerrar...")
    return True

if __name__ == "__main__":
    main()
