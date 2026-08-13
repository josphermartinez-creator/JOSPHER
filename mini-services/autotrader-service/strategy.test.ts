/**
 * Pruebas del puente entre el bot y el motor de la estrategia.
 * Ejecutar:  npx tsx strategy.test.ts
 *
 * Las reglas de la estrategia se prueban en src/lib/ifc-strategy.test.ts.
 * Aquí se comprueba lo que añade el bot: que no analice dos veces la misma
 * vela, que descarte la vela en formación y que use la configuración guardada.
 */

import { detectSignal, estados, parseConfig, DEFAULT_STRATEGY_CONFIG, type Candle } from './strategy';

let fallos = 0;
let pasadas = 0;

function check(nombre: string, ok: boolean, detalle = '') {
  if (ok) { pasadas++; console.log(`  OK    ${nombre}`); }
  else { fallos++; console.log(`  FALLA ${nombre}${detalle ? ' :: ' + detalle : ''}`); }
}

// ------------------------------------------------------------
// Serie con patrón completo: impulso bajista + doji verde + fuerza verde
// ------------------------------------------------------------
const T0 = 1_700_000_000;

function construirSerie(): Candle[] {
  const velas: Candle[] = [];
  let t = T0;
  let p = 1.10;
  const paso = 0.0010;

  const add = (o: number, h: number, l: number, c: number) => {
    velas.push({ time: t, open: o, high: h, low: l, close: c, volume: 100 });
    t += 60;
  };

  // 44 velas bajistas: tendencia clara para que el ADX suba
  for (let i = 0; i < 44; i++) {
    const o = p;
    const c = o - paso;
    add(o, o + paso * 0.15, c - paso * 0.15, c);
    p = c;
  }

  // Doji verde
  const dojiHigh = p + 0.0006;
  add(p - 0.0001, dojiHigh, p - 0.0007, p);

  // Vela de fuerza verde que rompe la mecha superior del doji
  const o = p;
  const c = o + 0.0015;
  add(o, Math.max(c, dojiHigh) + 0.0002, o - 0.0002, c);

  // Vela en formación (la que el bot tiene que ignorar)
  add(c, c + 0.0003, c - 0.0003, c + 0.0001);

  return velas;
}

console.log('\n== 1. Detecta el patrón sobre velas del broker ==');
{
  estados.clear();
  const velas = construirSerie();
  const s = detectSignal('PAR-A', velas);
  check('da señal', s !== null);
  check('la dirección es VENTA (continuidad del impulso bajista)', s?.direction === 'PUT', s?.direction);
  check('el precio de referencia es el cierre de la vela de fuerza',
    s?.entryPrice === velas[velas.length - 2].close, String(s?.entryPrice));
  check('el motivo explica el patrón', (s?.reason || '').includes('Impulso'), s?.reason);
}

console.log('\n== 2. La vela en formación no cuenta ==');
{
  estados.clear();
  const velas = construirSerie();
  // Si NO se descartara la última, la "vela de fuerza" sería la vela en
  // formación y no habría patrón.
  const s = detectSignal('PAR-B', velas);
  check('se analiza la última vela CERRADA', s !== null);
  check('queda registrada la vela cerrada, no la que se está formando',
    estados.get('PAR-B')?.ultimaVelaProcesada === velas[velas.length - 2].time);
}

console.log('\n== 3. La misma vela no se analiza dos veces ==');
{
  estados.clear();
  const velas = construirSerie();
  const primera = detectSignal('PAR-C', velas);
  const repetida = detectSignal('PAR-C', velas);
  check('la primera pasada da señal', primera !== null);
  check('repetir las mismas velas no vuelve a disparar', repetida === null);
}

console.log('\n== 4. Cada par lleva su propia cuenta ==');
{
  estados.clear();
  const velas = construirSerie();
  const a = detectSignal('PAR-D', velas);
  const b = detectSignal('PAR-E', velas);
  check('el par D da señal', a !== null);
  check('el par E también, no se pisan', b !== null);
  check('cada uno guarda su estado', estados.size === 2, String(estados.size));
}

console.log('\n== 5. Se usa la configuración guardada ==');
{
  estados.clear();
  const velas = construirSerie();

  const guardada = JSON.stringify({ minConfidence: 99, adxMin: 30 });
  const config = parseConfig(guardada);
  check('parseConfig lee los valores del usuario', config.minConfidence === 99 && config.adxMin === 30);
  check('y mantiene los de fábrica que no se tocaron',
    config.impulseMinCandles === DEFAULT_STRATEGY_CONFIG.impulseMinCandles);

  const s = detectSignal('PAR-F', velas, config);
  check('con la confianza mínima al 99% no entra', s === null);

  estados.clear();
  const s2 = detectSignal('PAR-F', velas, parseConfig('{}'));
  check('con la configuración de fábrica sí entra', s2 !== null);

  check('una configuración corrupta no rompe nada',
    parseConfig('{esto no es json').impulseMinCandles === DEFAULT_STRATEGY_CONFIG.impulseMinCandles);
}

console.log('\n== 6. Se avisa del motivo cuando no hay entrada ==');
{
  estados.clear();
  const logs: string[] = [];
  const plano: Candle[] = [];
  let t = T0;
  for (let i = 0; i < 50; i++) {
    plano.push({ time: t, open: 1.1, high: 1.1001, low: 1.0999, close: 1.1, volume: 100 });
    t += 60;
  }
  const s = detectSignal('PAR-G', plano, DEFAULT_STRATEGY_CONFIG, (_t, m) => logs.push(m));
  check('en mercado plano no entra', s === null);
  check('y deja escrito por qué', logs.length === 1 && logs[0].includes('lateral'), logs.join(' | '));
}

console.log(`\n${pasadas} pruebas correctas, ${fallos} fallidas\n`);
process.exit(fallos > 0 ? 1 : 0);
