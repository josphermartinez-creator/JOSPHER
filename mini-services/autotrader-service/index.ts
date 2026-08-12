/**
 * Auto-Trader Service - el bot automatico
 * Puerto: 3004
 *
 * Monitorea velas REALES y ejecuta operaciones REALES cuando la estrategia
 * "Indecision, Fuerza y Continuidad" da señal.
 *
 * Reglas que este servicio respeta siempre:
 *   1. Si las velas no vienen del broker (source !== 'real'), no se opera.
 *   2. Si la orden no la confirma el broker, no se registra nada.
 *   3. El resultado de una operacion lo dice el broker, nunca se adivina.
 *   4. Abrir una operacion nunca bloquea el bucle de analisis.
 */

import { io as ioClient } from 'socket.io-client';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { detectSignal, estados, type Candle, type Signal } from './strategy';

const PORT = 3004;
const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const IQ_SERVICE_URL = process.env.IQ_SERVICE_URL || 'http://localhost:3003';

const MAX_PAIRS = 10;
const COOLDOWN_MS = 60_000;          // espera minima entre operaciones del mismo par
const RESOLVE_INTERVAL_MS = 5_000;   // cada cuanto se preguntan resultados al broker
const RESOLVE_GIVEUP_MS = 15 * 60_000;
const SETTINGS_TTL_MS = 5_000;

// ====== Estado del bot ======
let botActive = false;
let monitoring = false;
let runId = 0;                        // invalida bucles viejos (evita duplicados)
let sessionProfit = 0;                // P&L desde que se pulso Iniciar
let sessionStartedAt: Date | null = null;

const lastOperationTime: Record<string, number> = {};

const stats = {
  totalChecked: 0,
  totalSignals: 0,
  totalOperations: 0,
  wins: 0,
  losses: 0,
  lastCheck: null as Date | null,
  lastSignal: null as any,
  lastOperation: null as any,
  lastError: null as string | null,
};

// ====== Servidor ======
const httpServer = createServer((req, res) => {
  if (req.url?.startsWith('/health')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'autotrader', botActive, monitoring }));
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

function log(type: 'INFO' | 'MARKET' | 'WARNING' | 'ERROR' | 'SUCCESS', message: string, pair?: string) {
  const prefix = { INFO: 'i', MARKET: '~', WARNING: '!', ERROR: 'x', SUCCESS: '+' }[type];
  console.log(`[AutoTrader] ${prefix} ${message}`);
  io.emit('log', { type, message, pair, time: new Date().toISOString() });
}

function sleep(ms: number): Promise<void> {
  return new Promise<void>(resolve => { setTimeout(resolve, ms); });
}

// ====== Conexion UNICA y persistente con el servicio IQ ======
// Antes se abria un socket nuevo por cada peticion de velas y por cada orden:
// eso metia segundos de latencia justo en el momento de entrar al mercado.
const iqSocket = ioClient(IQ_SERVICE_URL, {
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 2000,
  timeout: 8000,
});

iqSocket.on('connect', () => console.log('[AutoTrader] Conectado al servicio IQ'));
iqSocket.on('disconnect', (reason) => console.log(`[AutoTrader] Servicio IQ desconectado: ${reason}`));
iqSocket.on('connect_error', () => {});

function iqRequest<T = any>(event: string, payload: any, timeoutMs = 12000): Promise<T> {
  return new Promise((resolve) => {
    if (!iqSocket.connected) {
      resolve({ success: false, error: 'Sin conexion con el servicio IQ Option' } as any);
      return;
    }
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      resolve({ success: false, error: `Sin respuesta del servicio IQ (${event})` } as any);
    }, timeoutMs);

    const args = payload === undefined ? [] : [payload];
    iqSocket.emit(event, ...args, (res: any) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(res ?? ({ success: false, error: 'Respuesta vacia' } as any));
    });
  });
}

// ====== App (Next.js) ======
let settingsCache: { data: any; ts: number } | null = null;

