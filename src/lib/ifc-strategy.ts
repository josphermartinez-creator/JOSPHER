/**
 * Estrategia "Indecisión, Fuerza y Continuidad" (IFC)
 * ===================================================
 * MOTOR ÚNICO. Lo usan el bot que opera, el gráfico y el backtest, para que los
 * tres vean exactamente lo mismo. Antes había dos implementaciones distintas y
 * el panel enseñaba señales que el bot nunca tomaba (y al revés).
 *
 * La regla, tal como está definida:
 *
 *   1. IMPULSO      Movimiento direccional de 4 velas o más. El color de cada
 *                   vela da igual (pueden venir verdes y rojas intercaladas):
 *                   lo que importa es que el impulso no se dé la vuelta.
 *   2. INDECISIÓN   Un doji: cuerpo pequeño con mecha arriba y abajo, y del
 *                   COLOR CONTRARIO al impulso. Impulso bajista → doji verde.
 *   3. FUERZA       Vela de buen tamaño, del MISMO color que el doji, que
 *                   sobrepasa CON EL CUERPO la mecha del doji (la de arriba o
 *                   la de abajo, según el caso).
 *   4. CONTINUIDAD  Al cerrar la vela de fuerza se entra en la vela siguiente,
 *                   A FAVOR DE LA VELA DE FUERZA (no del impulso).
 *                   Impulso bajista → doji verde → fuerza verde → se COMPRA.
 *                   Impulso alcista → doji rojo  → fuerza roja  → se VENDE.
 *
 *   impulso + doji + fuerza = entrada en la vela de continuidad
 *
 * Todo tiene que cumplirse seguido. Si entre el impulso y el doji, o entre el
 * doji y la fuerza, se cuelan velas de más, el patrón se descarta.
 */

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export type Direccion = 'CALL' | 'PUT';
export type SentidoImpulso = 'ALCISTA' | 'BAJISTA';
export type ColorVela = 'verde' | 'rojo' | 'neutro';

// ============================================================
// Configuración
// ============================================================

export interface StrategyConfig {
  // ---- 1. Impulso ----
  /** Mínimo de velas del impulso. La regla pide 4. */
  impulseMinCandles: number;
  /** Hasta cuántas velas atrás se busca (permite impulsos de 4, 5, 6 o más). */
  impulseMaxCandles: number;
  /** Retroceso máximo permitido dentro del impulso, en % del avance total. */
  impulseMaxPullbackPct: number;
  /** Avance mínimo del impulso, en múltiplos del ATR (se adapta a cada par). */
  impulseMinAdvanceATR: number;
  /**
   * Cuánto puede alejarse la última vela del impulso de su extremo, en % del
   * avance. Es lo que obliga a que el impulso llegue VIVO al doji: si el precio
   * ya se dio la vuelta antes, el doji no está parando nada.
   */
  impulseMaxTailPct: number;

  // ---- 2. Doji (indecisión) ----
  /** Cuerpo máximo del doji, en % de su rango. */
  dojiMaxBodyPct: number;
  /** Mecha mínima a CADA lado, en % del rango. */
  dojiMinWickBothSides: number;
  /** El doji debe ser del color contrario al impulso. */
  dojiOppositeColor: boolean;

  // ---- 3. Vela de fuerza ----
  /** Cuerpo mínimo, en % de su propio rango ("vela de buen tamaño"). */
  forceMinBodyPct: number;
  /** Cuerpo máximo, en % de su rango. 100 = sin tope. */
  forceMaxBodyPct: number;
  /** Rango mínimo en múltiplos de ATR ("buen tamaño" comparado con el mercado). */
  forceMinRangeATR: number;
  /** Debe sobrepasar la mecha del doji. */
  forceMustBreakWick: boolean;
  /**
   * Cómo se sobrepasa la mecha del doji:
   *   'body' (por defecto) el CUERPO tiene que quedar más allá de la mecha.
   *   'wick' basta con que la mecha de la vela de fuerza la toque.
   */
  forceBreakMode: 'body' | 'wick';
  /** La vela de fuerza debe ser del mismo color que el doji. */
  forceSameColorAsDoji: boolean;

