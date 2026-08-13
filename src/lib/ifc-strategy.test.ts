/**
 * Pruebas del motor de la estrategia.
 * Ejecutar:  npx tsx src/lib/ifc-strategy.test.ts
 *
 * Cada prueba comprueba UNA de las reglas tal como están descritas:
 *   impulso (4+ velas, colores mezclados) + doji del color contrario +
 *   vela de fuerza del color del doji que sobrepasa su mecha
 *   = entrada a favor del impulso en la vela de continuidad.
 */

import {
  evaluarEn,
  DEFAULT_STRATEGY_CONFIG,
  calcularADX,
  type Candle,
  type StrategyConfig,
} from './ifc-strategy';

let fallos = 0;
let pasadas = 0;

function check(nombre: string, ok: boolean, detalle = '') {
  if (ok) { pasadas++; console.log(`  OK    ${nombre}`); }
  else { fallos++; console.log(`  FALLA ${nombre}${detalle ? ' :: ' + detalle : ''}`); }
}

function grupo(titulo: string) {
  console.log(`\n== ${titulo} ==`);
}

// ------------------------------------------------------------
// Constructor de series
// ------------------------------------------------------------
const T0 = 1_700_000_000;
const PASO = 0.0010;

class Serie {
  velas: Candle[] = [];
  private t = T0;

  add(open: number, high: number, low: number, close: number) {
    this.velas.push({ time: this.t, open, high, low, close, volume: 100 });
    this.t += 60;
    return this;
  }

  get ultimoCierre(): number {
    return this.velas.length ? this.velas[this.velas.length - 1].close : 1.10;
  }

  /** Tendencia bajista sostenida: sirve de calentamiento para que el ADX suba. */
  bajista(n: number, paso = PASO) {
    for (let i = 0; i < n; i++) {
      const o = this.ultimoCierre;
      const c = o - paso;
      this.add(o, o + paso * 0.15, c - paso * 0.15, c);
    }
    return this;
  }

  alcista(n: number, paso = PASO) {
    for (let i = 0; i < n; i++) {
      const o = this.ultimoCierre;
      const c = o + paso;
      this.add(o, c + paso * 0.15, o - paso * 0.15, c);
    }
    return this;
  }

  /** Vela VERDE que aun asi deja maximo y minimo por debajo: impulso bajista intacto. */
  bajistaVelaVerde(paso = PASO) {
    const prev = this.ultimoCierre;
    const o = prev - paso * 1.5;
    const c = prev - paso * 0.9;
    this.add(o, c + paso * 0.1, o - paso * 0.1, c);
    return this;
  }

  /** Vela ROJA dentro de un impulso alcista. */
  alcistaVelaRoja(paso = PASO) {
    const prev = this.ultimoCierre;
    const o = prev + paso * 1.5;
    const c = prev + paso * 0.9;
    this.add(o, o + paso * 0.1, c - paso * 0.1, c);
    return this;
  }

  /** Mercado plano: el ADX se hunde. */
  lateral(n: number) {
    const base = this.ultimoCierre;
    for (let i = 0; i < n; i++) {
      const o = base + (i % 2 === 0 ? 0.00005 : -0.00005);
      const c = base + (i % 2 === 0 ? -0.00005 : 0.00005);
      this.add(o, base + 0.0001, base - 0.0001, c);
    }
    return this;
  }

  /** Doji: cuerpo pequeño, mechas arriba y abajo. color = el que se quiera. */
  doji(color: 'verde' | 'rojo') {
    const p = this.ultimoCierre;
    const o = color === 'verde' ? p - 0.0001 : p + 0.0001;
    const c = p;
    this.add(o, p + 0.0006, p - 0.0007, c);
    return this;
  }

  /** Vela de fuerza verde: rompe por arriba la mecha del doji anterior. */
  fuerzaVerde(mult = 1) {
    const doji = this.velas[this.velas.length - 1];
    const o = this.ultimoCierre;
    const c = o + 0.0015 * mult;
    this.add(o, Math.max(c, doji.high) + 0.0002, o - 0.0002, c);
    return this;
  }

  /** Vela de fuerza roja: rompe por abajo la mecha del doji anterior. */
  fuerzaRoja(mult = 1) {
    const doji = this.velas[this.velas.length - 1];
    const o = this.ultimoCierre;
    const c = o - 0.0015 * mult;
    this.add(o, o + 0.0002, Math.min(c, doji.low) - 0.0002, c);
    return this;
  }

