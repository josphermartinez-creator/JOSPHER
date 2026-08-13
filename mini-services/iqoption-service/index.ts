/**
 * IQ Options Service - puerta de entrada al broker
 * Puerto: 3003
 *
 * Es un simple proxy entre el resto del bot y el puente Python (5005).
 *
 * REGLA DE ORO: este servicio NO inventa datos.
 * Antes devolvia velas simuladas y ordenes "demo" con success:true cuando el
 * puente fallaba. Eso hacia que el bot analizara ruido aleatorio y registrara
 * operaciones que el broker nunca vio. Ahora, si el broker no responde, se
 * devuelve un error y el bot se queda quieto.
 */

import { createServer } from 'http';
import { Server } from 'socket.io';

const PORT = 3003;
const PYTHON_BRIDGE_URL = process.env.PYTHON_BRIDGE_URL || 'http://localhost:5005';

// ====== Estado ======
let bridgeUp = false;        // el proceso Python responde
let bridgeConnected = false; // ademas hay sesion viva en IQ Option
let profile: any = null;
let accountType: 'PRACTICE' | 'REAL' = 'PRACTICE';
let lastBridgeCheck = 0;
let fallosSeguidos = 0;

interface BridgeResult<T = any> {
  success: boolean;
  error?: string;
  data?: T;
}

// ====== Helpers HTTP contra el puente ======
async function bridgeFetch(path: string, init: RequestInit = {}, timeoutMs = 8000): Promise<BridgeResult> {
  try {
    const res = await fetch(`${PYTHON_BRIDGE_URL}${path}`, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    });

    let data: any = null;
    try {
      data = await res.json();
    } catch {
      return { success: false, error: `Respuesta ilegible del puente (HTTP ${res.status})` };
    }

    if (!res.ok || data?.success === false) {
      return { success: false, error: data?.error || `Error del puente (HTTP ${res.status})` };
    }

    return { success: true, data };
  } catch (e: any) {
    const reason = e?.name === 'TimeoutError' ? 'tiempo de espera agotado' : e?.message || 'sin conexion';
    return { success: false, error: `Puente Python no disponible (${reason})` };
  }
}

/** Comprueba el puente. cachea 3s para no saturarlo. */
async function checkBridge(force = false): Promise<{ up: boolean; connected: boolean }> {
  const now = Date.now();
  if (!force && now - lastBridgeCheck < 3000) {
    return { up: bridgeUp, connected: bridgeConnected };
  }
  lastBridgeCheck = now;

  // 10s, no 3: si el puente esta atendiendo una peticion pesada, con 3s se
  // daba por caido y el bot decia "el puente se desconecto" sin ser verdad.
  const res = await bridgeFetch('/health', {}, 10000);

  if (res.success) {
    fallosSeguidos = 0;
    bridgeUp = true;
    bridgeConnected = res.data?.connected === true;
  } else {
    // Un fallo suelto no basta para dar el puente por caido: puede estar
    // ocupado con una peticion larga. Hacen falta dos seguidos.
    fallosSeguidos++;
    if (fallosSeguidos >= 2) {
      bridgeUp = false;
      bridgeConnected = false;
    }
    console.log(`[IQ Service] Salud del puente fallida (${fallosSeguidos}): ${res.error}`);
  }

  return { up: bridgeUp, connected: bridgeConnected };
}

function currentStatus() {
  return {
    bridgeUp,
    bridgeConnected,
    connected: bridgeConnected,
    hasProfile: !!profile,
    accountType,
    mode: bridgeConnected ? 'REAL' : 'OFFLINE',
  };
}

/** Exige sesion viva en el broker antes de cualquier operacion con dinero o datos. */
async function requireBroker(): Promise<string | null> {
  const { up, connected } = await checkBridge(true);
  if (!up) {
    return 'El puente Python no esta corriendo. Arranca python-bridge/iqoption_bridge.py';
  }
  if (!connected) {
    return 'No hay sesion abierta en IQ Option. Inicia sesion en el bot.';
  }
  return null;
}

// ====== Servidor HTTP + Socket.io ======
// socket.io se queda con /socket.io/*, el resto de rutas las atiende este handler.
const httpServer = createServer((req, res) => {
  if (req.url?.startsWith('/health')) {
    // Comprobacion FORZADA: si aqui se devolviera el estado cacheado, la app
    // podria arrancar el bot creyendo que hay sesion cuando ya se cayo.
    checkBridge(true)
      .catch(() => {})
      .then(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', service: 'iqoption-service', ...currentStatus() }));
      });
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
});

setInterval(() => { checkBridge(true).catch(() => {}); }, 10000);
checkBridge(true).catch(() => {});

