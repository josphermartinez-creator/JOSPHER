/**
 * Pruebas del puente entre el bot y el motor de la estrategia.
 * Ejecutar:  npx tsx strategy.test.ts
 *
 * Las reglas de la estrategia se prueban en src/lib/ifc-strategy.test.ts.
 * Aquí se comprueba lo que añade el bot: que no analice dos veces la misma
 * vela, que descarte la vela en formación y que use la configuración guardada.
 */

import { detectSignal, velasCerradas, estados, parseConfig, DEFAULT_STRATEGY_CONFIG, type Candle } from './strategy';

let fallos = 0;
let pasadas = 0;

function check(nombre: string, ok: boolean, detalle = '') {
  if (ok) { pasadas++; console.log(`  OK    ${nombre}`); }
  else { fallos++; console.log(`  FALLA ${nombre}${detalle ? ' :: ' + detalle : ''}`); }
}

// ------------------------------------------------------------
// Serie con patrón completo: impulso bajista + doji verde + fuerza verde
// ------------------------------------------------------------
// Base alineada al minuto exacto (1_700_000_040 % 60 === 0).
const T0 = 1_700_000_040;

// La serie tiene 47 velas: 44 de impulso + doji + fuerza + la que se está
// formando. AHORA es 400 ms despues de abrirse esa ultima, que es justo el
// instante en que el bot despierta cada minuto.
const VELAS_EN_SERIE = 47;
const AHORA_MS = (T0 + (VELAS_EN_SERIE - 1) * 60) * 1000 + 400;

/** Igual que llamar a detectSignal desde el bot en el instante AHORA_MS. */
function detectar(
  pair: string,
  velas: Candle[],
  config = DEFAULT_STRATEGY_CONFIG,
  onLog?: any,
  ahoraMs = AHORA_MS,
) {
  return detectSignal(pair, velas, config, onLog ?? (() => {}), 60, ahoraMs);
}

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
  const s = detectar('PAR-A', velas);
  check('da señal', s !== null);
  check('la dirección es COMPRA (a favor de la vela de fuerza verde)',
    s?.direction === 'CALL', s?.direction);
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
  const s = detectar('PAR-B', velas);
  check('se analiza la última vela CERRADA', s !== null);
  check('queda registrada la vela cerrada, no la que se está formando',
    estados.get('PAR-B')?.ultimaVelaProcesada === velas[velas.length - 2].time);
}

console.log('\n== 3. La misma vela no se analiza dos veces ==');
{
  estados.clear();
  const velas = construirSerie();
  const primera = detectar('PAR-C', velas);
  const repetida = detectar('PAR-C', velas);
  check('la primera pasada da señal', primera !== null);
  check('repetir las mismas velas no vuelve a disparar', repetida === null);
}

console.log('\n== 4. Cada par lleva su propia cuenta ==');
{
  estados.clear();
  const velas = construirSerie();
  const a = detectar('PAR-D', velas);
  const b = detectar('PAR-E', velas);
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

  const s = detectar('PAR-F', velas, config);
  check('con la confianza mínima al 99% no entra', s === null);

  estados.clear();
  const s2 = detectar('PAR-F', velas, parseConfig('{}'));
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
  const s = detectar('PAR-G', plano, DEFAULT_STRATEGY_CONFIG, (_t: string, m: string) => logs.push(m), (T0 + 49 * 60) * 1000 + 400);
  check('en mercado plano no entra', s === null);
  check('y deja escrito por qué', logs.length === 1 && logs[0].includes('lateral'), logs.join(' | '));
}