  /** Vela normal (ni doji ni fuerza), para meter ruido entre medias. */
  relleno() {
    const o = this.ultimoCierre;
    const c = o + 0.0002;
    this.add(o, c + 0.0002, o - 0.0002, c);
    return this;
  }
}

/** Escenario base: impulso BAJISTA con colores mezclados + doji verde + fuerza verde. */
function escenarioBajista() {
  return new Serie()
    .bajista(40)              // calentamiento: ADX alto
    .bajista(2)
    .bajistaVelaVerde()       // color mezclado dentro del impulso
    .bajista(1)
    .doji('verde')
    .fuerzaVerde();
}

/** Escenario espejo: impulso ALCISTA + doji rojo + fuerza roja. */
function escenarioAlcista() {
  return new Serie()
    .alcista(40)
    .alcista(2)
    .alcistaVelaRoja()
    .alcista(1)
    .doji('rojo')
    .fuerzaRoja();
}

const cfg = (over: Partial<StrategyConfig> = {}): StrategyConfig => ({
  ...DEFAULT_STRATEGY_CONFIG,
  ...over,
});

function evaluarFinal(s: Serie, config = cfg()) {
  return evaluarEn(s.velas, s.velas.length - 1, config);
}

// ------------------------------------------------------------
grupo('1. Patrón completo → señal');
{
  const ev = evaluarFinal(escenarioBajista());
  check('impulso bajista + doji verde + fuerza verde da señal', ev.signal !== null, ev.detalle);
  check('la dirección es VENTA (continuidad del impulso)', ev.signal?.direction === 'PUT', ev.signal?.direction);
  check('la entrada se marca en la vela de continuidad',
    ev.signal?.index === ev.signal!.forceIndex + 1);

  const evA = evaluarFinal(escenarioAlcista());
  check('caso espejo: impulso alcista + doji rojo + fuerza roja', evA.signal !== null, evA.detalle);
  check('la dirección es COMPRA', evA.signal?.direction === 'CALL', evA.signal?.direction);
}

// ------------------------------------------------------------
grupo('2. El impulso admite velas de colores mezclados');
{
  const ev = evaluarFinal(escenarioBajista());
  check('detecta el impulso pese a la vela verde intercalada',
    ev.signal?.impulso.sentido === 'BAJISTA', String(ev.signal?.impulso.sentido));
  check('el impulso tiene 4 velas o más',
    (ev.signal?.impulso.velas ?? 0) >= 4, String(ev.signal?.impulso.velas));
}

// ------------------------------------------------------------
grupo('3. El impulso puede ser de 4, 5, 6 o más velas');
{
  // Se corta el impulso con un tramo lateral para que se mida solo el tramo nuevo
  const corto = new Serie().bajista(40).lateral(4).bajista(4).doji('verde').fuerzaVerde();
  const largo = new Serie().bajista(40).lateral(4).bajista(8).doji('verde').fuerzaVerde();

  const evC = evaluarFinal(corto, cfg({ impulseMaxCandles: 6 }));
  const evL = evaluarFinal(largo, cfg({ impulseMaxCandles: 12 }));
  check('impulso corto válido', evC.signal !== null, evC.detalle);
  check('impulso largo válido', evL.signal !== null, evL.detalle);
  check('nunca se cuentan más velas que el máximo configurado',
    (evC.signal?.impulso.velas ?? 99) <= 6 && (evL.signal?.impulso.velas ?? 99) <= 12,
    `${evC.signal?.impulso.velas} / ${evL.signal?.impulso.velas}`);
  check('el impulso se mide con 4 velas o más',
    (evC.signal?.impulso.velas ?? 0) >= 4 && (evL.signal?.impulso.velas ?? 0) >= 4);

  const muyCorto = evaluarEn(
    new Serie().bajista(40).lateral(3).bajista(3).doji('verde').fuerzaVerde().velas,
    -1 + new Serie().velas.length,
    cfg({ impulseMinCandles: 4 }),
  );
  check('un impulso de 3 velas no vale', muyCorto.signal === null);
}

