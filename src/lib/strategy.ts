/**
 * Capa de compatibilidad sobre el motor único de la estrategia.
 *
 * Toda la lógica vive en `ifc-strategy.ts`. Este archivo solo adapta el
 * resultado al formato que ya esperaban el gráfico y el backtest.
 *
 * Antes aquí había una SEGUNDA implementación de la estrategia, distinta de la
 * que usaba el bot. Las diferencias más graves:
 *   - el impulso exigía velas del mismo color (la regla dice que da igual);
 *     - el doji no comprobaba ser del color contrario al impulso;
 *   - la dirección se sacaba del color de la vela de fuerza, no del impulso,
 *     así que en el caso "doji verde + fuerza verde" mandaba COMPRA cuando la
 *     regla pide VENTA. El panel enseñaba señales al revés que el bot.
 */

import {
  analyzeStrategy as analizarIFC,
  DEFAULT_STRATEGY_CONFIG as DEFAULT_IFC,
  type StrategyConfig as IFCConfig,
  type SignalIFC,
  type PatternAnalysis as IFCPattern,
  type StrategyResult as IFCResult,
  type Candle as IFCCandle,
} from './ifc-strategy';

export type StrategyConfig = IFCConfig;
export const DEFAULT_STRATEGY_CONFIG = DEFAULT_IFC;
export type PatternAnalysis = IFCPattern;

export {
  evaluarEn,
  evaluarUltimaCerrada,
  calcularADX,
  calcularATR,
  TEXTO_RECHAZO,
  type MotivoRechazo,
  type Evaluacion,
  type SignalIFC,
} from './ifc-strategy';

/** Señal en el formato que consume la interfaz. */
export interface Signal {
  index: number;
  direction: 'CALL' | 'PUT';
  confidence: number;
  reason: string;
  entryPrice: number;
  pattern: {
    impulseRange: string;
    dojiIndex: number;
    dojiDescription: string;
    forceIndex: number;
    forceDescription: string;
    continuityIndex: number;
  };
}

export interface StrategyResult {
  candles: IFCCandle[];
  patterns: PatternAnalysis[];
  signals: Signal[];
  isLateral: boolean;
  lateralScore: number;
  adx: number;
  atr: number;
  lastSignal: Signal | null;
  lastRejection: { motivo: string; detalle: string } | null;
  description: string;
}

function adaptar(s: SignalIFC, candles: IFCCandle[]): Signal {
  const doji = candles[s.dojiIndex];
  const cuerpoDoji = doji ? Math.abs(doji.close - doji.open) : 0;
  const rangoDoji = doji ? doji.high - doji.low : 0;
  const pctDoji = rangoDoji > 0 ? (cuerpoDoji / rangoDoji) * 100 : 0;

  return {
    index: s.index,
    direction: s.direction,
    confidence: s.confidence,
    reason: s.reason,
    entryPrice: s.entryPrice,
    pattern: {
      impulseRange: `${s.impulso.velas} velas ${s.impulso.sentido.toLowerCase()}s`,
      dojiIndex: s.dojiIndex,
      dojiDescription: `Doji cuerpo ${pctDoji.toFixed(0)}%`,
      forceIndex: s.forceIndex,
      forceDescription: `Fuerza ${s.fuerza.rangoATR.toFixed(1)} ATR, rompe mecha ${s.fuerza.rompe.toLowerCase()}`,
      continuityIndex: s.index,
    },
  };
}

export function analyzeStrategy(
  candles: IFCCandle[],
  config: StrategyConfig = DEFAULT_STRATEGY_CONFIG,
): StrategyResult {
  const r: IFCResult = analizarIFC(candles, config);
  return {
    candles: r.candles,
    patterns: r.patterns,
    signals: r.signals.map(s => adaptar(s, r.candles)),
    isLateral: r.isLateral,
    lateralScore: r.lateralScore,
    adx: r.adx,
    atr: r.atr,
    lastSignal: r.lastSignal ? adaptar(r.lastSignal, r.candles) : null,
    lastRejection: r.lastRejection,
    description: r.description,
  };
}