console.log('\n== 7. Entra en la vela correcta, no un minuto tarde ==');
{
  // Esto es lo que le pasó al usuario. El broker devolvió SOLO velas cerradas,
  // sin la que se está formando. El código anterior tiraba siempre la última
  // ("total, es la que está en curso"), así que se comía la VELA DE FUERZA: el
  // patrón se completaba un minuto más tarde y la entrada caía una vela después
  // de la que toca.
  const serie = construirSerie();
  const soloCerradas = serie.slice(0, -1);
  const fuerza = soloCerradas[soloCerradas.length - 1];

  const cerradas = velasCerradas(soloCerradas, 60, AHORA_MS);
  check('la vela de fuerza cuenta como cerrada',
    cerradas[cerradas.length - 1].time === fuerza.time);

  estados.clear();
  const s = detectar('PAR-H', soloCerradas);
  check('entra en la vela de continuidad, la de justo después de la fuerza', s !== null);
  check('el precio de referencia es el cierre de la vela de fuerza',
    s?.entryPrice === fuerza.close, String(s?.entryPrice));

  // El criterio viejo, hecho a mano: tirar la última pase lo que pase
  estados.clear();
  const comoAntes = detectar('PAR-I', soloCerradas.slice(0, -1));
  check('con el criterio viejo (tirar la última siempre) aquí NO habría entrado',
    comoAntes === null);

  // La vela en formación se sigue descartando cuando el broker sí la manda
  const conFormacion = velasCerradas(serie, 60, AHORA_MS);
  check('la vela en formación se sigue quedando fuera',
    conFormacion.length === serie.length - 1 &&
    conFormacion[conFormacion.length - 1].time === fuerza.time);

  // Un minuto más tarde el patrón ya no está en la última cerrada: no repite
  estados.clear();
  const tarde = detectar('PAR-J', serie, DEFAULT_STRATEGY_CONFIG, undefined, AHORA_MS + 60_000);
  check('un minuto después ya no entra (no duplica la entrada)', tarde === null);

  // Desfase de reloj: el PC atrasado 3s no puede hacerle perder la entrada
  estados.clear();
  const desfase = detectar('PAR-K', soloCerradas, DEFAULT_STRATEGY_CONFIG, undefined, AHORA_MS - 3000);
  check('con el reloj del PC 3s atrasado sigue entrando a tiempo', desfase !== null);
}

console.log('\n== 8. El caso exacto de la foto, minuto a minuto ==');
{
  // serie = [ ...impulso bajista, doji verde, VELA DE FUERZA, continuidad ]
  const serie = construirSerie();
  const hastaFuerza = serie.slice(0, -1);   // lo que manda el broker en el minuto 1
  const hastaContinuidad = serie;           // lo que manda en el minuto 2
  const MIN1 = AHORA_MS;                    // 400 ms tras abrirse la vela de continuidad
  const MIN2 = AHORA_MS + 60_000;           // un minuto mas tarde

  // --- Comportamiento de AHORA ---
  estados.clear();
  const ahora1 = detectar('AHORA', hastaFuerza, DEFAULT_STRATEGY_CONFIG, undefined, MIN1);
  const ahora2 = detectar('AHORA', hastaContinuidad, DEFAULT_STRATEGY_CONFIG, undefined, MIN2);
  check('minuto 1, nada más cerrar la vela de fuerza: ENTRA (flecha azul)', ahora1 !== null);
  check('minuto 2: no vuelve a entrar', ahora2 === null);

  // --- Comportamiento de ANTES: tirar siempre la última vela recibida ---
  estados.clear();
  const antes1 = detectar('ANTES', hastaFuerza.slice(0, -1), DEFAULT_STRATEGY_CONFIG, undefined, MIN1);
  const antes2 = detectar('ANTES', hastaContinuidad.slice(0, -1), DEFAULT_STRATEGY_CONFIG, undefined, MIN2);
  check('antes, en el minuto 1 NO entraba: se comía la vela de fuerza', antes1 === null);
  check('antes, entraba en el minuto 2, una vela tarde (flecha amarilla)', antes2 !== null);
}

console.log(`\n${pasadas} pruebas correctas, ${fallos} fallidas\n`);
process.exit(fallos > 0 ? 1 : 0);
