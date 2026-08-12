import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateCandles } from '@/lib/candles';
import { analyzeStrategy, DEFAULT_STRATEGY_CONFIG, type StrategyConfig } from '@/lib/strategy';
import { AUTOTRADER_URL, serviceEmit, autotraderHealth, iqServiceHealth } from '@/lib/services';

// GET /api/bot - estado del bot
export async function GET() {
  try {
    const account = await db.account.findFirst({ include: { settings: true } });
    const autoTrader = await autotraderHealth();

    return NextResponse.json({
      success: true,
      botActive: account?.settings?.botActive || false,
      autoTrader: {
        running: autoTrader.up,
        active: autoTrader.botActive,
        monitoring: autoTrader.monitoring,
      },
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Error' }, { status: 500 });
  }
}

// POST /api/bot - start | stop | simulate
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, silent } = body;

    const account = await db.account.findFirst({ include: { settings: true } });
    if (!account || !account.settings) {
      return NextResponse.json({ success: false, error: 'Sin cuenta configurada' }, { status: 404 });
    }

    // ====== START ======
    if (action === 'start') {
      // No se arranca el bot a ciegas: sin broker no hay nada que hacer.
      if (!account.isConnected) {
        return NextResponse.json(
          { success: false, error: 'Conéctate a IQ Options antes de iniciar el bot' },
          { status: 400 }
        );
      }

      const health = await iqServiceHealth();
      if (!health.up) {
        return NextResponse.json(
          { success: false, error: 'El servicio IQ Option (puerto 3003) no está corriendo' },
          { status: 503 }
        );
      }
      if (!health.bridgeConnected) {
        return NextResponse.json(
          { success: false, error: 'No hay sesión abierta en IQ Option. Vuelve a iniciar sesión.' },
          { status: 503 }
        );
      }

      const autoTrader = await autotraderHealth();
      if (!autoTrader.up) {
        return NextResponse.json(
          { success: false, error: 'El auto-trader (puerto 3004) no está corriendo. Ejecuta arrancar.bat.' },
          { status: 503 }
        );
      }

      let selectedPairs: string[] = [];
      try {
        const parsed = JSON.parse(account.settings.selectedPairs || '[]');
        if (Array.isArray(parsed)) selectedPairs = parsed.filter(Boolean);
      } catch {}

      if (selectedPairs.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Selecciona al menos un par en la pestaña Pares' },
          { status: 400 }
        );
      }

      await db.settings.update({
        where: { id: account.settings.id },
        data: { botActive: true, strategyName: 'INDECISION_FUERZA_CONTINUIDAD' },
      });

      const started = await serviceEmit(AUTOTRADER_URL, 'start');
      if (!started) {
        await db.settings.update({
          where: { id: account.settings.id },
          data: { botActive: false },
        });
        return NextResponse.json(
          { success: false, error: 'No se pudo comunicar con el auto-trader' },
          { status: 503 }
        );
      }

      return NextResponse.json({
        success: true,
        message: `Bot iniciado · ${selectedPairs.length} par(es) · operaciones REALES`,
        autoTraderActive: true,
      });
    }

    // ====== STOP ======
    if (action === 'stop') {
      await db.settings.update({
        where: { id: account.settings.id },
        data: { botActive: false },
      });
      // `silent` lo usa el propio auto-trader cuando se detiene solo
      if (!silent) await serviceEmit(AUTOTRADER_URL, 'stop');
      return NextResponse.json({ success: true, message: 'Bot detenido' });
    }

    // ====== SIMULATE ======
    // Operación de PRUEBA sobre velas generadas. No toca el broker ni el saldo,
    // y queda marcada como SIMULATION para no contaminar las estadísticas.
    if (action === 'simulate') {
      let selectedPairs: string[] = ['EURUSD-OTC'];
      try {
        const parsed = JSON.parse(account.settings.selectedPairs || '[]');
        if (Array.isArray(parsed) && parsed.length > 0) selectedPairs = parsed;
      } catch {}

      const pair = selectedPairs[Math.floor(Math.random() * selectedPairs.length)];
      const startPrice = pair.includes('BTC') ? 67432 : pair.includes('ETH') ? 3521 : 1.0850;
      const volatility = pair.includes('BTC') ? 50 : pair.includes('ETH') ? 5 : 0.0009;

      let strategyConfig: StrategyConfig = DEFAULT_STRATEGY_CONFIG;
      try {
        strategyConfig = { ...DEFAULT_STRATEGY_CONFIG, ...JSON.parse(account.settings.strategyConfig || '{}') };
      } catch {}

      let analysis: ReturnType<typeof analyzeStrategy> | null = null;
      for (let i = 0; i < 5 && !analysis?.lastSignal; i++) {
        const candles = generateCandles(80, startPrice, { volatility, injectPatterns: true });
        analysis = analyzeStrategy(candles, strategyConfig);
      }

      const signal = analysis?.lastSignal;
      if (!signal) {
        return NextResponse.json({
          success: false,
          error: 'La estrategia no encontró ninguna señal en las velas de prueba',
        }, { status: 422 });
      }

      const amount = account.settings.defaultAmount || 25;
      const expiry = account.settings.defaultExpiry || 1;
      const payout = 87; // valor de referencia: en simulación no hay payout real
      const isWin = Math.random() < Math.min(0.85, signal.confidence / 100 * 0.85);
      const profit = isWin ? amount * payout / 100 : -amount;

      const op = await db.operation.create({
        data: {
          accountId: account.id,
          pair,
          direction: signal.direction,
          amount,
          expiry,
          entryPrice: signal.entryPrice,
          exitPrice: signal.entryPrice + (isWin ? 0.0005 : -0.0005) * (signal.direction === 'CALL' ? 1 : -1),
          result: isWin ? 'WIN' : 'LOSS',
          payout,
          profit,
          martingaleLevel: 0,
          reason: `[SIMULACIÓN] ${signal.reason}`,
          confidence: signal.confidence,
          strategy: 'INDECISION_FUERZA_CONTINUIDAD',
          source: 'SIMULATION',
          brokerOrderId: null,
          closedAt: new Date(),
        }
      });

      // Nota: el saldo NO se toca. Es una prueba, no una operación.
      return NextResponse.json({
        success: true,
        simulated: true,
        operation: op,
        signal,
        message: 'Operación de PRUEBA (no se envió al broker ni afecta al saldo)',
        notification: {
          title: isWin ? 'SIMULACIÓN GANADA' : 'SIMULACIÓN PERDIDA',
          pair,
          direction: signal.direction,
          amount,
          payout,
          profit,
          confidence: signal.confidence,
          expiry,
          reason: signal.reason,
          time: new Date().toLocaleTimeString('es-ES'),
        }
      });
    }

    return NextResponse.json({ success: false, error: 'Acción no válida' }, { status: 400 });
  } catch (error) {
    console.error('POST /api/bot error:', error);
    return NextResponse.json({ success: false, error: 'Error bot' }, { status: 500 });
  }
}
