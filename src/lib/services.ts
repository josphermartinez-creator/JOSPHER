/**
 * Acceso a los mini-servicios (IQ Option 3003 / AutoTrader 3004) desde el
 * servidor de Next.js.
 *
 * Antes cada ruta abría su propio socket con `path: '/'` copiado a mano.
 * Ese path no coincidía con el que usa el panel del navegador, así que el
 * Dashboard nunca llegaba a conectar con el auto-trader. Ahora todos usan el
 * path por defecto de socket.io y esta única implementación.
 */

export const IQ_SERVICE_URL = process.env.IQ_SERVICE_URL || 'http://localhost:3003';
export const AUTOTRADER_URL = process.env.AUTOTRADER_URL || 'http://localhost:3004';

const SOCKET_OPTIONS = {
  transports: ['websocket' as const, 'polling' as const],
  reconnection: false,
  timeout: 8000,
  forceNew: true,
};

/** Petición con respuesta (callback) a un mini-servicio. */
export async function serviceRequest<T = any>(
  url: string,
  event: string,
  payload?: any,
  timeoutMs = 15000,
): Promise<T & { success: boolean; error?: string }> {
  const io = await import('socket.io-client');
  const socket = io.default(url, SOCKET_OPTIONS);

  return new Promise((resolve) => {
    let done = false;

    const finish = (value: any) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { socket.disconnect(); } catch {}
      resolve(value);
    };

    const timer = setTimeout(
      () => finish({ success: false, error: `Sin respuesta de ${url} (${event})` }),
      timeoutMs,
    );

    socket.on('connect', () => {
      const args = payload === undefined ? [] : [payload];
      socket.emit(event, ...args, (res: any) => finish(res ?? { success: false, error: 'Respuesta vacía' }));
    });

    socket.on('connect_error', () => finish({ success: false, error: servicioCaido(url) }));
  });
}

/** Envío sin respuesta (fire-and-forget) a un mini-servicio. */
export async function serviceEmit(url: string, event: string, payload?: any): Promise<boolean> {
  try {
    const io = await import('socket.io-client');
    const socket = io.default(url, SOCKET_OPTIONS);

    return await new Promise<boolean>((resolve) => {
      let done = false;
      const finish = (ok: boolean) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        setTimeout(() => { try { socket.disconnect(); } catch {} }, 200);
        resolve(ok);
      };

      const timer = setTimeout(() => finish(false), 6000);

      socket.on('connect', () => {
        socket.emit(event, payload);
        setTimeout(() => finish(true), 300);
      });
      socket.on('connect_error', () => finish(false));
    });
  } catch {
    return false;
  }
}

/** Espera un evento concreto (por ejemplo 'login-result' o 'status'). */
export async function serviceWaitFor<T = any>(
  url: string,
  emitEvent: string,
  emitPayload: any,
  waitEvent: string,
  timeoutMs = 45000,
): Promise<T & { success: boolean; error?: string }> {
  const io = await import('socket.io-client');
  const socket = io.default(url, SOCKET_OPTIONS);

  return new Promise((resolve) => {
    let done = false;
    const finish = (value: any) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { socket.disconnect(); } catch {}
      resolve(value);
    };

    const timer = setTimeout(
      () => finish({ success: false, error: `Sin respuesta de ${url} (${emitEvent})` }),
      timeoutMs,
    );

    socket.on('connect', () => socket.emit(emitEvent, emitPayload));
    socket.on(waitEvent, (res: any) => finish(res ?? { success: false, error: 'Respuesta vacía' }));
    socket.on('connect_error', () => finish({ success: false, error: servicioCaido(url) }));
  });
}

/** Mensaje accionable cuando un mini-servicio no responde. */
export function servicioCaido(url: string): string {
  if (url.includes('3003')) {
    return 'El servicio IQ Option (puerto 3003) no está corriendo. Cierra todo y ejecuta arrancar.bat.';
  }
  if (url.includes('3004')) {
    return 'El auto-trader (puerto 3004) no está corriendo. Cierra todo y ejecuta arrancar.bat.';
  }
  return `No responde el servicio en ${url}. Ejecuta arrancar.bat.`;
}

/** Estado del servicio IQ Option vía su endpoint HTTP /health. */
export async function iqServiceHealth(): Promise<{
  up: boolean;
  bridgeUp: boolean;
  bridgeConnected: boolean;
}> {
  try {
    const res = await fetch(`${IQ_SERVICE_URL}/health`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { up: false, bridgeUp: false, bridgeConnected: false };
    const data = await res.json();
    return {
      up: true,
      bridgeUp: !!data.bridgeUp,
      bridgeConnected: !!data.bridgeConnected,
    };
  } catch {
    return { up: false, bridgeUp: false, bridgeConnected: false };
  }
}

/** Estado del auto-trader vía su endpoint HTTP /health. */
export async function autotraderHealth(): Promise<{ up: boolean; botActive: boolean; monitoring: boolean }> {
  try {
    const res = await fetch(`${AUTOTRADER_URL}/health`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { up: false, botActive: false, monitoring: false };
    const data = await res.json();
    return { up: true, botActive: !!data.botActive, monitoring: !!data.monitoring };
  } catch {
    return { up: false, botActive: false, monitoring: false };
  }
}
