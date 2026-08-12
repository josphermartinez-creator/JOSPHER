import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/statistics - get full statistics
export async function GET() {
  try {
    const account = await db.account.findFirst();
    if (!account) {
      return NextResponse.json({ success: true, stats: emptyStats() });
    }

    // Solo operaciones REALES y ya cerradas.
    // Las de simulación (botón "Simular") se excluyen: antes se mezclaban con
    // las reales y falseaban el win rate, el profit factor y la curva de saldo.
    const operations = await db.operation.findMany({
      where: {
        accountId: account.id,
        result: { in: ['WIN', 'LOSS', 'DRAW'] },
        source: { not: 'SIMULATION' },
      },
      orderBy: { openedAt: 'asc' },
    });

    const pendingCount = await db.operation.count({
      where: { accountId: account.id, result: 'PENDING', source: { not: 'SIMULATION' } },
    });

    const wins = operations.filter(o => o.result === 'WIN');
    const losses = operations.filter(o => o.result === 'LOSS');
    const draws = operations.filter(o => o.result === 'DRAW');

    const totalProfit = operations.reduce((s, o) => s + o.profit, 0);
    const grossProfit = wins.reduce((s, o) => s + o.profit, 0);
    const grossLoss = Math.abs(losses.reduce((s, o) => s + o.profit, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;

    // Win/loss streaks
    let currentStreak = 0;
    let currentType = '';
    let longestWin = 0;
    let longestLoss = 0;
    let tempWin = 0;
    let tempLoss = 0;

    for (const op of operations) {
      if (op.result === 'WIN') {
        tempWin++;
        tempLoss = 0;
        longestWin = Math.max(longestWin, tempWin);
      } else if (op.result === 'LOSS') {
        tempLoss++;
        tempWin = 0;
        longestLoss = Math.max(longestLoss, tempLoss);
      }
    }

    // Current streak
    if (operations.length > 0) {
      const lastResult = operations[operations.length - 1].result;
      currentType = lastResult;
      for (let i = operations.length - 1; i >= 0; i--) {
        if (operations[i].result === lastResult) currentStreak++;
        else break;
      }
    }

    // By pair
    const pairMap: Record<string, { total: number; wins: number; losses: number; profit: number }> = {};
    for (const op of operations) {
      if (!pairMap[op.pair]) pairMap[op.pair] = { total: 0, wins: 0, losses: 0, profit: 0 };
      pairMap[op.pair].total++;
      if (op.result === 'WIN') pairMap[op.pair].wins++;
      if (op.result === 'LOSS') pairMap[op.pair].losses++;
      pairMap[op.pair].profit += op.profit;
    }
    const byPair = Object.entries(pairMap).map(([pair, d]) => ({
      pair, ...d, winRate: d.total > 0 ? (d.wins / d.total) * 100 : 0
    })).sort((a, b) => b.total - a.total);

    // By direction
    const calls = operations.filter(o => o.direction === 'CALL');
    const puts = operations.filter(o => o.direction === 'PUT');
    const callWins = calls.filter(o => o.result === 'WIN').length;
    const putWins = puts.filter(o => o.result === 'WIN').length;

    // Equity curve
    let runningBalance = account.balance - totalProfit;
    const equityCurve = operations.map((op, i) => {
      runningBalance += op.profit;
      return {
        index: i + 1,
        balance: runningBalance,
        time: op.openedAt.toISOString(),
        profit: op.profit
      };
    });

    // Last 30 days summary
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const recentOps = operations.filter(o => o.openedAt >= thirtyDaysAgo);

    const stats = {
      pending: pendingCount,
      total: operations.length,
      wins: wins.length,
      losses: losses.length,
      draws: draws.length,
      winRate: operations.length > 0 ? (wins.length / operations.length) * 100 : 0,
      totalProfit,
      grossProfit,
      grossLoss,
      profitFactor,
      avgProfit: operations.length > 0 ? totalProfit / operations.length : 0,
      currentBalance: account.balance,
      longestWinStreak: longestWin,
      longestLossStreak: longestLoss,
      currentStreak,
      currentStreakType: currentType,
      byPair,
      byDirection: {
        CALL: { total: calls.length, wins: callWins, winRate: calls.length > 0 ? (callWins / calls.length) * 100 : 0 },
        PUT: { total: puts.length, wins: putWins, winRate: puts.length > 0 ? (putWins / puts.length) * 100 : 0 },
      },
      equityCurve,
      last30Days: {
        total: recentOps.length,
        wins: recentOps.filter(o => o.result === 'WIN').length,
        profit: recentOps.reduce((s, o) => s + o.profit, 0),
      }
    };

    return NextResponse.json({ success: true, stats });
  } catch (error) {
    console.error('GET /api/statistics error:', error);
    return NextResponse.json(
      { success: false, error: 'Error al obtener estadísticas' },
      { status: 500 }
    );
  }
}

function emptyStats() {
  return {
    pending: 0,
    total: 0, wins: 0, losses: 0, draws: 0,
    winRate: 0, totalProfit: 0, grossProfit: 0, grossLoss: 0,
    profitFactor: 0, avgProfit: 0, currentBalance: 0,
    longestWinStreak: 0, longestLossStreak: 0,
    currentStreak: 0, currentStreakType: '',
    byPair: [], byDirection: { CALL: { total: 0, wins: 0, winRate: 0 }, PUT: { total: 0, wins: 0, winRate: 0 } },
    equityCurve: [], last30Days: { total: 0, wins: 0, profit: 0 }
  };
}