  // ---- Secuencia (esto es lo que evita que entre cuando le da la gana) ----
  /** Velas permitidas entre el final del impulso y el doji. 1 = el doji va justo después. */
  maxCandlesImpulseToDoji: number;
  /** Velas permitidas entre el doji y la vela de fuerza. 1 = va justo después. */
  maxCandlesDojiToForce: number;

  // ---- Filtro de mercado lateral ----
  lateralFilterEnabled: boolean;
  /** Periodo del ADX (Wilder). */
  adxPeriod: number;
  /** ADX mínimo para considerar que hay tendencia. */
  adxMin: number;
  /** Velas para medir el rango del mercado. */
  lateralLookback: number;
  /** Rango mínimo de esas velas en múltiplos de ATR. 0 = filtro desactivado. */
  lateralMinRangeATR: number;

  // ---- Dirección y confianza ----
  /**
   * Hacia dónde va la entrada en la vela de continuidad:
   *   'fuerza'  (por defecto) a favor de la VELA DE FUERZA. Es la regla:
   *             impulso bajista → doji verde → fuerza verde → COMPRA.
   *   'impulso' a favor del impulso previo (lo contrario).
   */
  direction: 'fuerza' | 'impulso';
  /** Confianza mínima para operar (0-100). */
  minConfidence: number;
}

export const DEFAULT_STRATEGY_CONFIG: StrategyConfig = {
  impulseMinCandles: 4,
  impulseMaxCandles: 12,
  impulseMaxPullbackPct: 45,
  impulseMinAdvanceATR: 1.2,
  impulseMaxTailPct: 15,

  dojiMaxBodyPct: 20,
  dojiMinWickBothSides: 10,
  dojiOppositeColor: true,

  forceMinBodyPct: 50,
  forceMaxBodyPct: 100,
  forceMinRangeATR: 0.8,
  forceMustBreakWick: true,
  forceBreakMode: 'body',
  forceSameColorAsDoji: true,

  maxCandlesImpulseToDoji: 1,
  maxCandlesDojiToForce: 1,

  lateralFilterEnabled: true,
  adxPeriod: 14,
  adxMin: 25,
  lateralLookback: 14,
  lateralMinRangeATR: 0,

  direction: 'fuerza',
  minConfidence: 65,
};

// ============================================================
// Utilidades de vela
// ============================================================

export interface VelaInfo {
  index: number;
  candle: Candle;
  color: ColorVela;
  body: number;
  range: number;
  upperWick: number;
  lowerWick: number;
  bodyPct: number;
  upperWickPct: number;
  lowerWickPct: number;
}

export function analizarVela(c: Candle, index: number): VelaInfo {
  const open = Number(c.open);
  const close = Number(c.close);
  const high = Number(c.high);
  const low = Number(c.low);

  const body = Math.abs(close - open);
  const range = high - low;
  const upperWick = high - Math.max(open, close);
  const lowerWick = Math.min(open, close) - low;

  return {
    index,
    candle: c,
    color: close > open ? 'verde' : close < open ? 'rojo' : 'neutro',
    body,
    range,
    upperWick,
    lowerWick,
    bodyPct: range > 0 ? (body / range) * 100 : 0,
    upperWickPct: range > 0 ? (upperWick / range) * 100 : 0,
    lowerWickPct: range > 0 ? (lowerWick / range) * 100 : 0,
  };
}

/** ATR con suavizado de Wilder, calculado hasta endIdx incluido. */
export function calcularATR(velas: Candle[], endIdx: number, periodo: number): number {
  if (endIdx < periodo) return 0;

  const tr = (i: number) => {
    const h = velas[i].high;
    const l = velas[i].low;
    const pc = velas[i - 1].close;
    return Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
  };

  let atr = 0;
  for (let i = endIdx - periodo + 1; i <= endIdx; i++) atr += tr(i);
  atr /= periodo;

  return atr;
}

/**
 * ADX de Wilder de verdad (+DI, -DI suavizados y ADX = media suavizada del DX).
 * La versión anterior era un DX suelto con medias simples: el umbral de 25 no
 * significaba lo que se creía y por eso el filtro de lateral no filtraba.
 * Necesita unas 2*periodo velas; si no hay, devuelve 0 (= no operar).
 */