async function getSettings(force = false): Promise<any | null> {
  if (!force && settingsCache && Date.now() - settingsCache.ts < SETTINGS_TTL_MS) {
    return settingsCache.data;
  }
  try {
    const res = await fetch(`${APP_URL}/api/account`, { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    if (!data.success) return null;
    const value = { account: data.account, settings: data.account?.settings };
    settingsCache = { data: value, ts: Date.now() };
    return value;
  } catch (e: any) {
    stats.lastError = `No se pudo leer la configuracion: ${e.message}`;
    return null;
  }
}

async function apiFetch(path: string, init?: RequestInit): Promise<any | null> {
  try {
    const res = await fetch(`${APP_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
      signal: AbortSignal.timeout(10000),
    });
    return await res.json();
  } catch (e: any) {
    stats.lastError = `Error llamando a ${path}: ${e.message}`;
    console.error(`[AutoTrader] ${stats.lastError}`);
    return null;
  }
}

async function notifyTelegram(settings: any, notification: any) {
  if (!settings?.telegramEnabled || !settings?.telegramBotToken) return;
  await apiFetch('/api/telegram', {
    method: 'POST',
    body: JSON.stringify({ action: 'notify_operation', notification }),
  });
}

// ====== Velas ======
/** Devuelve velas SOLO si vienen del broker. null en cualquier otro caso. */
async function getRealCandles(pair: string, count = 80): Promise<Candle[] | null> {
  const res = await iqRequest<any>('get-candles', { pair, count, timeframe: 60 }, 12000);

  if (!res?.success) {
    log('WARNING', `${pair}: ${res?.error || 'sin velas'}`, pair);
    return null;
  }
  if (res.source !== 'real') {
    // Cinturon de seguridad: aunque alguien reintroduzca un modo demo,
    // el bot no operara con datos que no sean del broker.
    log('WARNING', `${pair}: velas descartadas, no son reales (source=${res.source})`, pair);
    return null;
  }

  const candles: Candle[] = res.candles || [];
  if (candles.length < 10) {
    log('WARNING', `${pair}: solo ${candles.length} velas, insuficiente`, pair);
    return null;
  }

  // Proteccion contra datos viejos: la ultima vela no puede tener mas de 3 minutos
  const lastTime = candles[candles.length - 1].time;
  const ageSec = Math.floor(Date.now() / 1000) - lastTime;
  if (ageSec > 180) {
    log('WARNING', `${pair}: velas desactualizadas (${Math.round(ageSec / 60)} min)`, pair);
    return null;
  }

  return candles;
}

// ====== Estrategia (modulo aparte, ver strategy.ts) ======

// ====== Gestion de riesgo ======
interface Riesgo {
  amount: number;
  martingaleLevel: number;
  motivoBloqueo: string | null;
}

// Nivel de martingala por par (se reinicia al ganar)
const martingaleLevel: Record<string, number> = {};

/**
 * Importe de la proxima operacion.
 * - base:      defaultAmount
 * - martingala: base * factor^nivel (si esta activada y no supera martingaleLevels)
 * - techo:     riskPerOperation % del capital inicial (si es > 0)
 */
function calcularImporte(pair: string, settings: any): Riesgo {
  const base = Number(settings?.defaultAmount) || 1;
  const capital = Number(settings?.initialCapital) || 0;
  let level = 0;
  let amount = base;

  if (settings?.martingaleEnabled) {
    const maxLevels = Number(settings?.martingaleLevels) || 0;
    const factor = Number(settings?.martingaleFactor) || 2;
    level = Math.min(martingaleLevel[pair] || 0, maxLevels);
    amount = base * Math.pow(factor, level);
  } else {
    martingaleLevel[pair] = 0;
  }

  const risk = Number(settings?.riskPerOperation) || 0;
  if (risk > 0 && capital > 0) {
    const techo = capital * risk / 100;
    if (amount > techo) {
      amount = techo;
    }
  }

  amount = Math.round(amount * 100) / 100;

  if (amount < 1) {
    return { amount, martingaleLevel: level, motivoBloqueo: `importe calculado demasiado bajo ($${amount})` };
  }
  return { amount, martingaleLevel: level, motivoBloqueo: null };
}

interface ResumenDia {
  operaciones: number;
  profit: number;
}

async function resumenDelDia(): Promise<ResumenDia> {
  const data = await apiFetch('/api/operations?limit=500&scope=real');
  if (!data?.success || !Array.isArray(data.operations)) {
    return { operaciones: 0, profit: 0 };
  }
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const hoy = data.operations.filter((op: any) => new Date(op.openedAt) >= todayStart);
  return {
    operaciones: hoy.length,
    profit: hoy.reduce((sum: number, op: any) => sum + (Number(op.profit) || 0), 0),
  };
}

/** Limites que detienen el bot. Devuelve el motivo o null. */
function comprobarLimites(settings: any, dia: ResumenDia): string | null {
  const capital = Number(settings?.initialCapital) || 0;

  if (capital > 0 && Number(settings?.maxDailyLoss) > 0) {
    const limite = -(capital * Number(settings.maxDailyLoss) / 100);
    if (dia.profit <= limite) {
      return `perdida maxima diaria alcanzada ($${dia.profit.toFixed(2)} de $${limite.toFixed(2)})`;
    }
  }

  if (capital > 0 && settings?.stopLossEnabled && Number(settings?.stopLossValue) > 0) {
    const limite = -(capital * Number(settings.stopLossValue) / 100);
    if (sessionProfit <= limite) {
      return `stop loss de sesion alcanzado ($${sessionProfit.toFixed(2)} de $${limite.toFixed(2)})`;
    }
  }

  if (capital > 0 && settings?.takeProfitEnabled && Number(settings?.takeProfitValue) > 0) {
    const objetivo = capital * Number(settings.takeProfitValue) / 100;
    if (sessionProfit >= objetivo) {
      return `take profit alcanzado (+$${sessionProfit.toFixed(2)} de +$${objetivo.toFixed(2)})`;
    }
  }

  return null;
}

// ====== Operaciones pendientes ======
interface PendingOp {
  operationId: string;
  orderId: string;
  pair: string;
  direction: 'CALL' | 'PUT';
  amount: number;
  payout: number;
  expiry: number;
  confidence: number;
  reason: string;
  martingaleLevel: number;
  entryPrice: number;
  openedAt: number;
  expiresAt: number;
  settings: any;
}

const pending = new Map<string, PendingOp>();

/**
 * Abre una operacion REAL.
 * No espera al resultado: lo resuelve resolverPendientes() por su cuenta, para
 * que el bucle de analisis no se quede 65 segundos parado tras cada entrada.
 */
async function abrirOperacion(
  pair: string,
  signal: Signal,
  settings: any,
  origen: 'AUTO' | 'MANUAL',
  importeForzado?: number,
): Promise<{ ok: boolean; error?: string; operationId?: string }> {
  const expiry = Number(settings?.defaultExpiry) || 1;
  const riesgo = calcularImporte(pair, settings);
  const amount = importeForzado ?? riesgo.amount;

  if (importeForzado === undefined && riesgo.motivoBloqueo) {
    return { ok: false, error: riesgo.motivoBloqueo };
  }

  // 1) Orden al broker. Sin confirmacion, no se registra NADA.
  const order = await iqRequest<any>('place-order', {
    pair,
    direction: signal.direction,
    amount,
    expiration: expiry * 60,
  }, 25000);

  if (!order?.success || !order.orderId) {
    return { ok: false, error: order?.error || 'El broker rechazo la orden' };
  }
  if (order.demo === true || String(order.orderId).startsWith('demo-')) {
    return { ok: false, error: 'Respuesta de orden simulada: no se registra' };
  }

  const payout = Number(order.payout) > 0 ? Number(order.payout) : 0;

  // 2) Registro en la app como PENDING, con el id del broker
  const created = await apiFetch('/api/operations', {
    method: 'POST',
    body: JSON.stringify({
      pair,
      direction: signal.direction,
      amount,
      expiry,
      entryPrice: signal.entryPrice,
      result: 'PENDING',
      payout,
      martingaleLevel: riesgo.martingaleLevel,
      reason: signal.reason,
      confidence: signal.confidence,
      strategy: 'INDECISION_FUERZA_CONTINUIDAD',
      brokerOrderId: String(order.orderId),
      source: origen,
    }),
  });

  if (!created?.success || !created.operation?.id) {
    // La orden YA esta en el broker: avisar bien fuerte, no callar.
    log('ERROR', `Orden ${order.orderId} colocada en el broker pero NO se pudo guardar en la app`);
  }

  const expirationMinutes = Number(order.expirationMinutes) || expiry;
  const op: PendingOp = {
    operationId: created?.operation?.id || '',
    orderId: String(order.orderId),
    pair,
    direction: signal.direction,
    amount,
    payout,
    expiry,
    confidence: signal.confidence,
    reason: signal.reason,
    martingaleLevel: riesgo.martingaleLevel,
    entryPrice: signal.entryPrice,
    openedAt: Date.now(),
    // el broker redondea al cierre de minuto; se añade margen antes de preguntar
    expiresAt: Date.now() + expirationMinutes * 60_000 + 10_000,
    settings,
  };
  pending.set(op.orderId, op);

  lastOperationTime[pair] = Date.now();
  stats.totalOperations++;
  stats.lastOperation = { pair, direction: signal.direction, amount, time: new Date().toISOString() };

  log('SUCCESS', `Orden REAL ${origen}: ${pair} ${signal.direction} $${amount} (broker ID ${order.orderId})`, pair);
  io.emit('operation-opened', {
    pair,
    direction: signal.direction,
    amount,
    payout,
    confidence: signal.confidence,
    reason: signal.reason,
    orderId: op.orderId,
    time: new Date().toISOString(),
  });

  await notifyTelegram(settings, {
    title: `OPERACION ABIERTA (${origen})`,
    pair,
    direction: signal.direction,
    amount,
    payout,
    profit: 0,
    confidence: signal.confidence,
    expiry,
    reason: signal.reason,
    time: new Date().toLocaleTimeString('es-ES'),
    result: 'PENDING',
  });

  return { ok: true, operationId: op.operationId };
}

/** Pregunta al broker por las operaciones vencidas y cierra las que ya tienen resultado. */
async function resolverPendientes() {
  if (pending.size === 0) return;

  for (const [orderId, op] of Array.from(pending.entries())) {
    if (Date.now() < op.expiresAt) continue;

    const res = await iqRequest<any>('check-result', { orderId }, 12000);

    if (!res?.success) {
      if (Date.now() - op.openedAt > RESOLVE_GIVEUP_MS) {
        log('ERROR', `No se pudo confirmar el resultado de ${op.pair} (orden ${orderId}). Queda PENDIENTE en el historial.`, op.pair);
        pending.delete(orderId);
      }
      continue;
    }

    if (res.status !== 'closed') {
      if (Date.now() - op.openedAt > RESOLVE_GIVEUP_MS) {
        log('WARNING', `El broker sigue sin cerrar ${op.pair} (orden ${orderId}) tras 15 min`, op.pair);
        pending.delete(orderId);
      }
      continue;
    }

    pending.delete(orderId);

    const result: 'WIN' | 'LOSS' | 'DRAW' = res.result;
    const profit = Number(res.profit) || 0;

    // Martingala: sube un nivel al perder, se reinicia al ganar
    if (result === 'WIN') {
      martingaleLevel[op.pair] = 0;
      stats.wins++;
    } else if (result === 'LOSS') {
      const max = Number(op.settings?.martingaleLevels) || 0;
      martingaleLevel[op.pair] = Math.min((martingaleLevel[op.pair] || 0) + 1, max);
      stats.losses++;
    }

    sessionProfit += profit;

    if (op.operationId) {
      await apiFetch(`/api/operations/${op.operationId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          result,
          profit,
          entryPrice: res.entryPrice ?? op.entryPrice,
          exitPrice: res.exitPrice ?? null,
        }),
      });
    }

    // El saldo real lo dice el broker, no una suma local
    const balance = await iqRequest<any>('get-balance', undefined, 10000);
    if (balance?.success) {
      await apiFetch('/api/account', {
        method: 'PUT',
        body: JSON.stringify({ balance: balance.balance }),
      });
    }

    log(
      result === 'WIN' ? 'SUCCESS' : 'WARNING',
      `${op.pair} ${result}: ${profit >= 0 ? '+' : ''}$${profit.toFixed(2)} (orden ${orderId})`,
      op.pair,
    );

    io.emit('operation-executed', {
      pair: op.pair,
      signal: { direction: op.direction, confidence: op.confidence, reason: op.reason },
      result: {
        isWin: result === 'WIN',
        profit,
        realOrder: true,
        operation: { id: op.operationId, amount: op.amount, payout: op.payout },
      },
    });

    await notifyTelegram(op.settings, {
      title: result === 'WIN' ? 'OPERACION GANADA' : result === 'DRAW' ? 'OPERACION EMPATE' : 'OPERACION PERDIDA',
      pair: op.pair,
      direction: op.direction,
      amount: op.amount,
      payout: op.payout,
      profit,
      confidence: op.confidence,
      expiry: op.expiry,
      reason: op.reason,
      time: new Date().toLocaleTimeString('es-ES'),
      result,
    });
  }
}

