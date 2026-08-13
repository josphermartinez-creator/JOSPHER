'use client';

import { useMemo } from 'react';
import type { Candle } from '@/lib/candles';
import type { PatternAnalysis, Signal } from '@/lib/strategy';
import { cn } from '@/lib/utils';

interface CandleChartProps {
  candles: Candle[];
  patterns?: PatternAnalysis[];
  signals?: Signal[];
  height?: number;
  showVolume?: boolean;
  highlightLast?: boolean;
}

export function CandleChart({
  candles,
  patterns = [],
  signals = [],
  height = 380,
  showVolume = true,
  highlightLast = true,
}: CandleChartProps) {
  // IQ Option NO manda volumen en sus velas: el puente rellena volume:0 en
  // todas. Antes se dividia entre el maximo (0/0 = NaN) y ese NaN acababa en
  // los atributos y/height del SVG -> la consola se llenaba de
  // "Received NaN for the `y` attribute" y las barras no se veian igual.
  // Ahora: si no hay volumen de verdad, no se dibuja la franja y el grafico
  // de precios aprovecha todo el alto.
  const maxVolume = useMemo(() => {
    let max = 0;
    for (const c of candles) {
      const v = Number(c.volume);
      if (Number.isFinite(v) && v > max) max = v;
    }
    return max;
  }, [candles]);

  const hayVolumen = maxVolume > 0;
  const mostrarVolumen = showVolume && hayVolumen;

  const chartHeight = mostrarVolumen ? height - 60 : height;
  const volumeHeight = mostrarVolumen ? 50 : 0;

  const { scaleY, scalePrice, minPrice, maxPrice, padding, chartWidth, candleWidth, candleSpacing } = useMemo(() => {
    if (candles.length === 0) {
      return {
        scaleY: (y: number) => 0,
        scalePrice: (p: number) => 0,
        minPrice: 0,
        maxPrice: 1,
        padding: { top: 20, right: 60, bottom: 20, left: 10 },
        chartWidth: 0,
        candleWidth: 0,
        candleSpacing: 0,
      };
    }
    // Solo precios validos: una vela corrupta con NaN contagiaba el minimo y
    // el maximo, y a partir de ahi TODO el grafico salia NaN.
    const highs = candles.map(c => Number(c.high)).filter(Number.isFinite);
    const lows = candles.map(c => Number(c.low)).filter(Number.isFinite);
    const minPrice = lows.length ? Math.min(...lows) : 0;
    const maxPrice = highs.length ? Math.max(...highs) : 1;
    const range = maxPrice - minPrice || 0.001;
    const padding = { top: 20, right: 70, bottom: 20, left: 10 };

    const containerWidth = 1000; // viewBox width
    const chartWidth = containerWidth - padding.left - padding.right;
    const candleSpacing = chartWidth / candles.length;
    const candleWidth = Math.max(2, candleSpacing * 0.65);

    // Nunca devuelve NaN: el SVG lo rechaza y React lo reporta como error.
    const scaleY = (price: number) => {
      const p = Number(price);
      if (!Number.isFinite(p)) return padding.top;
      const t = (p - minPrice) / range;
      return padding.top + (1 - t) * (chartHeight - padding.top - padding.bottom);
    };

    const scalePrice = (index: number) => {
      return padding.left + index * candleSpacing + candleSpacing / 2;
    };

    return { scaleY, scalePrice, minPrice, maxPrice, padding, chartWidth, candleWidth, candleSpacing };
  }, [candles, chartHeight]);

  // Price levels for gridlines
  const priceLevels = useMemo(() => {
    const levels: number[] = [];
    const steps = 5;
    const range = maxPrice - minPrice;
    for (let i = 0; i <= steps; i++) {
      levels.push(minPrice + (range * i) / steps);
    }
    return levels;
  }, [minPrice, maxPrice]);

  if (candles.length === 0) {
    return (
      <div className="flex items-center justify-center text-muted-foreground text-sm" style={{ height }}>
        Sin datos de velas
      </div>
    );
  }

  const formatPrice = (p: number) => {
    if (p > 1000) return p.toFixed(0);
    if (p > 10) return p.toFixed(2);
    return p.toFixed(5);
  };

  // Map signal indices for marking
  const signalMap = new Map<number, Signal>();
  signals.forEach(s => signalMap.set(s.pattern.continuityIndex, s));

  // Map pattern indices
  const patternMap = new Map<number, PatternAnalysis>();
  patterns.forEach(p => patternMap.set(p.index, p));

  return (
    <div className="w-full" style={{ height }}>
      <svg
        viewBox={`0 0 1000 ${height}`}
        className="w-full h-full"
        preserveAspectRatio="none"
      >
        {/* Background grid */}
        {priceLevels.map((price, i) => (
          <g key={`grid-${i}`}>
            <line
              x1={padding.left}
              y1={scaleY(price)}
              x2={1000 - padding.right}
              y2={scaleY(price)}
              stroke="oklch(1 0 0 / 0.05)"
              strokeWidth={1}
              strokeDasharray="2 4"
            />
            <text
              x={1000 - padding.right + 6}
              y={scaleY(price) + 3}
              fill="oklch(0.65 0.03 250)"
              fontSize={9}
              fontFamily="monospace"
            >
              {formatPrice(price)}
            </text>
          </g>
        ))}

        {/* Candles */}
        {candles.map((c, i) => {
          const x = scalePrice(i);
          const isBull = c.close >= c.open;
          const color = isBull ? 'oklch(0.72 0.19 155)' : 'oklch(0.65 0.22 25)';
          const bodyTop = scaleY(Math.max(c.open, c.close));
          const bodyBottom = scaleY(Math.min(c.open, c.close));
          const bodyH = Math.max(1, bodyBottom - bodyTop);
          const wickTop = scaleY(c.high);
          const wickBottom = scaleY(c.low);

          const pattern = patternMap.get(i);
          const signal = signalMap.get(i);
          const isDoji = pattern?.type === 'DOJI';
          const isForce = pattern?.type === 'FORCE_BULL' || pattern?.type === 'FORCE_BEAR';
          const isImpulse = pattern?.type === 'IMPULSE_BULL' || pattern?.type === 'IMPULSE_BEAR';
          const isLast = highlightLast && i === candles.length - 1;

          // maxVolume > 0 garantizado por mostrarVolumen, asi que aqui no hay
          // division entre cero posible.
          const vol = Number(c.volume);
          const volumenAlto = mostrarVolumen && Number.isFinite(vol) && vol > 0
            ? (vol / maxVolume) * volumeHeight
            : 0;

          return (
            <g key={`candle-${i}`}>
              {/* Highlight backgrounds for patterns */}
              {isImpulse && (
                <rect
                  x={x - candleSpacing / 2}
                  y={padding.top}
                  width={candleSpacing}
                  height={chartHeight - padding.top - padding.bottom}
                  fill={isBull ? 'oklch(0.72 0.19 155 / 0.05)' : 'oklch(0.65 0.22 25 / 0.05)'}
                />
              )}
              {isDoji && (
                <rect
                  x={x - candleSpacing / 2}
                  y={padding.top}
                  width={candleSpacing}
                  height={chartHeight - padding.top - padding.bottom}
                  fill="oklch(0.82 0.18 80 / 0.12)"
                />
              )}
              {isForce && (
                <rect
                  x={x - candleSpacing / 2}
                  y={padding.top}
                  width={candleSpacing}
                  height={chartHeight - padding.top - padding.bottom}
                  fill={isBull ? 'oklch(0.72 0.19 155 / 0.18)' : 'oklch(0.65 0.22 25 / 0.18)'}
                />
              )}

              {/* Wick */}
              <line
                x1={x}
                y1={wickTop}
                x2={x}
                y2={wickBottom}
                stroke={color}
                strokeWidth={1}
              />

              {/* Body */}
              <rect
                x={x - candleWidth / 2}
                y={bodyTop}
                width={candleWidth}
                height={bodyH}
                fill={color}
                stroke={isLast ? 'oklch(0.97 0.01 250)' : 'none'}
                strokeWidth={isLast ? 1 : 0}
              />

              {/* Doji marker */}
              {isDoji && (
                <g>
                  <circle
                    cx={x}
                    cy={padding.top - 5}
                    r={3}
                    fill="oklch(0.82 0.18 80)"
                  />
                  <text
                    x={x}
                    y={padding.top - 10}
                    fill="oklch(0.82 0.18 80)"
                    fontSize={8}
                    fontWeight="bold"
                    textAnchor="middle"
                  >
                    D
                  </text>
                </g>
              )}

              {/* Force marker */}
              {isForce && (
                <g>
                  <circle
                    cx={x}
                    cy={padding.top - 5}
                    r={3}
                    fill={isBull ? 'oklch(0.72 0.19 155)' : 'oklch(0.65 0.22 25)'}
                  />
                  <text
                    x={x}
                    y={padding.top - 10}
                    fill={isBull ? 'oklch(0.72 0.19 155)' : 'oklch(0.65 0.22 25)'}
                    fontSize={8}
                    fontWeight="bold"
                    textAnchor="middle"
                  >
                    F
                  </text>
                </g>
              )}

              {/* Signal arrow */}
              {signal && (
                <g>
                  {/* Triangle marker */}
                  <polygon
                    points={
                      signal.direction === 'CALL'
                        ? `${x},${bodyBottom + 8} ${x - 5},${bodyBottom + 16} ${x + 5},${bodyBottom + 16}`
                        : `${x - 5},${bodyTop - 8} ${x + 5},${bodyTop - 8} ${x},${bodyTop - 16}`
                    }
                    fill={signal.direction === 'CALL' ? 'oklch(0.72 0.19 155)' : 'oklch(0.65 0.22 25)'}
                    stroke="oklch(0.97 0.01 250)"
                    strokeWidth={0.5}
                  />
                  <text
                    x={x}
                    y={signal.direction === 'CALL' ? bodyBottom + 26 : bodyTop - 22}
                    fill={signal.direction === 'CALL' ? 'oklch(0.72 0.19 155)' : 'oklch(0.65 0.22 25)'}
                    fontSize={9}
                    fontWeight="bold"
                    textAnchor="middle"
                  >
                    {signal.direction === 'CALL' ? 'BUY' : 'SELL'}
                  </text>
                </g>
              )}

              {/* Volume bars */}
              {mostrarVolumen && volumenAlto > 0 && (
                <rect
                  x={x - candleWidth / 2}
                  y={height - 20 - volumenAlto}
                  width={candleWidth}
                  height={volumenAlto}
                  fill={color}
                  opacity={0.3}
                />
              )}
            </g>
          );
        })}

        {/* Last price line */}
        {candles.length > 0 && (
          <g>
            <line
              x1={padding.left}
              y1={scaleY(candles[candles.length - 1].close)}
              x2={1000 - padding.right}
              y2={scaleY(candles[candles.length - 1].close)}
              stroke="oklch(0.97 0.01 250)"
              strokeWidth={1}
              strokeDasharray="4 2"
              opacity={0.5}
            />
            <rect
              x={1000 - padding.right + 2}
              y={scaleY(candles[candles.length - 1].close) - 8}
              width={padding.right - 4}
              height={16}
              fill="oklch(0.97 0.01 250)"
              rx={2}
            />
            <text
              x={1000 - padding.right / 2}
              y={scaleY(candles[candles.length - 1].close) + 3}
              fill="oklch(0.13 0.02 250)"
              fontSize={9}
              fontWeight="bold"
              textAnchor="middle"
              fontFamily="monospace"
            >
              {formatPrice(candles[candles.length - 1].close)}
            </text>
          </g>
        )}

        {/* Lateral zone marker */}
        {signals.length === 0 && (
          <text
            x={500}
            y={height / 2}
            fill="oklch(0.65 0.03 250)"
            fontSize={14}
            textAnchor="middle"
            opacity={0.3}
          >
            Esperando señales...
          </text>
        )}
      </svg>
    </div>
  );
}