export function calcularADX(velas: Candle[], endIdx: number, periodo: number): {
  adx: number;
  plusDI: number;
  minusDI: number;
} {
  const necesarias = periodo * 2 + 1;
  if (endIdx + 1 < necesarias) return { adx: 0, plusDI: 0, minusDI: 0 };

  const inicio = Math.max(1, endIdx - (periodo * 3) + 1);
  const tr: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];

  for (let i = inicio; i <= endIdx; i++) {
    const h = velas[i].high, l = velas[i].low;
    const ph = velas[i - 1].high, pl = velas[i - 1].low, pc = velas[i - 1].close;

    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));

    const up = h - ph;
    const down = pl - l;
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
  }

  if (tr.length < periodo * 2) return { adx: 0, plusDI: 0, minusDI: 0 };

  // Suavizado de Wilder
  const suavizar = (valores: number[]) => {
    const out: number[] = [];
    let acc = valores.slice(0, periodo).reduce((a, b) => a + b, 0);
    out.push(acc);
    for (let i = periodo; i < valores.length; i++) {
      acc = acc - acc / periodo + valores[i];
      out.push(acc);
    }
    return out;
  };

  const sTR = suavizar(tr);
  const sPlus = suavizar(plusDM);
  const sMinus = suavizar(minusDM);

  const dxs: number[] = [];
  let plusDI = 0;
  let minusDI = 0;

  for (let i = 0; i < sTR.length; i++) {
    if (sTR[i] === 0) { dxs.push(0); continue; }
    plusDI = 100 * (sPlus[i] / sTR[i]);
    minusDI = 100 * (sMinus[i] / sTR[i]);
    const suma = plusDI + minusDI;
    dxs.push(suma === 0 ? 0 : 100 * Math.abs(plusDI - minusDI) / suma);
  }

  if (dxs.length < periodo) return { adx: 0, plusDI, minusDI };

  // ADX = media de Wilder del DX
  let adx = dxs.slice(0, periodo).reduce((a, b) => a + b, 0) / periodo;
  for (let i = periodo; i < dxs.length; i++) {
    adx = (adx * (periodo - 1) + dxs[i]) / periodo;
  }

  return { adx, plusDI, minusDI };
}

// ============================================================
// 1. Impulso
// ============================================================

export interface ImpulsoInfo {
  sentido: SentidoImpulso;
  velas: number;
  desdeIndex: number;
  hastaIndex: number;
  avance: number;
  avanceATR: number;
  retroceso: number;
  retrocesoPct: number;
}

// Cuánto se tolera que el impulso no arranque justo en su extremo (fracción
// del avance). El otro extremo lo controla config.impulseMaxTailPct.
const TOLERANCIA_ARRANQUE = 0.20;

/**
 * Busca el impulso MÁS LARGO que termina en `endIdx`.
 *
 * No mira colores: un impulso puede traer velas verdes y rojas mezcladas
 * mientras no se dé la vuelta. Lo que se exige es:
 *   - que arranque cerca de su extremo y termine cerca del contrario,
 *   - que avance lo suficiente (medido en ATR, así vale igual para EURUSD que
 *     para BTC),
 *   - y que el retroceso máximo dentro del tramo no se pase del límite.
 */
