/**
 * Estrategia "Indecision, Fuerza y Continuidad".
 *
 * Modulo aparte para poder probarla sin arrancar el servicio
 * (ver strategy.test.ts).
 */

export interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number }

export type LogFn = (type: 'INFO' | 'MARKET' | 'WARNING' | 'ERROR' | 'SUCCESS', message: string, pair?: string) => void;

export const MIN_IMPULSO_VELAS = 4;
export const ADX_THRESHOLD = 25;
export const ADX_PERIOD = 14;

export interface VelaAnalizada {
  time: number;
  open: number; close: number; high: number; low: number;
  color: 'verde' | 'rojo';
  cuerpo: number; mecha_sup: number; mecha_inf: number; rango: number;
}

export interface Signal {
  direction: 'CALL' | 'PUT';
  confidence: number;
  reason: string;
  entryPrice: number;
  pattern: any;
}

/**
 * Estado de la estrategia POR PAR.
 * Antes eran variables globales compartidas: al recorrer varios pares, cada uno
 * pisaba el estado del anterior y la secuencia impulso -> doji -> fuerza no se
 * completaba nunca sobre el mismo par.
 */
export interface EstadoPar {
  impulso: 'ALCISTA' | 'BAJISTA' | null;
  doji: VelaAnalizada | null;
  esperandoFuerza: boolean;
  ultimaVelaProcesada: number;
}

export const estados = new Map<string, EstadoPar>();

export function getEstado(pair: string): EstadoPar {
  let e = estados.get(pair);
  if (!e) {
    e = { impulso: null, doji: null, esperandoFuerza: false, ultimaVelaProcesada: 0 };
    estados.set(pair, e);
  }
  return e;
}

function resetEstado(e: EstadoPar) {
  e.impulso = null;
  e.doji = null;
  e.esperandoFuerza = false;
}

function analizarVela(v: any): VelaAnalizada {
  const open = Number(v.open);
  const close = Number(v.close);
  const high = Number(v.high);
  const low = Number(v.low);
  return {
    time: Number(v.time),
    open, close, high, low,
    color: close > open ? 'verde' : 'rojo',
    cuerpo: Math.abs(close - open),
    mecha_sup: high - Math.max(open, close),
    mecha_inf: Math.min(open, close) - low,
    rango: high - low,
  };
}

function calcularADX(velas: VelaAnalizada[], periodo: number = ADX_PERIOD): number {
  if (velas.length < periodo + 1) return 0; // sin datos suficientes NO se asume tendencia
  const tr: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];

  for (let i = 1; i < velas.length; i++) {
    const h = velas[i].high, l = velas[i].low, pc = velas[i - 1].close;
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    const up = velas[i].high - velas[i - 1].high;
    const down = velas[i - 1].low - velas[i].low;
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
  }

  const trAvg = tr.reduce((a, b) => a + b, 0) / tr.length;
  if (trAvg === 0) return 0;

  const plusDI = 100 * (plusDM.reduce((a, b) => a + b, 0) / plusDM.length) / trAvg;
  const minusDI = 100 * (minusDM.reduce((a, b) => a + b, 0) / minusDM.length) / trAvg;
  const dx = 100 * Math.abs(plusDI - minusDI) / (plusDI + minusDI + 1e-10);
  return Number.isFinite(dx) ? dx : 0;
}

function detectarImpulso(velas: VelaAnalizada[]): 'ALCISTA' | 'BAJISTA' | null {
  if (velas.length < MIN_IMPULSO_VELAS) return null;
  const tramo = velas.slice(-MIN_IMPULSO_VELAS);
  let alcista = true;
  let bajista = true;
  for (let i = 1; i < tramo.length; i++) {
    if (tramo[i].low < tramo[i - 1].low || tramo[i].high < tramo[i - 1].high) alcista = false;
    if (tramo[i].high > tramo[i - 1].high || tramo[i].low > tramo[i - 1].low) bajista = false;
  }
  if (alcista) return 'ALCISTA';
  if (bajista) return 'BAJISTA';
  return null;
}

