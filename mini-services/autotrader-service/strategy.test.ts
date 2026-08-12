/**
 * Pruebas de la estrategia.
 * Ejecutar:  npx tsx strategy.test.ts
 *
 * La prueba clave es la 2: dos pares analizados a la vez tienen que llevar su
 * propia secuencia. Con el estado global anterior era imposible.
 */

import { detectSignal, estados, type Candle } from './strategy';

let fallos = 0;
let pasadas = 0;

function check(nombre: string, condicion: boolean, detalle = '') {
  if (condicion) {
    pasadas++;
    console.log(`  OK   ${nombre}`);
  } else {
    fallos++;
    console.log(`  FALLA ${nombre} ${detalle}`);
  }
}

const T0 = Math.floor(Date.now() / 1000) - 100 * 60;
let seq = 0;
const vela = (o: number, h: number, l: number, c: number): Candle => ({
  time: T0 + (seq++) * 60,
  open: o, high: h, low: l, close: c, volume: 100,
});

/** Serie base con movimiento suficiente para que el ADX supere el umbral. */
function serieTendencial(base: number, n: number, paso: number): Candle[] {
  const out: Candle[] = [];
  let p = base;
  for (let i = 0; i < n; i++) {
    const open = p;
    const close = p + paso;
    out.push(vela(open, Math.max(open, close) + paso * 0.1, Math.min(open, close) - paso * 0.1, close));
    p = close;
  }
  return out;
}

/** Cuatro velas con maximos y minimos siempre subiendo: impulso ALCISTA. */
function impulsoAlcista(desde: number): Candle[] {
  const out: Candle[] = [];
  let p = desde;
  for (let i = 0; i < 4; i++) {
    const open = p;
    const close = p + 0.0010;
    out.push(vela(open, close + 0.0002, open - 0.0001, close));
    p = close;
  }
  return out;
}

/** Doji rojo: cuerpo < 20% del rango y mechas > 10% a ambos lados. */
function dojiRojo(precio: number): Candle {
  const rango = 0.0020;
  const open = precio + 0.0002;
  const close = precio;                       // rojo, cuerpo 0.0002 = 10% del rango
  return vela(open, precio + 0.0010, precio - 0.0010, close);
}

/** Vela de fuerza para impulso alcista: roja y con minimo por debajo del doji. */
function fuerzaBajista(precio: number, minimoDoji: number): Candle {
  const open = precio;
  const close = precio - 0.0015;
  return vela(open, open + 0.0002, minimoDoji - 0.0005, close);
}

console.log('\n== 1. Sin patron no hay señal ==');
{
  estados.clear();
  const base = serieTendencial(1.1, 30, 0.0008);
  const s = detectSignal('TEST1', base);
  check('serie limpia sin doji -> sin señal', s === null);
}

console.log('\n== 2. Dos pares a la vez mantienen secuencias independientes ==');
{
  estados.clear();
  seq = 0;

  const construir = (pair: string) => {
    const historia = serieTendencial(1.1, 25, 0.0009);
    const ultimo = historia[historia.length - 1].close;
    const imp = impulsoAlcista(ultimo);
    const trasImpulso = imp[imp.length - 1].close;
    const doji = dojiRojo(trasImpulso);
    const fuerza = fuerzaBajista(doji.close, doji.low);
    const formandose = vela(fuerza.close, fuerza.close + 0.0003, fuerza.close - 0.0003, fuerza.close);
    return { historia, imp, doji, fuerza, formandose };
  };

  const A = construir('PAR-A');
  const B = construir('PAR-B');

  // Fase 1 en ambos pares, alternando (esto es lo que rompia antes)
  const paso1A = [...A.historia, ...A.imp, A.formandose];
  const paso1B = [...B.historia, ...B.imp, B.formandose];
  detectSignal('PAR-A', paso1A);
  detectSignal('PAR-B', paso1B);

  check('PAR-A guarda su impulso', estados.get('PAR-A')?.impulso === 'ALCISTA');
  check('PAR-B guarda su impulso', estados.get('PAR-B')?.impulso === 'ALCISTA');

  // Fase 2: llega el doji (una vela cerrada nueva en cada par)
  const paso2A = [...A.historia, ...A.imp, A.doji, A.formandose];
  const paso2B = [...B.historia, ...B.imp, B.doji, B.formandose];
  detectSignal('PAR-A', paso2A);
  detectSignal('PAR-B', paso2B);

  check('PAR-A espera la vela de fuerza', estados.get('PAR-A')?.esperandoFuerza === true);
  check('PAR-B espera la vela de fuerza', estados.get('PAR-B')?.esperandoFuerza === true);

  // Fase 3: vela de fuerza -> señal en los dos
  const paso3A = [...A.historia, ...A.imp, A.doji, A.fuerza, A.formandose];
  const paso3B = [...B.historia, ...B.imp, B.doji, B.fuerza, B.formandose];
  const sA = detectSignal('PAR-A', paso3A);
  const sB = detectSignal('PAR-B', paso3B);

  check('PAR-A da señal CALL', sA?.direction === 'CALL', JSON.stringify(sA));
  check('PAR-B da señal CALL', sB?.direction === 'CALL', JSON.stringify(sB));
  check('el estado de PAR-A se reinicia tras la señal', estados.get('PAR-A')?.impulso === null);
}

console.log('\n== 3. La misma vela no se procesa dos veces ==');
{
  estados.clear();
  const historia = serieTendencial(1.1, 25, 0.0009);
  const imp = impulsoAlcista(historia[historia.length - 1].close);
  const doji = dojiRojo(imp[imp.length - 1].close);
  const fuerza = fuerzaBajista(doji.close, doji.low);
  const formandose = vela(fuerza.close, fuerza.close + 0.0003, fuerza.close - 0.0003, fuerza.close);
  const serie = [...historia, ...imp, doji, fuerza, formandose];

  detectSignal('PAR-C', [...historia, ...imp, formandose]);
  detectSignal('PAR-C', [...historia, ...imp, doji, formandose]);
  const primera = detectSignal('PAR-C', serie);
  const repetida = detectSignal('PAR-C', serie); // mismas velas otra vez

  check('la primera pasada da señal', primera !== null);
  check('repetir la misma vela no vuelve a disparar', repetida === null);
}

console.log('\n== 4. La ultima vela (en formacion) se ignora ==');
{
  estados.clear();
  const historia = serieTendencial(1.1, 25, 0.0009);
  const imp = impulsoAlcista(historia[historia.length - 1].close);
  const formandose = vela(imp[imp.length - 1].close, imp[imp.length - 1].close + 0.001, imp[imp.length - 1].close - 0.001, imp[imp.length - 1].close);
  detectSignal('PAR-D', [...historia, ...imp, formandose]);
  const e = estados.get('PAR-D');
  check('el impulso se calcula solo con velas cerradas', e?.impulso === 'ALCISTA');
  check('se recuerda la ultima vela cerrada', e?.ultimaVelaProcesada === imp[imp.length - 1].time);
}

console.log('\n== 5. Mercado lateral reinicia el patron ==');
{
  estados.clear();
  const plano: Candle[] = [];
  for (let i = 0; i < 30; i++) {
    plano.push(vela(1.1, 1.1001, 1.0999, 1.1));
  }
  const s = detectSignal('PAR-E', plano);
  check('sin direccion (ADX bajo) no hay señal', s === null);
  check('el estado queda limpio', estados.get('PAR-E')?.impulso === null);
}

console.log(`\n${pasadas} pruebas correctas, ${fallos} fallidas\n`);
process.exit(fallos > 0 ? 1 : 0);