export function detectarImpulso(
  velas: Candle[],
  endIdx: number,
  config: StrategyConfig,
  atr: number,
): ImpulsoInfo | null {
  if (atr <= 0) return null;

  const maxN = Math.min(config.impulseMaxCandles, endIdx + 1);

  for (let n = maxN; n >= config.impulseMinCandles; n--) {
    const s = endIdx - n + 1;
    if (s < 0) continue;

    const tramo = velas.slice(s, endIdx + 1);
    const minLow = Math.min(...tramo.map(c => c.low));
    const maxHigh = Math.max(...tramo.map(c => c.high));
    const avance = maxHigh - minLow;
    if (avance <= 0) continue;
    if (avance < config.impulseMinAdvanceATR * atr) continue;

    // ---- ALCISTA: arranca abajo, termina arriba ----
    const toleranciaCierre = Math.max(0, config.impulseMaxTailPct) / 100;
    const arrancaAbajo = (velas[s].low - minLow) <= TOLERANCIA_ARRANQUE * avance;
    const terminaArriba = (maxHigh - velas[endIdx].high) <= toleranciaCierre * avance;

    if (arrancaAbajo && terminaArriba) {
      let runMax = velas[s].high;
      let peorRetroceso = 0;
      for (let i = s + 1; i <= endIdx; i++) {
        peorRetroceso = Math.max(peorRetroceso, runMax - velas[i].low);
        runMax = Math.max(runMax, velas[i].high);
      }
      const retrocesoPct = (peorRetroceso / avance) * 100;
      if (retrocesoPct <= config.impulseMaxPullbackPct) {
        return {
          sentido: 'ALCISTA', velas: n, desdeIndex: s, hastaIndex: endIdx,
          avance, avanceATR: avance / atr, retroceso: peorRetroceso, retrocesoPct,
        };
      }
    }

    // ---- BAJISTA: arranca arriba, termina abajo ----
    const arrancaArriba = (maxHigh - velas[s].high) <= TOLERANCIA_ARRANQUE * avance;
    const terminaAbajo = (velas[endIdx].low - minLow) <= toleranciaCierre * avance;

    if (arrancaArriba && terminaAbajo) {
      let runMin = velas[s].low;
      let peorRetroceso = 0;
      for (let i = s + 1; i <= endIdx; i++) {
        peorRetroceso = Math.max(peorRetroceso, velas[i].high - runMin);
        runMin = Math.min(runMin, velas[i].low);
      }
      const retrocesoPct = (peorRetroceso / avance) * 100;
      if (retrocesoPct <= config.impulseMaxPullbackPct) {
        return {
          sentido: 'BAJISTA', velas: n, desdeIndex: s, hastaIndex: endIdx,
          avance, avanceATR: avance / atr, retroceso: peorRetroceso, retrocesoPct,
        };
      }
    }
  }

  return null;
}

// ============================================================
// 2. Doji (indecisión)
// ============================================================

/** El color que debe tener el doji: el contrario al impulso. */
export function colorEsperadoDoji(impulso: SentidoImpulso): 'verde' | 'rojo' {
  return impulso === 'BAJISTA' ? 'verde' : 'rojo';
}

export function esDoji(v: VelaInfo, impulso: SentidoImpulso, config: StrategyConfig): boolean {
  if (v.range <= 0) return false;
  if (v.bodyPct > config.dojiMaxBodyPct) return false;
  if (v.upperWickPct < config.dojiMinWickBothSides) return false;
  if (v.lowerWickPct < config.dojiMinWickBothSides) return false;

  if (config.dojiOppositeColor) {
    // Un doji con apertura y cierre iguales ('neutro') vale para los dos casos:
    // sigue siendo indecisión pura.
    if (v.color !== 'neutro' && v.color !== colorEsperadoDoji(impulso)) return false;
  }
  return true;
}

// ============================================================
// 3. Vela de fuerza
// ============================================================

export interface FuerzaInfo {
  rompe: 'SUPERIOR' | 'INFERIOR';
  superaEnATR: number;   // cuánto sobrepasa la mecha, en ATR
  rangoATR: number;
  bodyPct: number;
}

export function esVelaFuerza(
  v: VelaInfo,
  doji: VelaInfo,
  impulso: SentidoImpulso,
  config: StrategyConfig,
  atr: number,
): FuerzaInfo | null {
  if (v.range <= 0 || atr <= 0) return null;

  // "Vela de buen tamaño": cuerpo decidido y rango que destaque sobre el ATR
  if (v.bodyPct < config.forceMinBodyPct) return null;
  if (config.forceMaxBodyPct < 100 && v.bodyPct > config.forceMaxBodyPct) return null;
  if (v.range < config.forceMinRangeATR * atr) return null;

  // Color: el mismo que el doji (o sea, contrario al impulso)
  const colorEsperado = config.forceSameColorAsDoji
    ? (doji.color !== 'neutro' ? doji.color : colorEsperadoDoji(impulso))
    : null;
  if (colorEsperado && v.color !== colorEsperado) return null;

  // Sobrepasar la mecha del doji: la de arriba si vamos hacia arriba, la de
  // abajo en el caso contrario.
  // Por defecto se mide con el CUERPO (borde del cuerpo en el sentido de la
  // ruptura), no con la mecha: una vela que solo asoma la mecha no vale.
  const haciaArriba = colorEsperadoDoji(impulso) === 'verde'; // impulso bajista → doji/fuerza verdes
  const referencia = haciaArriba ? doji.candle.high : doji.candle.low;
  const bordeCuerpo = haciaArriba
    ? Math.max(v.candle.open, v.candle.close)
    : Math.min(v.candle.open, v.candle.close);
  const puntoVela = config.forceBreakMode === 'wick'
    ? (haciaArriba ? v.candle.high : v.candle.low)
    : bordeCuerpo;

  const supera = haciaArriba ? puntoVela - referencia : referencia - puntoVela;

  if (config.forceMustBreakWick && supera <= 0) return null;

  return {
    rompe: haciaArriba ? 'SUPERIOR' : 'INFERIOR',
    superaEnATR: supera / atr,
    rangoATR: v.range / atr,
    bodyPct: v.bodyPct,
  };
}

