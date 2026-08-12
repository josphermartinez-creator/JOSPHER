// Estrategia: Indecisión, Fuerza y Continuidad
// =====================================================
// 1. IMPULSO: movimiento direccional previo (bajista o alcista, sin importar # de velas)
// 2. DOJI (Indecisión): cuerpo pequeño, mechas arriba y abajo donde el impulso se detiene
// 3. VELA DE FUERZA (Gatillo): sobrepasa una mecha del doji (sup o inf),
//    tamaño entre 65% y 80% del rango total del doji (si es muy grande = agotamiento, no operar)
// 4. VELA DE CONTINUIDAD: se opera en el segundo 00 a favor de la vela de fuerza
//
// Combinaciones:
//   - Tendencia bajista + doji + vela fuerza VERDE (sobrepasa mecha sup) → CALL
//   - Tendencia alcista + doji + vela fuerza ROJA (sobrepasa mecha inf)  → PUT
//   - Doji rojo + vela fuerza roja → PUT (continuidad de venta)
//   - Doji verde + vela fuerza verde → CALL (continuidad de compra)

import type { Candle } from './candles';

export interface StrategyConfig {
  // Detección de Doji
  dojiMaxBodyPct: number;      // % del rango total. Cuerpo debe ser <= a esto (default 15%)
  dojiMinWickBothSides: number; // cada mecha >= a este % del rango (default 15%)

  // Detección de Impulso
  impulseMinCandles: number;   // mínimo de velas en el impulso (default 3)
  impulseMinStrength: number;  // fuerza mínima del impulso (default 0.0003 = 3 pips)

  // Detección de Vela de Fuerza
  forceMinBodyPct: number;     // cuerpo fuerza >= 65% del rango del doji
  forceMaxBodyPct: number;     // cuerpo fuerza <= 80% del rango del doji
  forceMustBreakWick: boolean; // debe sobrepasar una mecha del doji

  // Filtro de Mercado Lateral (ADX simplificado)
  lateralFilterEnabled: boolean;
  lateralMinRange: number;     // rango mínimo de las últimas N velas (default 0.0010)
  lateralLookback: number;     // N velas para evaluar lateralidad (default 14)
  lateralMaxRange: number;     // si el rango < este valor, mercado lateral (no operar)

  // Confirmación
  requireTrendAlignment: boolean; // vela de fuerza debe ir a favor de la continuación esperada
}

export const DEFAULT_STRATEGY_CONFIG: StrategyConfig = {
  dojiMaxBodyPct: 15,
  dojiMinWickBothSides: 15,
  impulseMinCandles: 3,
  impulseMinStrength: 0.0003,
  forceMinBodyPct: 65,
  forceMaxBodyPct: 80,
  forceMustBreakWick: true,
  lateralFilterEnabled: true,
  lateralMinRange: 0.0008,
  lateralLookback: 14,
  lateralMaxRange: 0.0012,
  requireTrendAlignment: true,
};

export interface PatternAnalysis {
  index: number;
  candle: Candle;
  type: 'IMPULSE_BULL' | 'IMPULSE_BEAR' | 'DOJI' | 'FORCE_BULL' | 'FORCE_BEAR' | 'NEUTRAL';
  details: {
    body: number;
    range: number;
    upperWick: number;
    lowerWick: number;
    bodyPct: number;     // % del cuerpo respecto al rango
    upperWickPct: number;
    lowerWickPct: number;
  };
}

export interface Signal {
  index: number;            // índice de la vela a operar (continuidad)
  direction: 'CALL' | 'PUT';
  confidence: number;       // 0-100
  reason: string;
  pattern: {
    impulseRange: string;       // "4 velas bajistas"
    dojiIndex: number;
    dojiDescription: string;
    forceIndex: number;
    forceDescription: string;
    continuityIndex: number;
  };
  entryPrice: number;
  stopLoss?: number;
  takeProfit?: number;
}

export interface StrategyResult {
  candles: Candle[];
  patterns: PatternAnalysis[];
  signals: Signal[];
  isLateral: boolean;
  lateralScore: number;     // 0-100 (mayor = más lateral)
  lastSignal: Signal | null;
  description: string;
}

/**
 * Analiza una serie de velas y detecta señales de la estrategia.
 */
