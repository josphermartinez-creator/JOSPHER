import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * El saldo de la cuenta NO se toca aqui.
 * La verdad del saldo la tiene el broker: el auto-trader lo sincroniza con
 * PUT /api/account despues de cada cierre. Antes esta ruta sumaba y restaba
 * por su cuenta y la cuenta se separaba de la real con cada operacion.
 */

// GET /api/operations?limit=50&result=WIN&pair=EURUSD-OTC&scope=real
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 1000);
    const result = searchParams.get('result') || undefined;
    const pair = searchParams.get('pair') || undefined;
    const scope = searchParams.get('scope') || 'all'; // all | real | simulation

    const account = await db.account.findFirst();
    if (!account) {
      return NextResponse.json({ success: true, operations: [] });
    }

    const where: any = { accountId: account.id };
    if (result && result !== 'ALL') where.result = result;
    if (pair && pair !== 'ALL') where.pair = pair;
    if (scope === 'real') where.source = { not: 'SIMULATION' };
    if (scope === 'simulation') where.source = 'SIMULATION';

    const operations = await db.operation.findMany({
      where,
      orderBy: { openedAt: 'desc' },
      take: limit,
    });

    return NextResponse.json({ success: true, operations });
  } catch (error) {
    console.error('GET /api/operations error:', error);
    return NextResponse.json(
      { success: false, error: 'Error al obtener operaciones' },
      { status: 500 }
    );
  }
}

// POST /api/operations - registrar una operación (normalmente PENDING)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      pair, direction, amount, expiry, entryPrice, exitPrice,
      payout, martingaleLevel, reason, confidence, strategy, result,
      brokerOrderId, source, profit,
    } = body;

    if (!pair || !direction || !amount) {
      return NextResponse.json(
        { success: false, error: 'Faltan datos de la operación (pair, direction, amount)' },
        { status: 400 }
      );
    }

    const account = await db.account.findFirst();
    if (!account) {
      return NextResponse.json(
        { success: false, error: 'No hay cuenta activa' },
        { status: 404 }
      );
    }

    const finalResult = result || 'PENDING';

    const op = await db.operation.create({
      data: {
        accountId: account.id,
        pair,
        direction,
        amount: parseFloat(amount),
        expiry: parseInt(expiry || 1),
        entryPrice: entryPrice != null ? parseFloat(entryPrice) : null,
        exitPrice: exitPrice != null ? parseFloat(exitPrice) : null,
        result: finalResult,
        payout: parseFloat(payout || 0),
        profit: profit != null ? parseFloat(profit) : 0,
        martingaleLevel: parseInt(martingaleLevel || 0),
        reason: reason || 'Manual',
        confidence: parseFloat(confidence || 0),
        strategy: strategy || 'MANUAL',
        brokerOrderId: brokerOrderId || null,
        source: source || 'AUTO',
        closedAt: finalResult !== 'PENDING' ? new Date() : null,
      }
    });

    return NextResponse.json({ success: true, operation: op });
  } catch (error) {
    console.error('POST /api/operations error:', error);
    return NextResponse.json(
      { success: false, error: 'Error al crear operación' },
      { status: 500 }
    );
  }
}

// DELETE /api/operations - limpiar historial
export async function DELETE() {
  try {
    const account = await db.account.findFirst();
    if (!account) return NextResponse.json({ success: true });

    await db.operation.deleteMany({ where: { accountId: account.id } });
    return NextResponse.json({ success: true, message: 'Historial limpiado' });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Error al limpiar historial' },
      { status: 500 }
    );
  }
}