// ============================================================
// Evaluación del patrón completo
// ============================================================

export type MotivoRechazo =
  | 'POCAS_VELAS'
  | 'SIN_ATR'
  | 'MERCADO_LATERAL'
  | 'RANGO_INSUFICIENTE'
  | 'SIN_IMPULSO'
  | 'SIN_DOJI'
  | 'SIN_FUERZA'
  | 'CONFIANZA_BAJA';

export const TEXTO_RECHAZO: Record<MotivoRechazo, string> = {
  POCAS_VELAS: 'no hay suficientes velas para analizar',
  SIN_ATR: 'no se puede medir la volatilidad (ATR)',
  MERCADO_LATERAL: 'mercado lateral (ADX por debajo del mínimo)',
  RANGO_INSUFICIENTE: 'el mercado se mueve demasiado poco',
  SIN_IMPULSO: 'no hay impulso previo válido',
  SIN_DOJI: 'no hay doji de indecisión tras el impulso',
  SIN_FUERZA: 'la última vela no es vela de fuerza válida',
  CONFIANZA_BAJA: 'la confianza no llega al mínimo configurado',
};

export interface SignalIFC {
  /** Índice de la vela de continuidad (donde se entra). */
  index: number;
  direction: Direccion;
  confidence: number;
  reason: string;
  entryPrice: number;
  impulso: ImpulsoInfo;
  dojiIndex: number;
  forceIndex: number;
  fuerza: FuerzaInfo;
  adx: number;
  atr: number;
}

export interface Evaluacion {
  signal: SignalIFC | null;
  motivo: MotivoRechazo | null;
  detalle: string;
  adx: number;
  atr: number;
  impulso: ImpulsoInfo | null;
  dojiIndex: number | null;
}

/**
 * Evalúa el patrón tomando `forceIdx` como la vela de fuerza (la que acaba de
 * cerrar). Si todo cuadra, la entrada va en forceIdx + 1: la vela de continuidad.
 */