// ------------------------------------------------------------
grupo('4. El doji tiene que ser del color contrario al impulso');
{
  const malColor = new Serie().bajista(40).bajista(4).doji('rojo').fuerzaVerde();
  const ev = evaluarFinal(malColor);
  check('doji rojo tras impulso bajista → sin señal', ev.signal === null, ev.detalle);
  check('el motivo dice que falta el doji', ev.motivo === 'SIN_DOJI', String(ev.motivo));

  // Al desactivar la regla el doji deja de ser el problema (ahora falla la
  // fuerza, que sigue exigiendo el color del doji: son dos reglas distintas).
  const sinFiltroColor = evaluarFinal(malColor, cfg({ dojiOppositeColor: false }));
  check('desactivando la regla de color, el doji deja de bloquear',
    sinFiltroColor.motivo !== 'SIN_DOJI', String(sinFiltroColor.motivo));
}

// ------------------------------------------------------------
grupo('5. El doji tiene que tener mechas a los dos lados');
{
  const s = new Serie().bajista(40).bajista(4);
  const p = s.ultimoCierre;
  // cuerpo pequeño pero SIN mecha inferior
  s.add(p - 0.0001, p + 0.0006, p - 0.0001, p);
  const doji = s.velas[s.velas.length - 1];
  const o = s.ultimoCierre;
  s.add(o, Math.max(o + 0.0015, doji.high) + 0.0002, o - 0.0002, o + 0.0015);

  const ev = evaluarFinal(s);
  check('sin mecha inferior no es doji', ev.signal === null, ev.detalle);
}

// ------------------------------------------------------------
grupo('6. La vela de fuerza tiene que ser del color del doji');
{
  const s = new Serie().bajista(40).bajista(4).doji('verde').fuerzaRoja();
  const ev = evaluarFinal(s);
  check('doji verde + fuerza roja → sin señal', ev.signal === null, ev.detalle);
  check('el motivo apunta a la vela de fuerza', ev.motivo === 'SIN_FUERZA', String(ev.motivo));
}

// ------------------------------------------------------------
grupo('7. La vela de fuerza tiene que ser "de buen tamaño"');
{
  const s = new Serie().bajista(40).bajista(4).doji('verde');
  const doji = s.velas[s.velas.length - 1];
  // vela verde que sobrepasa la mecha pero es diminuta
  const o = s.ultimoCierre;
  s.add(o, doji.high + 0.00002, o - 0.00002, o + 0.00003);

  const ev = evaluarFinal(s);
  check('una vela minúscula no es vela de fuerza', ev.signal === null, ev.detalle);

  const permisivo = evaluarFinal(s, cfg({ forceMinBodyPct: 1, forceMinRangeATR: 0 }));
  check('bajando los mínimos, la misma vela pasa', permisivo.signal !== null, permisivo.detalle);
}

// ------------------------------------------------------------
grupo('8. La vela de fuerza tiene que sobrepasar la mecha del doji');
{
  const s = new Serie().bajista(40).bajista(4).doji('verde');
  const doji = s.velas[s.velas.length - 1];
  const o = s.ultimoCierre;
  // verde y grande, pero se queda por debajo de la mecha superior del doji
  s.add(o - 0.0016, doji.high - 0.0002, o - 0.0018, o - 0.0002);

  const ev = evaluarFinal(s);
  check('si no rompe la mecha, no hay entrada', ev.signal === null, ev.detalle);
}

// ------------------------------------------------------------
grupo('9. La secuencia tiene que ir seguida (esto es lo que evitaba entrar tarde)');
{
  const conHueco = new Serie().bajista(40).bajista(4).doji('verde').relleno().fuerzaVerde();
  const ev = evaluarFinal(conHueco);
  check('una vela suelta entre el doji y la fuerza invalida el patrón', ev.signal === null, ev.detalle);

  const conVentana = evaluarFinal(conHueco, cfg({ maxCandlesDojiToForce: 2 }));
  check('ampliando la ventana a 2 velas, sí entra', conVentana.signal !== null, conVentana.detalle);

  // Una vela grande en contra SÍ rompe el impulso: ya no hay impulso válido
  // justo antes del doji.
  const impulsoRoto = new Serie().bajista(40).bajista(4).alcista(3).doji('verde').fuerzaVerde();
  const evH = evaluarFinal(impulsoRoto);
  check('si el impulso se da la vuelta antes del doji, no hay entrada', evH.signal === null, evH.detalle);
}