setInterval(() => { resolverPendientes().catch(e => console.error('[AutoTrader] resolver:', e)); }, RESOLVE_INTERVAL_MS);

// ====== Ciclo de analisis ======

/** Espera al inicio exacto del proximo minuto (la vela de continuidad). */
function esperarProximaVela(): Promise<void> {
  const now = Date.now();
  const msAlMinuto = 60_000 - (now % 60_000);
  // 400 ms de margen para que el broker tenga la vela anterior ya cerrada
  return sleep(msAlMinuto + 400);
}

async function detenerBot(motivo: string) {
  botActive = false;
  settingsCache = null;
  await apiFetch('/api/bot', { method: 'POST', body: JSON.stringify({ action: 'stop', silent: true }) });
  log('WARNING', `Bot detenido: ${motivo}`);
  io.emit('bot-stopped', { reason: motivo });
}

async function ciclo(): Promise<void> {
  const configData = await getSettings(true);
  if (!configData) {
    log('WARNING', 'No se pudo leer la configuracion de la app, reintentando');
    return;
  }

  const { account, settings } = configData;

  if (!account?.isConnected) {
    await detenerBot('la cuenta no esta conectada al broker');
    return;
  }
  if (!settings?.botActive) {
    await detenerBot('el bot se desactivo desde la app');
    return;
  }

  // Pares configurados
  let pairs: string[] = [];
  try {
    const parsed = JSON.parse(settings.selectedPairs || '[]');
    if (Array.isArray(parsed)) pairs = parsed.filter(Boolean);
  } catch {}

  if (pairs.length === 0) {
    log('WARNING', 'No hay pares seleccionados. Elige al menos uno en la pestaña Pares.');
    return;
  }

  const pairsToCheck = pairs.slice(0, MAX_PAIRS);
  stats.totalChecked += pairsToCheck.length;
  stats.lastCheck = new Date();

  // Limites de riesgo
  const dia = await resumenDelDia();
  const bloqueo = comprobarLimites(settings, dia);
  if (bloqueo) {
    await detenerBot(bloqueo);
    return;
  }

  const maxDailyOps = Number(settings?.maxDailyOperations) || 20;
  const quedanOps = maxDailyOps - dia.operaciones;

  io.emit('monitoring-status', {
    pairs: pairsToCheck,
    todayOps: dia.operaciones,
    maxDailyOps,
    todayProfit: dia.profit,
    sessionProfit,
    pending: pending.size,
    cooldowns: Object.entries(lastOperationTime)
      .map(([pair, time]) => ({ pair, remaining: Math.max(0, COOLDOWN_MS - (Date.now() - time)) }))
      .filter(c => c.remaining > 0),
    stats,
  });

  if (quedanOps <= 0) {
    log('WARNING', `Limite diario alcanzado (${dia.operaciones}/${maxDailyOps} operaciones)`);
    return;
  }

  // Velas de todos los pares EN PARALELO: antes se pedian de una en una y el
  // barrido no cabia en la ventana de entrada.
  const resultados = await Promise.all(
    pairsToCheck.map(async (pair) => ({ pair, candles: await getRealCandles(pair, 80) })),
  );

  const minConfidence = (() => {
    try {
      return Number(JSON.parse(settings.strategyConfig || '{}').minConfidence) || 65;
    } catch {
      return 65;
    }
  })();

  let abiertasEsteCiclo = 0;

  for (const { pair, candles } of resultados) {
    if (!botActive) break;
    if (!candles) continue;

    try {
      const signal = detectSignal(pair, candles, log);
      if (!signal) continue;

      stats.totalSignals++;
      stats.lastSignal = { pair, ...signal, time: new Date().toISOString() };
      io.emit('signal-detected', { pair, signal });

      if (signal.confidence < minConfidence) {
        log('INFO', `${pair}: señal descartada, confianza ${signal.confidence}% < ${minConfidence}%`, pair);
        continue;
      }

      const cooldown = COOLDOWN_MS - (Date.now() - (lastOperationTime[pair] || 0));
      if (cooldown > 0) {
        log('INFO', `${pair}: señal descartada, en espera ${Math.ceil(cooldown / 1000)}s`, pair);
        continue;
      }

      if (Array.from(pending.values()).some(p => p.pair === pair)) {
        log('INFO', `${pair}: señal descartada, ya hay una operacion abierta en este par`, pair);
        continue;
      }

      if (abiertasEsteCiclo >= quedanOps) {
        log('WARNING', `Limite diario alcanzado durante el ciclo (${maxDailyOps})`);
        break;
      }

      const res = await abrirOperacion(pair, signal, settings, 'AUTO');
      if (res.ok) {
        abiertasEsteCiclo++;
      } else {
        log('ERROR', `${pair}: no se pudo abrir la operacion - ${res.error}`, pair);
      }
    } catch (e: any) {
      // Un fallo en un par no puede tumbar el bucle entero
      log('ERROR', `${pair}: error inesperado - ${e.message}`, pair);
    }
  }
}