export function evaluarEn(
  velas: Candle[],
  forceIdx: number,
  config: StrategyConfig = DEFAULT_STRATEGY_CONFIG,
): Evaluacion {
  const vacio = (motivo: MotivoRechazo, detalle = '', extra: Partial<Evaluacion> = {}): Evaluacion => ({
    signal: null,
    motivo,
    detalle: detalle || TEXTO_RECHAZO[motivo],
    adx: 0,
    atr: 0,
    impulso: null,
    dojiIndex: null,
    ...extra,
  });

  const minimoNecesario = config.adxPeriod * 2 + config.impulseMaxCandles + 4;
  if (forceIdx < config.impulseMinCandles + 2 || velas.length < 10) {
    return vacio('POCAS_VELAS');
  }

  const atr = calcularATR(velas, forceIdx, config.adxPeriod);
  if (atr <= 0) return vacio('SIN_ATR');

  const { adx } = calcularADX(velas, forceIdx, config.adxPeriod);

  if (config.lateralFilterEnabled) {
    if (forceIdx + 1 < minimoNecesario) {
      return vacio('POCAS_VELAS', `hacen falta ~${minimoNecesario} velas para el ADX`, { atr });
    }
    if (adx < config.adxMin) {
      return vacio('MERCADO_LATERAL', `mercado lateral (ADX ${adx.toFixed(1)} < ${config.adxMin})`, { adx, atr });
    }
    if (config.lateralMinRangeATR > 0) {
      const desde = Math.max(0, forceIdx - config.lateralLookback + 1);
      const tramo = velas.slice(desde, forceIdx + 1);
      const rango = Math.max(...tramo.map(c => c.high)) - Math.min(...tramo.map(c => c.low));
      if (rango < config.lateralMinRangeATR * atr) {
        return vacio('RANGO_INSUFICIENTE', `el mercado se mueve poco (rango ${(rango / atr).toFixed(2)} ATR)`, { adx, atr });
      }
    }
  }

  const fuerzaVela = analizarVela(velas[forceIdx], forceIdx);

  // El doji puede estar 1..maxCandlesDojiToForce velas antes de la fuerza,
  // y el impulso termina 1..maxCandlesImpulseToDoji velas antes del doji.
  for (let saltoFuerza = 1; saltoFuerza <= Math.max(1, config.maxCandlesDojiToForce); saltoFuerza++) {
    const dojiIdx = forceIdx - saltoFuerza;
    if (dojiIdx < 1) break;
    const dojiVela = analizarVela(velas[dojiIdx], dojiIdx);

    for (let saltoDoji = 1; saltoDoji <= Math.max(1, config.maxCandlesImpulseToDoji); saltoDoji++) {
      const finImpulso = dojiIdx - saltoDoji;
      if (finImpulso < config.impulseMinCandles - 1) break;

      const impulso = detectarImpulso(velas, finImpulso, config, atr);
      if (!impulso) continue;

      if (!esDoji(dojiVela, impulso.sentido, config)) continue;

      const fuerza = esVelaFuerza(fuerzaVela, dojiVela, impulso.sentido, config, atr);
      if (!fuerza) continue;

      // La entrada va a favor de la VELA DE FUERZA: si la fuerza es verde se
      // compra, si es roja se vende. Como la fuerza es del color del doji, y el
      // doji es del color contrario al impulso, la entrada queda en contra del
      // impulso previo (que es justo lo que se ve en el gráfico: el precio se
      // gira y la vela de continuidad sigue a la de fuerza).
      const aFavorDeLaFuerza: Direccion = fuerza.rompe === 'SUPERIOR' ? 'CALL' : 'PUT';
      const direction: Direccion = config.direction === 'impulso'
        ? (aFavorDeLaFuerza === 'CALL' ? 'PUT' : 'CALL')
        : aFavorDeLaFuerza;

      const confidence = calcularConfianza(impulso, dojiVela, fuerza, adx, config);
      const reason = construirMotivo(impulso, dojiVela, fuerzaVela, fuerza, direction, adx);

      if (confidence < config.minConfidence) {
        return vacio(
          'CONFIANZA_BAJA',
          `patrón completo pero ${confidence.toFixed(0)}% < ${config.minConfidence}% · ${reason}`,
          { adx, atr, impulso, dojiIndex: dojiIdx },
        );
      }

      const continuidadIdx = forceIdx + 1;
      return {
        signal: {
          index: continuidadIdx,
          direction,
          confidence,
          reason,
          // Precio de referencia: el cierre de la vela de fuerza, que es el
          // último precio real conocido al decidir la entrada.
          entryPrice: velas[forceIdx].close,
          impulso,
          dojiIndex: dojiIdx,
          forceIndex: forceIdx,
          fuerza,
          adx,
          atr,
        },
        motivo: null,
        detalle: reason,
        adx,
        atr,
        impulso,
        dojiIndex: dojiIdx,
      };
    }
  }

  // Nada cuadró: se explica lo más avanzado que se consiguió
  const impulsoCercano = detectarImpulso(velas, forceIdx - 1, config, atr)
    || detectarImpulso(velas, forceIdx - 2, config, atr);

  if (!impulsoCercano) {
    return vacio('SIN_IMPULSO', `sin impulso de ${config.impulseMinCandles}+ velas antes de la señal`, { adx, atr });
  }

  const dojiIdx = forceIdx - 1;
  const dojiVela = analizarVela(velas[dojiIdx], dojiIdx);
  if (!esDoji(dojiVela, impulsoCercano.sentido, config)) {
    return vacio(
      'SIN_DOJI',
      `impulso ${impulsoCercano.sentido} de ${impulsoCercano.velas} velas, pero la siguiente no es doji ${colorEsperadoDoji(impulsoCercano.sentido)} (cuerpo ${dojiVela.bodyPct.toFixed(0)}%, mechas ${dojiVela.upperWickPct.toFixed(0)}/${dojiVela.lowerWickPct.toFixed(0)}%)`,
      { adx, atr, impulso: impulsoCercano },
    );
  }

  return vacio(
    'SIN_FUERZA',
    `impulso + doji correctos, pero la vela de fuerza no cumple (cuerpo ${fuerzaVela.bodyPct.toFixed(0)}%, rango ${(fuerzaVela.range / atr).toFixed(2)} ATR, color ${fuerzaVela.color})`,
    { adx, atr, impulso: impulsoCercano, dojiIndex: dojiIdx },
  );
}