// ------------------------------------------------------------
grupo('10. Filtro de mercado lateral (ADX de Wilder)');
{
  const plano = new Serie().lateral(45).doji('verde').fuerzaVerde();
  const ev = evaluarFinal(plano);
  check('en lateral no se opera', ev.signal === null, ev.detalle);
  check('el motivo es mercado lateral', ev.motivo === 'MERCADO_LATERAL', `${ev.motivo} (ADX ${ev.adx.toFixed(1)})`);

  const tendencial = escenarioBajista();
  const adxT = calcularADX(tendencial.velas, tendencial.velas.length - 1, 14).adx;
  const adxP = calcularADX(plano.velas, plano.velas.length - 1, 14).adx;
  check('el ADX distingue tendencia de lateral', adxT > 25 && adxP < 25, `tendencia ${adxT.toFixed(1)} / lateral ${adxP.toFixed(1)}`);
  check('el ADX se mantiene en el rango 0-100', adxT <= 100 && adxT >= 0, adxT.toFixed(1));
}

// ------------------------------------------------------------
grupo('11. La confianza se calcula de verdad y el mínimo filtra');
{
  const ev = evaluarFinal(escenarioBajista());
  check('la confianza no está fijada en 85', ev.signal?.confidence !== 85, String(ev.signal?.confidence));
  check('la confianza está entre 0 y 99',
    (ev.signal?.confidence ?? -1) > 0 && (ev.signal?.confidence ?? 100) <= 99,
    String(ev.signal?.confidence));

  const exigente = evaluarFinal(escenarioBajista(), cfg({ minConfidence: 99 }));
  check('con el mínimo al 99% se descarta', exigente.signal === null);
  check('y avisa de que fue por confianza', exigente.motivo === 'CONFIANZA_BAJA', String(exigente.motivo));
}

// ------------------------------------------------------------
grupo('12. Los parámetros del panel se respetan');
{
  const base = escenarioBajista();

  check('doji: bajando el cuerpo máximo al 1% se rechaza',
    evaluarFinal(base, cfg({ dojiMaxBodyPct: 1 })).signal === null);
  check('doji: subiendo la mecha mínima al 60% se rechaza',
    evaluarFinal(base, cfg({ dojiMinWickBothSides: 60 })).signal === null);
  check('impulso: exigiendo 20 velas se rechaza',
    evaluarFinal(base, cfg({ impulseMinCandles: 20, impulseMaxCandles: 25 })).signal === null);
  check('impulso: exigiendo un avance de 10 ATR se rechaza',
    evaluarFinal(base, cfg({ impulseMinAdvanceATR: 10 })).signal === null);
  check('fuerza: exigiendo un rango de 5 ATR se rechaza',
    evaluarFinal(base, cfg({ forceMinRangeATR: 5 })).signal === null);
  check('ADX: subiendo el mínimo por encima del actual se rechaza',
    evaluarFinal(base, cfg({ adxMin: 99 })).signal === null);
  check('desactivando el filtro lateral, el ADX deja de bloquear',
    evaluarFinal(new Serie().lateral(45).doji('verde').fuerzaVerde(),
      cfg({ lateralFilterEnabled: false })).motivo !== 'MERCADO_LATERAL');
}

// ------------------------------------------------------------
grupo('13. Modo reversión (por si la dirección fuera la contraria)');
{
  const ev = evaluarFinal(escenarioBajista(), cfg({ direction: 'reversal' }));
  check('en modo reversión la señal se invierte', ev.signal?.direction === 'CALL', ev.signal?.direction);
}

// ------------------------------------------------------------
grupo('14. Cada rechazo dice por qué');
{
  const casos: Array<[string, ReturnType<typeof evaluarFinal>]> = [
    ['lateral', evaluarFinal(new Serie().lateral(45).doji('verde').fuerzaVerde())],
    ['sin doji', evaluarFinal(new Serie().bajista(45).relleno().fuerzaVerde())],
    ['pocas velas', evaluarEn(new Serie().bajista(6).velas, 5)],
  ];
  for (const [nombre, ev] of casos) {
    check(`"${nombre}" trae motivo y explicación`,
      ev.motivo !== null && ev.detalle.length > 5, `${ev.motivo} / ${ev.detalle}`);
  }
}

console.log(`\n${pasadas} pruebas correctas, ${fallos} fallidas\n`);
process.exit(fallos > 0 ? 1 : 0);