export function analyzeStrategy(candles: Candle[], config: StrategyConfig = DEFAULT_STRATEGY_CONFIG): StrategyResult {
  const patterns: PatternAnalysis[] = candles.map((c, i) => analyzeCandle(c, i));
  const signals: Signal[] = [];

  // Necesitamos al menos: impulso (3) + doji (1) + fuerza (1) + continuidad (1) = 6 velas
  for (let i = Math.max(config.impulseMinCandles + 2, config.lateralLookback); i < candles.length; i++) {
    const dojiIdx = i - 2;
    const forceIdx = i - 1;
    const contIdx = i;

    const dojiPattern = patterns[dojiIdx];
    const forcePattern = patterns[forceIdx];

    // 1. Verificar que la vela dojiIdx sea un doji
    if (dojiPattern.type !== 'DOJI') continue;

    // 2. Verificar impulso previo (antes del doji)
    const impulse = detectImpulse(candles, patterns, dojiIdx, config);
    if (!impulse) continue;

    // 3. Filtro de mercado lateral
    if (config.lateralFilterEnabled) {
      const lateral = isLateralMarket(candles, dojiIdx, config);
      if (lateral.isLateral) continue;
    }

    // 4. Verificar vela de fuerza
    const force = detectForceCandle(candles, dojiIdx, forceIdx, config);
    if (!force) continue;

    // 5. Determinar dirección de la señal
    const direction = force.direction; // CALL si vela fuerza verde (rompe mecha sup), PUT si roja (rompe mecha inf)

    // 6. Alineación con tendencia esperada
    if (config.requireTrendAlignment) {
      // Si impulso bajista + fuerza verde = reversión alcista → CALL (válido)
      // Si impulso alcista + fuerza roja = reversión bajista → PUT (válido)
      // Si impulso bajista + fuerza roja = continuidad bajista → PUT (válido)
      // Si impulso alcista + fuerza verde = continuidad alcista → CALL (válido)
      // Todo es válido excepto cuando el impulso y la fuerza apuntan en direcciones opuestas sin reversión
      // Realmente todas las combinaciones son operables según las reglas dadas.
    }

    // Calcular confianza
    const confidence = calculateConfidence(dojiPattern, forcePattern, impulse, force, config);

    const signal: Signal = {
      index: contIdx,
      direction,
      confidence,
      reason: buildReason(impulse, dojiPattern, force, direction),
      pattern: {
        impulseRange: `${impulse.count} velas ${impulse.direction === 'BEAR' ? 'bajistas' : 'alcistas'}`,
        dojiIndex: dojiIdx,
        dojiDescription: `Doji ${dojiPattern.details.bodyPct.toFixed(1)}% cuerpo`,
        forceIndex: forceIdx,
        forceDescription: `Vela fuerza ${force.bodyPctOfDoji.toFixed(0)}% del doji (${force.breaksWick === 'UPPER' ? 'rompe mecha sup' : force.breaksWick === 'LOWER' ? 'rompe mecha inf' : 'sin ruptura'})`,
        continuityIndex: contIdx,
      },
      entryPrice: candles[contIdx].open,
      stopLoss: direction === 'CALL'
        ? candles[dojiIdx].low - 0.0005
        : candles[dojiIdx].high + 0.0005,
      takeProfit: direction === 'CALL'
        ? candles[contIdx].open + 0.0020
        : candles[contIdx].open - 0.0020,
    };

    signals.push(signal);
  }

  // Verificar si el mercado actual es lateral
  const lateral = isLateralMarket(candles, candles.length - 1, config);

  const lastSignal = signals.length > 0 ? signals[signals.length - 1] : null;

  let description = 'Análisis completo. ';
  if (lateral.isLateral) {
    description += 'Mercado lateral detectado - no se recomienda operar. ';
  } else if (lastSignal) {
    description += `Última señal: ${lastSignal.direction === 'CALL' ? 'COMPRA' : 'VENTA'} con ${lastSignal.confidence.toFixed(0)}% confianza. `;
  } else {
    description += 'No se detectaron señales válidas en el rango analizado. ';
  }

  return {
    candles,
    patterns,
    signals,
    isLateral: lateral.isLateral,
    lateralScore: lateral.score,
    lastSignal,
    description,
  };
}