async function monitorLoop(myRunId: number) {
  monitoring = true;
  io.emit('bot-started', { time: new Date().toISOString() });

  try {
    while (botActive && myRunId === runId) {
      await esperarProximaVela();
      if (!botActive || myRunId !== runId) break;

      try {
        await ciclo();
      } catch (e: any) {
        // El bucle NUNCA muere por una excepcion: antes cualquier fallo de red
        // lo mataba y el panel seguia diciendo "EN VIVO".
        stats.lastError = e.message;
        log('ERROR', `Error en el ciclo: ${e.message}. Se reintenta en el proximo minuto.`);
      }
    }
  } finally {
    if (myRunId === runId) {
      monitoring = false;
      io.emit('status', { botActive, monitoring, stats });
    }
  }
}

// ====== Socket.io ======
io.on('connection', (socket) => {
  console.log(`[AutoTrader] Cliente conectado: ${socket.id}`);
  socket.emit('status', { botActive, monitoring, stats, pending: pending.size });

  socket.on('start', async () => {
    if (botActive) {
      socket.emit('status', { botActive, monitoring, stats });
      return;
    }
    botActive = true;
    sessionProfit = 0;
    sessionStartedAt = new Date();
    settingsCache = null;
    estados.clear();
    runId++;
    log('INFO', 'Bot automatico iniciado');
    monitorLoop(runId); // el runId invalida cualquier bucle anterior
  });

  socket.on('stop', () => {
    botActive = false;
    runId++;
    monitoring = false;
    log('INFO', 'Bot automatico detenido por el usuario');
    io.emit('bot-stopped', { reason: 'Detenido por el usuario' });
  });

  socket.on('get-status', () => {
    socket.emit('status', {
      botActive,
      monitoring,
      stats,
      pending: pending.size,
      sessionProfit,
      sessionStartedAt,
    });
  });

  socket.on('get-stats', () => socket.emit('stats', stats));

  /** Entrada manual desde la pestaña Estrategia. Misma via que las automaticas. */
  socket.on('manual-order', async (data: any, callback?: (res: any) => void) => {
    const configData = await getSettings(true);
    if (!configData?.account?.isConnected) {
      callback?.({ success: false, error: 'La cuenta no esta conectada al broker' });
      return;
    }

    const signal: Signal = {
      direction: data?.direction === 'PUT' ? 'PUT' : 'CALL',
      confidence: Number(data?.confidence) || 0,
      reason: data?.reason || 'Entrada manual',
      entryPrice: Number(data?.entryPrice) || 0,
      pattern: null,
    };

    const res = await abrirOperacion(
      data?.pair,
      signal,
      configData.settings,
      'MANUAL',
      data?.amount ? Number(data.amount) : undefined,
    );
    callback?.(res.ok ? { success: true, operationId: res.operationId } : { success: false, error: res.error });
  });
});

httpServer.listen(PORT, () => {
  console.log(`[AutoTrader Service] escuchando en el puerto ${PORT}`);
  console.log(`[AutoTrader Service] app: ${APP_URL} · servicio IQ: ${IQ_SERVICE_URL}`);
});

function shutdown() {
  botActive = false;
  runId++;
  httpServer.close(() => process.exit(0));
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
