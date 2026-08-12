// Candle generator with realistic price action (random walk with trends)

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface CandlePattern {
  type: 'IMPULSE_BEAR' | 'IMPULSE_BULL' | 'DOJI' | 'FORCE_BULL' | 'FORCE_BEAR'
       | 'CONTINUATION_BULL' | 'CONTINUATION_BEAR' | 'NEUTRAL' | 'LATERAL';
  description: string;
  candleIndex: number;
}

/**
 * Genera velas OHLC realistas con tendencia, ruido y ocasionalmente
 * patrones específicos (doji, impulso, vela de fuerza) para que la
 * estrategia tenga material sobre el que operar.
 */
export function generateCandles(
  count: number,
  startPrice: number = 1.0850,
  options: {
    volatility?: number;
    trendBias?: number; // -1 bajista, 0 lateral, 1 alcista
    injectPatterns?: boolean;
    seed?: number;
  } = {}
): Candle[] {
  const { volatility = 0.0008, trendBias = 0, injectPatterns = true, seed } = options;
  const rng = mulberry32(seed || Math.floor(Math.random() * 1e9));

  const candles: Candle[] = [];
  let price = startPrice;
  let currentTrend = trendBias;
  let trendStrength = 0.5 + rng() * 0.5;
  let trendDuration = 5 + Math.floor(rng() * 15);
  let trendCounter = 0;

  for (let i = 0; i < count; i++) {
    // Cambiar tendencia periódicamente
    if (trendCounter >= trendDuration) {
      const r = rng();
      currentTrend = r < 0.35 ? -1 : r < 0.7 ? 1 : 0;
      trendStrength = 0.4 + rng() * 0.6;
      trendDuration = 5 + Math.floor(rng() * 20);
      trendCounter = 0;
    }
    trendCounter++;

    const open = price;
    // Movimiento direccional + ruido
    const drift = currentTrend * trendStrength * volatility * 0.6;
    const noise = (rng() - 0.5) * 2 * volatility;
    let close = open + drift + noise;

    // Mechas
    const body = Math.abs(close - open);
    const range = body + volatility * (0.5 + rng() * 1.5);
    const high = Math.max(open, close) + rng() * range * 0.6;
    const low = Math.min(open, close) - rng() * range * 0.6;

    // Asegurar close dentro del rango
    close = Math.max(low + 0.00001, Math.min(high - 0.00001, close));

    candles.push({
      time: Date.now() - (count - i) * 60000,
      open,
      high,
      low,
      close,
      volume: 1000 + Math.floor(rng() * 5000),
    });

    price = close;
  }

  // Inyectar patrones específicos de la estrategia
  if (injectPatterns) {
    injectStrategyPatterns(candles, rng);
  }

  return candles;
}

/**
 * Inyecta secuencias completas de la estrategia:
 * impulso bajista → doji → vela fuerza verde → continuación verde (CALL)
 * o impulso alcista → doji → vela fuerza roja → continuación roja (PUT)
 */
function injectStrategyPatterns(candles: Candle[], rng: () => number) {
  const n = candles.length;
  // Inyectar en posiciones alejadas del inicio y del final
  const positions = [
    15 + Math.floor(rng() * 5),
    35 + Math.floor(rng() * 5),
    55 + Math.floor(rng() * 5),
    75 + Math.floor(rng() * 5),
  ].filter(p => p + 6 < n);

  for (const start of positions) {
    const isBullishContinuation = rng() > 0.5; // true: tras bajista → CALL; false: tras alcista → PUT
    injectSequence(candles, start, isBullishContinuation, rng);
  }
}

function injectSequence(candles: Candle[], start: number, bullishContinuation: boolean, rng: () => number) {
  // 4-6 velas de impulso
  const impulseCount = 4 + Math.floor(rng() * 3);
  const basePrice = candles[start].open;
  const vol = 0.0010;

  // Dirección del impulso (contraria a la continuación)
  const impulseDir = bullishContinuation ? -1 : 1; // bajista antes de CALL, alcista antes de PUT

  for (let i = 0; i < impulseCount; i++) {
    const idx = start + i;
    if (idx >= candles.length) break;
    const open = i === 0 ? basePrice : candles[idx - 1].close;
    const body = vol * (0.8 + rng() * 0.6) * impulseDir;
    const close = open + body;
    const high = Math.max(open, close) + vol * 0.2 * rng();
    const low = Math.min(open, close) - vol * 0.2 * rng();
    candles[idx] = { ...candles[idx], open, high, low, close };
  }

  // Doji (vela de indecisión)
  const dojiIdx = start + impulseCount;
  if (dojiIdx >= candles.length) return;
  const dojiOpen = candles[dojiIdx - 1].close;
  const dojiBody = vol * 0.08 * (rng() > 0.5 ? 1 : -1); // cuerpo muy pequeño
  const dojiClose = dojiOpen + dojiBody;
  const dojiRange = vol * (1.2 + rng() * 0.6);
  const dojiHigh = Math.max(dojiOpen, dojiClose) + dojiRange * 0.5;
  const dojiLow = Math.min(dojiOpen, dojiClose) - dojiRange * 0.5;
  candles[dojiIdx] = { ...candles[dojiIdx], open: dojiOpen, high: dojiHigh, low: dojiLow, close: dojiClose };

  // Vela de fuerza (gatillo)
  const forceIdx = dojiIdx + 1;
  if (forceIdx >= candles.length) return;
  const forceDir = bullishContinuation ? 1 : -1; // verde para CALL, roja para PUT
  // Sobrepasa mecha superior (CALL) o inferior (PUT) del doji
  const breakoutPoint = bullishContinuation ? dojiHigh : dojiLow;
  const forceOpen = dojiClose;
  const forceClose = bullishContinuation
    ? breakoutPoint + vol * 0.3 * rng()  // sobrepasa mecha sup
    : breakoutPoint - vol * 0.3 * rng();  // sobrepasa mecha inf
  const forceHigh = Math.max(forceOpen, forceClose) + vol * 0.1 * rng();
  const forceLow = Math.min(forceOpen, forceClose) - vol * 0.1 * rng();
  candles[forceIdx] = { ...candles[forceIdx], open: forceOpen, high: forceHigh, low: forceLow, close: forceClose };

  // Vela de continuidad (la que se opera)
  const contIdx = forceIdx + 1;
  if (contIdx >= candles.length) return;
  const contOpen = forceClose;
  const contBody = vol * 0.5 * forceDir;
  const contClose = contOpen + contBody;
  const contHigh = Math.max(contOpen, contClose) + vol * 0.15 * rng();
  const contLow = Math.min(contOpen, contClose) - vol * 0.15 * rng();
  candles[contIdx] = { ...candles[contIdx], open: contOpen, high: contHigh, low: contLow, close: contClose };
}

// PRNG determinista
function mulberry32(seed: number) {
  return function () {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Avanza una vela: agrega una nueva vela generada a partir de la última.
 * Útil para simular ticks en tiempo real.
 */
export function nextCandle(prev: Candle, trendBias: number = 0, volatility: number = 0.0008): Candle {
  const open = prev.close;
  const drift = trendBias * volatility * 0.5;
  const noise = (Math.random() - 0.5) * 2 * volatility;
  const close = open + drift + noise;
  const body = Math.abs(close - open);
  const range = body + volatility * (0.5 + Math.random() * 1);
  const high = Math.max(open, close) + Math.random() * range * 0.5;
  const low = Math.min(open, close) - Math.random() * range * 0.5;
  return {
    time: prev.time + 60000,
    open, high, low, close,
    volume: 1000 + Math.floor(Math.random() * 5000),
  };
}
