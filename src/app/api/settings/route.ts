import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/settings
export async function GET() {
  try {
    const account = await db.account.findFirst({ include: { settings: true } });
    if (!account?.settings) {
      return NextResponse.json({ success: true, settings: null });
    }
    return NextResponse.json({ success: true, settings: account.settings });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Error' }, { status: 500 });
  }
}

// PUT /api/settings
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const account = await db.account.findFirst({ include: { settings: true } });
    if (!account) return NextResponse.json({ success: false, error: 'Sin cuenta' }, { status: 404 });

    let settings = account.settings;
    if (!settings) {
      settings = await db.settings.create({ data: { accountId: account.id } });
    }

    const updated = await db.settings.update({
      where: { id: settings.id },
      data: {
        initialCapital: body.initialCapital !== undefined ? parseFloat(body.initialCapital) : undefined,
        riskPerOperation: body.riskPerOperation !== undefined ? parseFloat(body.riskPerOperation) : undefined,
        maxDailyLoss: body.maxDailyLoss !== undefined ? parseFloat(body.maxDailyLoss) : undefined,
        maxDailyOperations: body.maxDailyOperations !== undefined ? parseInt(body.maxDailyOperations) : undefined,
        martingaleEnabled: body.martingaleEnabled,
        martingaleFactor: body.martingaleFactor !== undefined ? parseFloat(body.martingaleFactor) : undefined,
        martingaleLevels: body.martingaleLevels !== undefined ? parseInt(body.martingaleLevels) : undefined,
        stopLossEnabled: body.stopLossEnabled,
        stopLossValue: body.stopLossValue !== undefined ? parseFloat(body.stopLossValue) : undefined,
        takeProfitEnabled: body.takeProfitEnabled,
        takeProfitValue: body.takeProfitValue !== undefined ? parseFloat(body.takeProfitValue) : undefined,
        defaultAmount: body.defaultAmount !== undefined ? parseFloat(body.defaultAmount) : undefined,
        defaultExpiry: body.defaultExpiry !== undefined ? parseInt(body.defaultExpiry) : undefined,
        operationType: body.operationType,
        selectedPairs: body.selectedPairs ? JSON.stringify(body.selectedPairs) : undefined,
        telegramEnabled: body.telegramEnabled,
        telegramBotToken: body.telegramBotToken,
        telegramChatId: body.telegramChatId,
        strategyName: body.strategyName,
        strategyConfig: body.strategyConfig ? JSON.stringify(body.strategyConfig) : undefined,
        botActive: body.botActive,
      }
    });

    return NextResponse.json({ success: true, settings: updated });
  } catch (error) {
    console.error('PUT /api/settings error:', error);
    return NextResponse.json({ success: false, error: 'Error al guardar' }, { status: 500 });
  }
}