function analyzeCandle(c: Candle, i: number): PatternAnalysis {
  const body = Math.abs(c.close - c.open);
  const range = c.high - c.low;
  const upperWick = c.high - Math.max(c.open, c.close);
  const lowerWick = Math.min(c.open, c.close) - c.low;
  const bodyPct = range > 0 ? (body / range) * 100 : 0;
  const upperWickPct = range > 0 ? (upperWick / range) * 100 : 0;
  const lowerWickPct = range > 0 ? (lowerWick / range) * 100 : 0;

  let type: PatternAnalysis['type'] = 'NEUTRAL';

  // Clasificar
  if (bodyPct < 20 && upperWick > 0 && lowerWick > 0) {
    type = 'DOJI';
  } else if (body > range * 0.5) {
    type = c.close > c.open ? 'IMPULSE_BULL' : 'IMPULSE_BEAR';
  } else if (body > range * 0.35) {
    type = c.close > c.open ? 'FORCE_BULL' : 'FORCE_BEAR';
  }

  return {
    index: i,
    candle: c,
    type,
    details: { body, range, upperWick, lowerWick, bodyPct, upperWickPct, lowerWickPct },
  };
}

interface ImpulseInfo {
  direction: 'BULL' | 'BEAR';
  count: number;
  strength: number;
  startIndex: number;
}

function detectImpulse(
  candles: Candle[],
  patterns: PatternAnalysis[],
  dojiIdx: number,
  config: StrategyConfig
): ImpulseInfo | null {
  // Mirar hacia atrás desde el doji hasta encontrar velas en misma dirección
  let direction: 'BULL' | 'BEAR' | null = null;
  let count = 0;
  let strength = 0;
  let startIndex = dojiIdx - 1;

  for (let i = dojiIdx - 1; i >= Math.max(0, dojiIdx - 20); i--) {
    const c = candles[i];
    const isBull = c.close > c.open;
    const isBear = c.close < c.open;
    const body = Math.abs(c.close - c.open);

    if (direction === null) {
      if (isBull && body > 0.0001) { direction = 'BULL'; count++; strength += body; startIndex = i; }
      else if (isBear && body > 0.0001) { direction = 'BEAR'; count++; strength += body; startIndex = i; }
      else continue;
    } else {
      if (direction === 'BULL' && isBull) { count++; strength += body; startIndex = i; }
      else if (direction === 'BEAR' && isBear) { count++; strength += body; startIndex = i; }
      else break; // cambio de dirección
    }
  }

  if (!direction) return null;
  if (count < config.impulseMinCandles) return null;
  if (strength < config.impulseMinStrength) return null;

  return { direction, count, strength, startIndex };
}

interface ForceInfo {
  direction: 'CALL' | 'PUT';
  bodyPctOfDoji: number;
  breaksWick: 'UPPER' | 'LOWER' | 'NONE';
}

function detectForceCandle(
  candles: Candle[],
  dojiIdx: number,
  forceIdx: number,
  config: StrategyConfig
): ForceInfo | null {
  const doji = candles[dojiIdx];
  const force = candles[forceIdx];

  const dojiRange = doji.high - doji.low;
  if (dojiRange <= 0) return null;

  const forceBody = Math.abs(force.close - force.open);
  const bodyPctOfDoji = (forceBody / dojiRange) * 100;

  // Validar tamaño: 65% - 80% del doji
  if (bodyPctOfDoji < config.forceMinBodyPct) return null;
  if (bodyPctOfDoji > config.forceMaxBodyPct) return null; // agotamiento

  // Verificar si sobrepasa una mecha
  const breaksUpper = force.close > doji.high;
  const breaksLower = force.close < doji.low;

  if (config.forceMustBreakWick && !breaksUpper && !breaksLower) return null;

  // Dirección de la señal
  // Si vela fuerza es verde (close > open) y rompe mecha superior → CALL
  // Si vela fuerza es roja (close < open) y rompe mecha inferior → PUT
  if (force.close > force.open && breaksUpper) {
    return { direction: 'CALL', bodyPctOfDoji, breaksWick: 'UPPER' };
  }
  if (force.close < force.open && breaksLower) {
    return { direction: 'PUT', bodyPctOfDoji, breaksWick: 'LOWER' };
  }

  // Caso: vela fuerza verde pero no rompe mecha superior, sí inferior (más débil)
  if (force.close > force.open) {
    return { direction: 'CALL', bodyPctOfDoji, breaksWick: 'NONE' };
  }
  if (force.close < force.open) {
    return { direction: 'PUT', bodyPctOfDoji, breaksWick: 'NONE' };
  }

  return null;
}

