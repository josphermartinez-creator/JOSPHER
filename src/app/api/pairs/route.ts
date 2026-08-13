import { NextResponse } from 'next/server';
import { IQ_SERVICE_URL, serviceRequest } from '@/lib/services';

/**
 * Los pares se piden AL BROKER.
 *
 * La lista anterior estaba escrita a mano y 27 de sus 52 pares no existen en
 * IQ Option (AUDUSD-OTC, BTCUSD-OTC, las acciones, `GBJPY` mal escrito...).
 * Al intentar operarlos, la librería lanzaba KeyError y el bot no entraba nunca.
 *
 * Si el broker no está disponible se devuelve una lista mínima ya verificada,
 * marcada como no confirmada para que la interfaz lo pueda avisar.
 */

// Pares verificados contra iqoptionapi/constants.py (todos existen)
const FALLBACK_PAIRS = [
  { id: 'EURUSD-OTC', category: 'FOREX' },
  { id: 'EURGBP-OTC', category: 'FOREX' },
  { id: 'USDCHF-OTC', category: 'FOREX' },
  { id: 'EURJPY-OTC', category: 'FOREX' },
  { id: 'NZDUSD-OTC', category: 'FOREX' },
  { id: 'GBPUSD-OTC', category: 'FOREX' },
  { id: 'GBPJPY-OTC', category: 'FOREX' },
  { id: 'USDJPY-OTC', category: 'FOREX' },
  { id: 'AUDCAD-OTC', category: 'FOREX' },
  { id: 'EURUSD', category: 'FOREX' },
  { id: 'GBPUSD', category: 'FOREX' },
  { id: 'USDJPY', category: 'FOREX' },
  { id: 'AUDUSD', category: 'FOREX' },
  { id: 'USDCAD', category: 'FOREX' },
  { id: 'USDCHF', category: 'FOREX' },
  { id: 'NZDUSD', category: 'FOREX' },
  { id: 'EURJPY', category: 'FOREX' },
  { id: 'EURGBP', category: 'FOREX' },
  { id: 'EURCAD', category: 'FOREX' },
  { id: 'EURAUD', category: 'FOREX' },
  { id: 'EURNZD', category: 'FOREX' },
  { id: 'GBPJPY', category: 'FOREX' },
  { id: 'GBPCAD', category: 'FOREX' },
  { id: 'GBPAUD', category: 'FOREX' },
  { id: 'AUDJPY', category: 'FOREX' },
  { id: 'AUDCAD', category: 'FOREX' },
  { id: 'CADCHF', category: 'FOREX' },
  { id: 'XAUUSD', category: 'COMMODITY' },
  { id: 'XAGUSD', category: 'COMMODITY' },
  { id: 'BTCUSD', category: 'CRYPTO' },
  { id: 'ETHUSD', category: 'CRYPTO' },
  { id: 'LTCUSD', category: 'CRYPTO' },
  { id: 'XRPUSD', category: 'CRYPTO' },
];

function categoryOf(id: string): string {
  if (/^(BTC|ETH|LTC|XRP|BNB|ADA)/.test(id)) return 'CRYPTO';
  if (/^(XAU|XAG|USOIL|UKBRENT)/.test(id)) return 'COMMODITY';
  if (/^[A-Z]{6}(-OTC)?$/.test(id)) return 'FOREX';
  return 'OTHER';
}

function displayName(id: string): string {
  const base = id.replace('-OTC', '');
  const suffix = id.endsWith('-OTC') ? ' OTC' : '';
  if (/^[A-Z]{6}$/.test(base)) {
    return `${base.slice(0, 3)}/${base.slice(3)}${suffix}`;
  }
  return `${base}${suffix}`;
}

export async function GET() {
  // 1) Lista real del broker (incluye si está abierto ahora y el payout real)
  const res = await serviceRequest<any>(IQ_SERVICE_URL, 'get-assets', undefined, 25000);

  if (res?.success && Array.isArray(res.assets) && res.assets.length > 0) {
    const pairs = res.assets.map((a: any) => ({
      id: a.id,
      name: displayName(a.id),
      type: a.isOTC ? 'OTC' : 'NORMAL',
      category: categoryOf(a.id),
      payout: Math.round(Number(a.payout) || 0),
      available: !!a.open,
    }));

    return NextResponse.json({
      success: true,
      pairs,
      source: 'broker',
      openCount: pairs.filter((p: any) => p.available).length,
    });
  }

  // 2) Sin broker: lista verificada, pero sin saber si están abiertos ni el payout
  const pairs = FALLBACK_PAIRS.map(p => ({
    id: p.id,
    name: displayName(p.id),
    type: p.id.endsWith('-OTC') ? 'OTC' : 'NORMAL',
    category: p.category,
    payout: 0,
    available: false,
  }));

  return NextResponse.json({
    success: true,
    pairs,
    source: 'fallback',
    warning: res?.error || 'Sin conexión con el broker: no se puede saber qué pares están abiertos ni su payout real.',
  });
}