// ====== Handlers ======
io.on('connection', (socket) => {
  console.log(`[IQ Service] Cliente conectado: ${socket.id}`);
  socket.emit('status', currentStatus());

  socket.on('login', async (data: { email: string; password: string; accountType: 'PRACTICE' | 'REAL' }) => {
    console.log(`[IQ Service] Login: ${data?.email}`);

    const { up } = await checkBridge(true);
    if (!up) {
      socket.emit('login-result', {
        success: false,
        error: 'El puente Python no esta corriendo. Arranca python-bridge/iqoption_bridge.py y vuelve a intentarlo.',
      });
      return;
    }

    const res = await bridgeFetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: data?.email,
        password: data?.password,
        accountType: data?.accountType || 'PRACTICE',
      }),
    }, 45000); // el login de IQ Option puede tardar

    if (!res.success) {
      console.log(`[IQ Service] Login rechazado: ${res.error}`);
      socket.emit('login-result', { success: false, error: res.error });
      return;
    }

    bridgeConnected = true;
    accountType = data?.accountType || 'PRACTICE';
    profile = res.data.profile;

    console.log(`[IQ Service] Login REAL correcto: ${data.email} (${accountType})`);
    socket.emit('login-result', { success: true, profile, mode: 'REAL', message: res.data.message });
    io.emit('connected', { profile, mode: 'REAL' });
  });

  socket.on('logout', async () => {
    await bridgeFetch('/logout', { method: 'POST' }, 5000);
    bridgeConnected = false;
    profile = null;
    io.emit('disconnected');
  });

  socket.on('get-status', () => socket.emit('status', currentStatus()));

  socket.on('get-candles', async (
    data: { pair: string; count?: number; timeframe?: number },
    callback?: (res: any) => void,
  ) => {
    if (!callback) return;

    const blocked = await requireBroker();
    if (blocked) {
      callback({ success: false, error: blocked, source: 'none' });
      return;
    }

    const pair = data?.pair;
    const count = data?.count || 80;
    const timeframe = data?.timeframe || 60;

    const res = await bridgeFetch(
      `/candles?pair=${encodeURIComponent(pair)}&count=${count}&timeframe=${timeframe}`,
      {},
      10000,
    );

    if (!res.success || !res.data?.candles?.length) {
      callback({ success: false, error: res.error || `Sin velas para ${pair}`, source: 'none' });
      return;
    }

    // source:'real' es la unica forma de que el auto-trader acepte estas velas
    callback({ success: true, candles: res.data.candles, source: 'real', pair });
  });

  socket.on('get-assets', async (callback?: (res: any) => void) => {
    if (!callback) return;

    const blocked = await requireBroker();
    if (blocked) {
      callback({ success: false, error: blocked });
      return;
    }

    // La primera carga puede tardar: el broker devuelve cientos de activos.
    // Con 20s se agotaba el tiempo y salia "el puente no esta disponible".
    const res = await bridgeFetch('/assets', {}, 45000);
    if (!res.success) {
      callback({ success: false, error: res.error });
      return;
    }
    callback({ success: true, assets: res.data.assets });
  });

  socket.on('place-order', async (
    data: { pair: string; direction: 'CALL' | 'PUT'; amount: number; expiration: number },
    callback?: (res: any) => void,
  ) => {
    if (!callback) return;

    console.log(`[IQ Service] Orden solicitada: ${data?.pair} ${data?.direction} $${data?.amount}`);

    const blocked = await requireBroker();
    if (blocked) {
      // Antes aqui se devolvia success:true con un orderId falso. Nunca mas.
      console.log(`[IQ Service] Orden NO enviada: ${blocked}`);
      callback({ success: false, error: blocked });
      return;
    }

    const res = await bridgeFetch('/place-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }, 20000);

    if (!res.success) {
      console.log(`[IQ Service] Orden rechazada: ${res.error}`);
      callback({ success: false, error: res.error });
      return;
    }

    console.log(`[IQ Service] Orden REAL colocada: ${data.pair} ${data.direction} (ID ${res.data.orderId})`);
    callback({ success: true, ...res.data });
  });

  socket.on('check-result', async (data: { orderId: string }, callback?: (res: any) => void) => {
    if (!callback) return;

    const blocked = await requireBroker();
    if (blocked) {
      callback({ success: false, error: blocked });
      return;
    }

    const res = await bridgeFetch(`/check-result/${encodeURIComponent(data?.orderId)}`, {}, 10000);
    if (!res.success) {
      callback({ success: false, error: res.error });
      return;
    }
    callback({ success: true, ...res.data });
  });

  socket.on('get-balance', async (callback?: (res: any) => void) => {
    if (!callback) return;

    const blocked = await requireBroker();
    if (blocked) {
      callback({ success: false, error: blocked });
      return;
    }

    const res = await bridgeFetch('/balance', {}, 10000);
    callback(res.success ? { success: true, balance: res.data.balance } : { success: false, error: res.error });
  });

  socket.on('disconnect', () => {
    console.log(`[IQ Service] Cliente desconectado: ${socket.id}`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`[IQ Option Service] escuchando en el puerto ${PORT}`);
  console.log(`[IQ Option Service] puente Python esperado en ${PYTHON_BRIDGE_URL}`);
  console.log(`[IQ Option Service] sin puente NO se opera (ya no hay modo demo silencioso)`);
});

process.on('SIGTERM', () => httpServer.close(() => process.exit(0)));
process.on('SIGINT', () => httpServer.close(() => process.exit(0)));