/** Evalúa la ÚLTIMA vela cerrada como vela de fuerza. Es lo que usa el bot. */
export function evaluarUltimaCerrada(
  velasCerradas: Candle[],
  config: StrategyConfig = DEFAULT_STRATEGY_CONFIG,
): Evaluacion {
  return evaluarEn(velasCerradas, velasCerradas.length - 1, config);
}

// ============================================================
// Confianza y descripción
// ============================================================

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

/**
 * Confianza 0-100 según la calidad real del patrón.
 * Antes estaba fija en 85, así que el filtro de confianza mínima no descartaba
 * nada nunca.
 */
export function calcularConfianza(
  impulso: ImpulsoInfo,
  doji: VelaInfo,
  fuerza: FuerzaInfo,
  adx: number,
  config: StrategyConfig,
): number {
  // Un patrón que cumple justo los mínimos parte de 50. A partir de ahí suma
  // según lo bueno que sea cada tramo, hasta un máximo de 99.
  // Los pesos suman 49, así que la escala reparte de verdad en vez de
  // amontonarse arriba (con la escala anterior casi todo salía al tope y el
  // filtro de confianza mínima no descartaba nada).
  let conf = 50;

  // Impulso: cuanto más recorrido y menos retroceso, mejor
  conf += clamp01((impulso.avanceATR - config.impulseMinAdvanceATR) / 2) * 10;
  conf += clamp01((impulso.velas - config.impulseMinCandles) / 4) * 4;
  conf += clamp01(1 - impulso.retrocesoPct / Math.max(1, config.impulseMaxPullbackPct)) * 6;

  // Doji: cuerpo pequeño y mechas parecidas a los dos lados
  conf += clamp01(1 - doji.bodyPct / Math.max(1, config.dojiMaxBodyPct)) * 8;
  const simetria = 1 - Math.abs(doji.upperWickPct - doji.lowerWickPct) / 100;
  conf += clamp01(simetria) * 4;

  // Fuerza: tamaño y cuánto sobrepasa la mecha
  conf += clamp01((fuerza.rangoATR - config.forceMinRangeATR) / 1.5) * 6;
  conf += clamp01(fuerza.bodyPct / 100) * 3;
  conf += clamp01(fuerza.superaEnATR / 0.5) * 4;

  // Tendencia clara
  conf += clamp01((adx - config.adxMin) / 25) * 4;

  return Math.max(0, Math.min(98, conf));
}

function construirMotivo(
  impulso: ImpulsoInfo,
  doji: VelaInfo,
  fuerzaVela: VelaInfo,
  fuerza: FuerzaInfo,
  direction: Direccion,
  adx: number,
): string {
  const accion = direction === 'CALL' ? 'COMPRA' : 'VENTA';
  return [
    `Impulso ${impulso.sentido.toLowerCase()} (${impulso.velas} velas, ${impulso.avanceATR.toFixed(1)} ATR, retroceso ${impulso.retrocesoPct.toFixed(0)}%)`,
    `Doji ${doji.color} (cuerpo ${doji.bodyPct.toFixed(0)}%)`,
    `Fuerza ${fuerzaVela.color} ${fuerza.rangoATR.toFixed(1)} ATR rompe con cuerpo la mecha ${fuerza.rompe.toLowerCase()}`,
    `${accion} a favor de la fuerza · ADX ${adx.toFixed(0)}`,
  ].join(' → ');
}

