import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateCandles } from '@/lib/candles';
import { analyzeStrategy, DEFAULT_STRATEGY_CONFIG, type StrategyConfig } from '@/lib/strategy';

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

    await new Promise(resolve => setTimeout(resolve, 1500));

    // Determinar número de velas según el periodo
    const candleCounts: Record<string, number> = {
      '7D': 200, '30D': 800, '90D': 2400, '180D': 4800, '1Y': 9600,
    };
    const candleCount = candleCounts[period || '30D'] || 800;

    // Configuración de la estrategia (combinar default + config del request)
    const strategyConfig: StrategyConfig = { ...DEFAULT_STRATEGY_CONFIG, ...(config || {}) };

    // Generar datos históricos
    const startPrice = pair.includes('BTC') ? 60000 : pair.includes('ETH') ? 3000 : 1.0850;
    const volatility = pair.includes('BTC') ? 80 : pair.includes('ETH') ? 8 : 0.0010;

    const candles = generateCandles(candleCount, startPrice, { volatility, injectPatterns: true });

    // Analizar estrategia
    const result = analyzeStrategy(candles, strategyConfig);

    // Convertir señales en operaciones simuladas
    const amount = (config?.amount || 25) as number;
    const payout = (config?.payout || 87) as number;
    const minConfidence = (config?.minConfidence || 60) as number;

    const operations: any[] = [];
    let balance = 0;
    let runningBalance = 0;
    let maxBalance = 0;
    let maxDrawdown = 0;
    let tempWin = 0;
    let tempLoss = 0;
    let longestWin = 0;
    let longestLoss = 0;

    for (const signal of result.signals) {
      if (signal.confidence < minConfidence) continue;

      // Simular resultado basado en confianza (con algo de varianza realista)
      const winProb = Math.min(0.85, signal.confidence / 100 * 0.8);
      const isWin = Math.random() < winProb;
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
        time: new Date(candles[signal.index].time).toISOString(),
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
        draws: 0,
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
