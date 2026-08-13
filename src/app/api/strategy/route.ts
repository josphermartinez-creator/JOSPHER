import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { analyzeStrategy, DEFAULT_STRATEGY_CONFIG, type StrategyConfig } from '@/lib/strategy';
import { IQ_SERVICE_URL, AUTOTRADER_URL, serviceRequest } from '@/lib/services';

/**
 * Análisis en vivo de la estrategia.
 *
 * Antes, cuando el broker no daba velas, esta ruta las generaba con
 * `generateCandles()` y las pintaba como si fueran del mercado. El gráfico y
 * las señales eran ruido aleatorio. Ahora: o son velas reales, o se avisa.
 */

async function getRealCandles(pair: string, count: number) {
  const res = await serviceRequest<any>(IQ_SERVICE_URL, 'get-candles', { pair, count, timeframe: 60 }, 15000);
  if (!res?.success || res.source !== 'real' || !res.candles?.length) {
    return { candles: null as any[] | null, error: res?.error || 'El broker no devolvió velas' };
  }
  return { candles: res.candles as any[], error: null };
}

async function getStrategyConfig(): Promise<StrategyConfig> {
  const account = await db.account.findFirst({ include: { settings: true } });
  if (!account?.settings?.strategyConfig) return DEFAULT_STRATEGY_CONFIG;
  try {
    return { ...DEFAULT_STRATEGY_CONFIG, ...JSON.parse(account.settings.strategyConfig) };
  } catch {
    return DEFAULT_STRATEGY_CONFIG;
  }
}

// GET /api/strategy?pair=EURUSD-OTC&candles=80
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const pair = searchParams.get('pair') || 'EURUSD-OTC';
    const candleCount = parseInt(searchParams.get('candles') || '80');

    const { candles, error } = await getRealCandles(pair, candleCount);

    if (!candles) {
      return NextResponse.json({
        success: false,
        realData: false,
        pair,
        error: `Sin velas reales de ${pair}: ${error}`,
      }, { status: 503 });
    }

    const config = await getStrategyConfig();
    const result = analyzeStrategy(candles, config);

    return NextResponse.json({
      success: true,
      realData: true,
      pair,
      candles: result.candles,
      patterns: result.patterns,
      signals: result.signals,
      isLateral: result.isLateral,
      lateralScore: result.lateralScore,
      adx: result.adx,
      atr: result.atr,
      lastSignal: result.lastSignal,
      // Motivo exacto por el que no hay entrada, para poder ajustar el
      // parámetro correcto en vez de ir a ciegas.
      lastRejection: result.lastRejection,
      description: result.description,
      config,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('GET /api/strategy error:', error);
    return NextResponse.json(
      { success: false, error: 'Error al analizar la estrategia' },
      { status: 500 }
    );
  }
}

// POST /api/strategy - ejecutar señal manualmente
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;
    const pair = body.pair || 'EURUSD-OTC';

    if (action === 'analyze') {
      // Ya no hay caché de velas simuladas que limpiar: siempre se piden al broker.
      return NextResponse.json({ success: true, message: 'Se recargarán las velas del broker' });
    }

    if (action === 'execute_signal') {
      const account = await db.account.findFirst({ include: { settings: true } });
      if (!account?.settings) {
        return NextResponse.json({ success: false, error: 'Sin cuenta configurada' }, { status: 404 });
      }
      if (!account.isConnected) {
        return NextResponse.json(
          { success: false, error: 'Conéctate a IQ Options antes de operar' },
          { status: 400 }
        );
      }

      const { candles, error } = await getRealCandles(pair, 80);
      if (!candles) {
        return NextResponse.json(
          { success: false, error: `No se puede operar sin velas reales: ${error}` },
          { status: 503 }
        );
      }

      const config = await getStrategyConfig();
      const signal = analyzeStrategy(candles, config).lastSignal;
      if (!signal) {
        return NextResponse.json(
          { success: false, error: 'No hay señal válida para ejecutar ahora mismo' },
          { status: 422 }
        );
      }

      // La orden la coloca el auto-trader: es quien lleva el registro de
      // operaciones pendientes y quien consulta el resultado real al broker.
      const res = await serviceRequest<any>(AUTOTRADER_URL, 'manual-order', {
        pair,
        direction: signal.direction,
        confidence: signal.confidence,
        reason: `[MANUAL] ${signal.reason}`,
        entryPrice: signal.entryPrice,
      }, 30000);

      if (!res?.success) {
        return NextResponse.json(
          { success: false, error: res?.error || 'No se pudo colocar la orden' },
          { status: 502 }
        );
      }

      // El resultado NO se sabe todavía: lo dirá el broker al expirar.
      return NextResponse.json({
        success: true,
        pending: true,
        operationId: res.operationId,
        signal,
        message: `Orden ${signal.direction} enviada a ${pair}. El resultado llegará al expirar.`,
      });
    }

    return NextResponse.json({ success: false, error: 'Acción no válida' }, { status: 400 });
  } catch (error) {
    console.error('POST /api/strategy error:', error);
    return NextResponse.json({ success: false, error: 'Error' }, { status: 500 });
  }
}