function isLateralMarket(candles: Candle[], endIdx: number, config: StrategyConfig): { isLateral: boolean; score: number } {
  const start = Math.max(0, endIdx - config.lateralLookback + 1);
  const window = candles.slice(start, endIdx + 1);
  if (window.length < 5) return { isLateral: false, score: 0 };

  const highs = window.map(c => c.high);
  const lows = window.map(c => c.low);
  const maxHigh = Math.max(...highs);
  const minLow = Math.min(...lows);
  const range = maxHigh - minLow;

  // Calcular ADX simplificado: relación entre cuerpo neto y rango total
  const netMove = Math.abs(window[window.length - 1].close - window[0].open);
  const directionalRatio = range > 0 ? netMove / range : 0;

  // Score de lateralidad: 100 = muy lateral, 0 = muy direccional
  let score = (1 - directionalRatio) * 100;

  // Si el rango total es muy pequeño respecto a la volatilidad esperada → lateral
  if (range < config.lateralMaxRange) {
    score += 30;
  }

  score = Math.min(100, score);

  // Mercado lateral si el ratio direccional es bajo (< 30%) o el rango es muy pequeño
  const isLateral = directionalRatio < 0.3 || range < config.lateralMinRange;

  return { isLateral, score };
}

function calculateConfidence(
  doji: PatternAnalysis,
  forcePattern: PatternAnalysis,
  impulse: ImpulseInfo,
  force: ForceInfo,
  config: StrategyConfig
): number {
  let conf = 60;

  // Doji más pequeño = mejor señal de indecisión
  if (doji.details.bodyPct < 10) conf += 10;
  else if (doji.details.bodyPct < 15) conf += 5;

  // Mechas balanceadas
  const wickDiff = Math.abs(doji.details.upperWickPct - doji.details.lowerWickPct);
  if (wickDiff < 15) conf += 8;

  // Vela de fuerza en el rango óptimo (70-75% del doji)
  if (force.bodyPctOfDoji >= 70 && force.bodyPctOfDoji <= 75) conf += 12;
  else conf += 5;

  // Vela fuerza rompe mecha (más fuerte)
  if (force.breaksWick !== 'NONE') conf += 8;

  // Impulso fuerte
  if (impulse.strength > 0.001) conf += 8;
  if (impulse.count >= 5) conf += 5;

  // Reversión: impulso bajista + fuerza CALL, o impulso alcista + fuerza PUT
  if ((impulse.direction === 'BEAR' && force.direction === 'CALL') ||
      (impulse.direction === 'BULL' && force.direction === 'PUT')) {
    conf += 7; // reversión clara
  }

  return Math.min(98, conf);
}

function buildReason(impulse: ImpulseInfo, doji: PatternAnalysis, force: ForceInfo, direction: 'CALL' | 'PUT'): string {
  const impulseDesc = `Impulso ${impulse.direction === 'BEAR' ? 'bajista' : 'alcista'} (${impulse.count} velas)`;
  const dojiDesc = `Doji indecisión (cuerpo ${doji.details.bodyPct.toFixed(1)}%)`;
  const forceColor = force.direction === 'CALL' ? 'verde' : 'roja';
  const forceBreak = force.breaksWick === 'UPPER' ? 'rompe mecha sup' :
                     force.breaksWick === 'LOWER' ? 'rompe mecha inf' : 'sin ruptura';
  const forceDesc = `Vela fuerza ${forceColor} (${force.bodyPctOfDoji.toFixed(0)}% del doji, ${forceBreak})`;
  const actionDesc = direction === 'CALL' ? 'COMPRA' : 'VENTA';
  const mode = (impulse.direction === 'BEAR' && direction === 'CALL') ||
               (impulse.direction === 'BULL' && direction === 'PUT')
               ? 'reversión' : 'continuidad';
  return `${impulseDesc} → ${dojiDesc} → ${forceDesc} → ${actionDesc} (${mode})`;
}
