import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * PATCH /api/operations/[id]
 * Cierra (o corrige) una operación existente.
 *
 * Antes esto no existía: el auto-trader hacía un segundo POST al cerrar y
 * acababa con DOS filas por operación (una PENDING abierta para siempre y otra
 * con el resultado), lo que duplicaba el historial, las estadísticas y el
 * contador del límite diario.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { result, profit, exitPrice, entryPrice, payout } = body;

    const existing = await db.operation.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Operación no encontrada' },
        { status: 404 }
      );
    }

    const data: any = {};

    if (result !== undefined) {
      if (!['WIN', 'LOSS', 'DRAW', 'PENDING'].includes(result)) {
        return NextResponse.json(
          { success: false, error: `Resultado no válido: ${result}` },
          { status: 400 }
        );
      }
      data.result = result;
      data.closedAt = result === 'PENDING' ? null : new Date();
    }

    // El profit lo manda el broker; no se calcula aquí con un payout inventado.
    if (profit !== undefined && profit !== null) data.profit = parseFloat(profit);
    if (exitPrice !== undefined && exitPrice !== null) data.exitPrice = parseFloat(exitPrice);
    if (entryPrice !== undefined && entryPrice !== null) data.entryPrice = parseFloat(entryPrice);
    if (payout !== undefined && payout !== null) data.payout = parseFloat(payout);

    const operation = await db.operation.update({ where: { id }, data });

    return NextResponse.json({ success: true, operation });
  } catch (error) {
    console.error('PATCH /api/operations/[id] error:', error);
    return NextResponse.json(
      { success: false, error: 'Error al actualizar la operación' },
      { status: 500 }
    );
  }
}

// GET /api/operations/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const operation = await db.operation.findUnique({ where: { id } });
    if (!operation) {
      return NextResponse.json(
        { success: false, error: 'Operación no encontrada' },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, operation });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Error al obtener la operación' },
      { status: 500 }
    );
  }
}
