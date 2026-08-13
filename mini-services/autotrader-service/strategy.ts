/**
 * Puente entre el bot y el motor de la estrategia.
 *
 * El motor vive en src/lib/ifc-strategy.ts y es EL MISMO que usan el gráfico y
 * el backtest. Aquí solo se decide cuándo llamarlo y se evita repetir el
 * análisis de una vela que ya se miró.
 *
 * La entrada va a favor de la VELA DE FUERZA (impulso bajista → doji verde →
 * fuerza verde → COMPRA), no a favor del impulso.
 *
 * Ya no hay máquina de estados por fases. Antes el bot guardaba "vi un impulso"
 * y se quedaba esperando un doji indefinidamente: un doji veinte velas después
 * seguía disparando la entrada. Ahora cada vela cerrada se evalúa entera —
 * impulso, doji y fuerza tienen que estar seguidos dentro de la ventana
 * configurada — así que no queda estado colgando de minutos anteriores.
 */

import {
  evaluarUltimaCerrada,
  DEFAULT_STRATEGY_CONFIG,
  type StrategyConfig,
  type Candle,
  type SignalIFC,
  type Evaluacion,
} from '../../src/lib/ifc-strategy';

export type { Candle, StrategyConfig, SignalIFC, Evaluacion };
export { DEFAULT_STRATEGY_CONFIG };

export type LogFn = (
  type: 'INFO' | 'MARKET' | 'WARNING' | 'ERROR' | 'SUCCESS',
  message: string,
  pair?: string,
) => void;

/** Señal tal como la consume el auto-trader. */
export interface Signal {
  direction: 'CALL' | 'PUT';
  confidence: number;
  reason: string;
  entryPrice: number;
  pattern: {
    impulso: string;
    velasImpulso: number;
    doji: number;
    fuerza: number;
    adx: number;
  };
}

interface EstadoPar {
  /** Hora de la última vela cerrada que ya se analizó. */
  ultimaVelaProcesada: number;
  /** Último motivo de rechazo, para no repetir el mismo log cada minuto. */
  ultimoMotivo: string | null;
}

export const estados = new Map<string, EstadoPar>();

export function getEstado(pair: string): EstadoPar {
  let e = estados.get(pair);
  if (!e) {
    e = { ultimaVelaProcesada: 0, ultimoMotivo: null };
    estados.set(pair, e);
  }
  return e;
}

/**
 * Analiza el par y devuelve señal si el patrón completo se cumple en la última
 * vela cerrada.
 *
 * `candles` viene del broker con la última vela AÚN EN FORMACIÓN: se descarta.
 */
export function detectSignal(
  pair: string,
  candles: Candle[],
  config: StrategyConfig = DEFAULT_STRATEGY_CONFIG,
  onLog: LogFn = () => {},
): Signal | null {
  if (candles.length < 5) return null;

  const cerradas = candles.slice(0, -1);
  const ultima = cerradas[cerradas.length - 1];
  const estado = getEstado(pair);

  // Una vela se analiza una sola vez, corra el ciclo las veces que corra.
  if (ultima.time === estado.ultimaVelaProcesada) return null;
  estado.ultimaVelaProcesada = ultima.time;

  const ev: Evaluacion = evaluarUltimaCerrada(cerradas, config);

  if (!ev.signal) {
    // Se explica el motivo, pero solo cuando cambia: si no, sería una línea
    // igual cada minuto.
    const motivo = `${ev.motivo}:${ev.detalle}`;
    if (motivo !== estado.ultimoMotivo) {
      estado.ultimoMotivo = motivo;
      onLog('MARKET', `${pair}: ${ev.detalle}`, pair);
    }
    return null;
  }

  estado.ultimoMotivo = null;
  const s: SignalIFC = ev.signal;

  return {
    direction: s.direction,
    confidence: s.confidence,
    reason: s.reason,
    entryPrice: s.entryPrice,
    pattern: {
      impulso: s.impulso.sentido,
      velasImpulso: s.impulso.velas,
      doji: s.dojiIndex,
      fuerza: s.forceIndex,
      adx: Number(s.adx.toFixed(1)),
    },
  };
}

/** Lee la configuración guardada por el usuario y la mezcla con la de fábrica. */
export function parseConfig(raw: string | null | undefined): StrategyConfig {
  if (!raw) return DEFAULT_STRATEGY_CONFIG;
  try {
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_STRATEGY_CONFIG, ...parsed };
  } catch {
    return DEFAULT_STRATEGY_CONFIG;
  }
}