function esDoji(vela: VelaAnalizada, impulso: string): boolean {
  if (vela.rango === 0) return false;
  const cuerpoPct = vela.cuerpo / vela.rango;
  const mechaSupPct = vela.mecha_sup / vela.rango;
  const mechaInfPct = vela.mecha_inf / vela.rango;
  if (cuerpoPct < 0.2 && mechaSupPct > 0.1 && mechaInfPct > 0.1) {
    if (impulso === 'ALCISTA' && vela.color === 'rojo') return true;
    if (impulso === 'BAJISTA' && vela.color === 'verde') return true;
  }
  return false;
}

function velaFuerza(vela: VelaAnalizada, doji: VelaAnalizada, impulso: string): boolean {
  if (impulso === 'BAJISTA') return vela.color === 'verde' && vela.high > doji.high;
  if (impulso === 'ALCISTA') return vela.color === 'rojo' && vela.low < doji.low;
  return false;
}

/**
 * Avanza la maquina de estados UNA fase por vela cerrada.
 * Se llama una vez por vela nueva, no una vez por vuelta del bucle: asi el bot
 * no depende de cuantas veces se ejecute el ciclo.
 */
export function detectSignal(pair: string, candles: Candle[], onLog: LogFn = () => {}): Signal | null {
  if (candles.length < MIN_IMPULSO_VELAS + 3) return null;

  const velas = candles.map(analizarVela);
  // La ultima vela del broker es la que se esta formando: se ignora.
  const cerradas = velas.slice(0, -1);
  const velaCerrada = cerradas[cerradas.length - 1];
  const estado = getEstado(pair);

  // Una vela solo se procesa una vez, aunque el ciclo corra varias veces.
  if (velaCerrada.time === estado.ultimaVelaProcesada) return null;
  estado.ultimaVelaProcesada = velaCerrada.time;

  const adx = calcularADX(cerradas.slice(-20), ADX_PERIOD);

  if (adx < ADX_THRESHOLD) {
    if (estado.impulso || estado.esperandoFuerza) {
      onLog('MARKET', `${pair}: mercado lateral (ADX ${adx.toFixed(1)}), se reinicia el patron`, pair);
    }
    resetEstado(estado);
    return null;
  }

  // Fase 1: buscar impulso
  if (estado.impulso === null) {
    const nuevo = detectarImpulso(cerradas);
    if (nuevo) {
      estado.impulso = nuevo;
      onLog('MARKET', `${pair}: impulso ${nuevo} detectado, buscando doji`, pair);
    }
    return null;
  }

  // Fase 2: buscar doji
  if (!estado.esperandoFuerza) {
    if (esDoji(velaCerrada, estado.impulso)) {
      estado.doji = velaCerrada;
      estado.esperandoFuerza = true;
      onLog('MARKET', `${pair}: doji ${velaCerrada.color} confirmado, esperando vela de fuerza`, pair);
    }
    return null;
  }

  // Fase 3: vela de fuerza -> señal, entrada en la vela de continuidad
  if (estado.doji && velaFuerza(velaCerrada, estado.doji, estado.impulso)) {
    const direction: 'CALL' | 'PUT' = estado.impulso === 'BAJISTA' ? 'PUT' : 'CALL';
    const signal: Signal = {
      direction,
      confidence: 85,
      reason: `Impulso ${estado.impulso} -> Doji ${estado.doji.color} -> Fuerza ${velaCerrada.color} -> ${direction} (entrada en continuidad)`,
      entryPrice: velaCerrada.close, // ultimo precio REAL conocido; el broker confirma el suyo al cerrar
      pattern: {
        impulso: estado.impulso,
        dojiColor: estado.doji.color,
        fuerzaColor: velaCerrada.color,
        adx: Number(adx.toFixed(2)),
      },
    };
    resetEstado(estado);
    return signal;
  }

  return null;
}