// ============================================================
// Recorrido histórico (gráfico y backtest)
// ============================================================

export type TipoPatron =
  | 'IMPULSE_BULL' | 'IMPULSE_BEAR'
  | 'DOJI'
  | 'FORCE_BULL' | 'FORCE_BEAR'
  | 'CONTINUITY'
  | 'NEUTRAL';

export interface PatternAnalysis {
  index: number;
  candle: Candle;
  type: TipoPatron;
  details: {
    body: number;
    range: number;
    upperWick: number;
    lowerWick: number;
    bodyPct: number;
    upperWickPct: number;
    lowerWickPct: number;
  };
}

export interface StrategyResult {
  candles: Candle[];
  patterns: PatternAnalysis[];
  signals: SignalIFC[];
  isLateral: boolean;
  lateralScore: number;
  adx: number;
  atr: number;
  lastSignal: SignalIFC | null;
  lastRejection: { motivo: MotivoRechazo; detalle: string } | null;
  description: string;
}

/**
 * Recorre toda la serie buscando patrones. Usa EXACTAMENTE la misma evaluación
 * que el bot en vivo, así que el gráfico y el backtest enseñan lo que el bot
 * habría hecho de verdad.
 */
export function analyzeStrategy(
  candles: Candle[],
  config: StrategyConfig = DEFAULT_STRATEGY_CONFIG,
): StrategyResult {
  const patterns: PatternAnalysis[] = candles.map((c, i) => {
    const v = analizarVela(c, i);
    return {
      index: i,
      candle: c,
      type: 'NEUTRAL' as TipoPatron,
      details: {
        body: v.body, range: v.range,
        upperWick: v.upperWick, lowerWick: v.lowerWick,
        bodyPct: v.bodyPct, upperWickPct: v.upperWickPct, lowerWickPct: v.lowerWickPct,
      },
    };
  });

  const signals: SignalIFC[] = [];

  // La vela de fuerza no puede ser la última: hace falta la de continuidad.
  for (let i = 0; i < candles.length - 1; i++) {
    const ev = evaluarEn(candles, i, config);
    if (!ev.signal) continue;

    const s = ev.signal;
    signals.push(s);

    // Marcar el patrón encontrado sobre el gráfico
    for (let k = s.impulso.desdeIndex; k <= s.impulso.hastaIndex; k++) {
      patterns[k].type = s.impulso.sentido === 'ALCISTA' ? 'IMPULSE_BULL' : 'IMPULSE_BEAR';
    }
    patterns[s.dojiIndex].type = 'DOJI';
    patterns[s.forceIndex].type =
      candles[s.forceIndex].close > candles[s.forceIndex].open ? 'FORCE_BULL' : 'FORCE_BEAR';
    if (patterns[s.index]) patterns[s.index].type = 'CONTINUITY';
  }

  const ultimaEval = evaluarEn(candles, candles.length - 1, config);
  const adx = ultimaEval.adx;
  const atr = ultimaEval.atr;
  const isLateral = config.lateralFilterEnabled && adx < config.adxMin;
  const lateralScore = Math.max(0, Math.min(100, 100 - adx * 2));

  const lastSignal = signals.length > 0 ? signals[signals.length - 1] : null;

  let description: string;
  if (ultimaEval.signal) {
    description = `Señal ACTIVA: ${ultimaEval.signal.direction === 'CALL' ? 'COMPRA' : 'VENTA'} con ${ultimaEval.signal.confidence.toFixed(0)}% de confianza. ${ultimaEval.detalle}`;
  } else {
    description = `Sin entrada ahora: ${ultimaEval.detalle}. Señales encontradas en el histórico: ${signals.length}.`;
  }

  return {
    candles,
    patterns,
    signals,
    isLateral,
    lateralScore,
    adx,
    atr,
    lastSignal,
    lastRejection: ultimaEval.motivo ? { motivo: ultimaEval.motivo, detalle: ultimaEval.detalle } : null,
    description,
  };
}
