import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { analyzeStrategy, DEFAULT_STRATEGY_CONFIG, type StrategyConfig } from '@/lib/strategy';
import { IQ_SERVICE_URL, serviceRequest } from '@/lib/services';

// GET /api/backtest - list backtests
export async function GET() {
  try {
    const account = await db.account.findFirst();
    if (!account) return NextResponse.json({ success: true, backtests: [] });

    const backtests = await db.backtest.findMany({
      where: { accountId: account.id },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ success: true, backtests });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Error' }, { status: 500 });
  }
}

// POST /api/backtest - run new backtest using the real strategy
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, pair, strategy, config, period } = body;

    const account = await db.account.findFirst();
    if (!account) return NextResponse.json({ success: false, error: 'Sin cuenta' }, { status: 404 });

    // Velas REALES del broker. Antes se generaban con generateCandles(): el
    // backtest medía la estrategia contra ruido aleatorio, no contra el mercado.
    const candleCounts: Record<string, number> = {
      '7D': 300, '30D': 600, '90D': 1000, '180D': 1000, '1Y': 1000,
    };
    const candleCount = candleCounts[period || '30D'] || 600;

    const velasRes = await serviceRequest<any>(
      IQ_SERVICE_URL,
      'get-candles',
      { pair, count: candleCount, timeframe: 60 },
      40000,
    );

    if (!velasRes?.success || velasRes.source !== 'real' || !velasRes.candles?.length) {
      return NextResponse.json({
        success: false,
        error: `No hay velas reales de ${pair} para el backtest: ${velasRes?.error || 'sin datos'}`,
      }, { status: 503 });
    }

    const candles = velasRes.candles as any[];

    // Configuración de la estrategia (combinar default + config del request)
    const strategyConfig: StrategyConfig = { ...DEFAULT_STRATEGY_CONFIG, ...(config || {}) };

    // Analizar estrategia (mismo motor que usa el bot en vivo)
    const result = analyzeStrategy(candles, strategyConfig);

    const amount = (config?.amount || 25) as number;
    const payout = (config?.payout || 87) as number;
    const minConfidence = (config?.minConfidence ?? strategyConfig.minConfidence) as number;

    const operations: any[] = [];
    let balance = 0;
    let runningBalance = 0;
    let maxBalance = 0;
    let maxDrawdown = 0;
    let tempWin = 0;
    let tempLoss = 0;
    let longestWin = 0;
    let longestLoss = 0;

    let draws = 0;

    for (const signal of result.signals) {
      if (signal.confidence < minConfidence) continue;

      // Resultado REAL de una binaria de 1 minuto: se entra al abrir la vela de
      // continuidad y se cierra al cerrarla. Antes esto era Math.random() con
      // una probabilidad inventada a partir de la confianza, así que el
      // backtest no medía nada.
      const vela = candles[signal.index];
      if (!vela) continue;

      const subio = vela.close > vela.open;
      const bajo = vela.close < vela.open;

      if (!subio && !bajo) { draws++; continue; } // empate: el broker devuelve la apuesta

      const isWin = signal.direction === 'CALL' ? subio : bajo;
      const profit = isWin ? amount * payout / 100 : -amount;
      runningBalance += profit;

      if (isWin) {
        tempWin++;
        tempLoss = 0;
        longestWin = Math.max(longestWin, tempWin);
      } else {
        tempLoss++;
        tempWin = 0;
        longestLoss = Math.max(longestLoss, tempLoss);
      }

      maxBalance = Math.max(maxBalance, runningBalance);
      maxDrawdown = Math.min(maxDrawdown, runningBalance - maxBalance);

      operations.push({
        index: signal.index,
        result: isWin ? 'WIN' : 'LOSS',
        profit,
        balance: runningBalance,
        direction: signal.direction,
        confidence: signal.confidence,
        time: new Date(Number(candles[signal.index].time) * 1000).toISOString(),
        entryPrice: candles[signal.index].open,
        exitPrice: candles[signal.index].close,
        reason: signal.reason,
      });
    }

    const wins = operations.filter(o => o.result === 'WIN').length;
    const losses = operations.filter(o => o.result === 'LOSS').length;
    const total = wins + losses;
    const profit = runningBalance;
    const winRate = total > 0 ? (wins / total) * 100 : 0;
    const grossProfit = operations.filter(o => o.profit > 0).reduce((s, o) => s + o.profit, 0);
    const grossLoss = Math.abs(operations.filter(o => o.profit < 0).reduce((s, o) => s + o.profit, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 99 : 0);

    const backtest = await db.backtest.create({
      data: {
        accountId: account.id,
        name: name || `Backtest ${pair}`,
        pair,
        strategy: strategy || 'INDECISION_FUERZA_CONTINUIDAD',
        config: JSON.stringify(config || {}),
        period: period || '30D',
        totalOperations: total,
        wins,
        losses,
        draws,
        winRate,
        profit,
        maxDrawdown,
        longestWinStreak: longestWin,
        longestLossStreak: longestLoss,
        profitFactor,
        details: JSON.stringify(operations.slice(0, 500)), // limit for storage
      }
    });

    return NextResponse.json({
      success: true,
      backtest,
      summary: {
        totalSignals: result.signals.length,
        filteredSignals: total,
        draws,
        candlesAnalyzed: candles.length,
        dataSource: 'broker',
        adx: Math.round(result.adx),
        lateralDetected: result.isLateral,
        lateralScore: result.lateralScore,
      }
    });
  } catch (error) {
    console.error('POST /api/backtest error:', error);
    return NextResponse.json({ success: false, error: 'Error backtest' }, { status: 500 });
  }
}

// DELETE /api/backtest - delete backtest
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: 'ID requerido' }, { status: 400 });

    await db.backtest.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Error' }, { status: 500 });
  }
}
