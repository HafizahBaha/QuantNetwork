import React, { useState, useId } from 'react';
import { PortfolioResult } from '../types';

// ==========================================
// 1. Sharpe Ratio Comparison Bar Chart
// ==========================================

interface SharpeRatioChartProps {
  portfolios: PortfolioResult[];
}

export const SharpeRatioBarChart: React.FC<SharpeRatioChartProps> = ({ portfolios }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const chartId = useId();

  if (!portfolios || portfolios.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
        No portfolio data available
      </div>
    );
  }

  // Layout parameters
  const width = 800;
  const height = 340;
  const padding = { top: 35, right: 30, bottom: 85, left: 60 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  // Find min and max Sharpe
  const sharpeValues = portfolios.map(p => p.sharpeRatio);
  const rawMin = Math.min(...sharpeValues, 0);
  const rawMax = Math.max(...sharpeValues, 0.5);
  
  // Nice round axis range
  const yMin = rawMin < 0 ? Math.floor(rawMin * 10) / 10 - 0.1 : 0;
  const yMax = Math.ceil(rawMax * 10) / 10 + 0.1;
  const yRange = yMax - yMin || 1;

  // Coordinate transforms
  const getY = (val: number) => {
    return padding.top + plotHeight - ((val - yMin) / yRange) * plotHeight;
  };
  const zeroY = getY(0);

  // Y-axis ticks
  const tickCount = 5;
  const yTicks = Array.from({ length: tickCount + 1 }, (_, i) => {
    const val = yMin + (i * (yMax - yMin)) / tickCount;
    return Number(val.toFixed(2));
  });

  // Bar dimensions
  const barGap = 12;
  const totalBarWidth = plotWidth / portfolios.length;
  const barWidth = Math.max(16, Math.min(48, totalBarWidth - barGap));

  const getUniverseColor = (universe: string, isHovered: boolean) => {
    switch (universe) {
      case 'Periphery':
        return isHovered ? '#1d4ed8' : '#2563eb'; // Blue
      case 'Core':
        return isHovered ? '#dc2626' : '#ef4444'; // Red
      case 'Full':
      default:
        return isHovered ? '#475569' : '#64748b'; // Slate
    }
  };

  return (
    <div className="relative w-full overflow-hidden select-none">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto block"
        style={{ minHeight: '300px' }}
      >
        <defs>
          <linearGradient id={`blue-grad-${chartId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#1d4ed8" />
          </linearGradient>
          <linearGradient id={`red-grad-${chartId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f87171" />
            <stop offset="100%" stopColor="#dc2626" />
          </linearGradient>
          <linearGradient id={`slate-grad-${chartId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#94a3b8" />
            <stop offset="100%" stopColor="#475569" />
          </linearGradient>
          <filter id={`shadow-${chartId}`} x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.15" />
          </filter>
        </defs>

        {/* Horizontal grid lines & Y-axis labels */}
        {yTicks.map((tick, i) => {
          const y = getY(tick);
          return (
            <g key={`ytick-${i}`}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="#e2e8f0"
                strokeDasharray={tick === 0 ? undefined : '4 4'}
                strokeWidth={tick === 0 ? 1.5 : 1}
              />
              <text
                x={padding.left - 10}
                y={y + 4}
                textAnchor="end"
                className="text-[11px] fill-slate-400 font-mono"
              >
                {tick.toFixed(2)}
              </text>
            </g>
          );
        })}

        {/* Zero baseline highlight */}
        {yMin < 0 && (
          <line
            x1={padding.left}
            y1={zeroY}
            x2={width - padding.right}
            y2={zeroY}
            stroke="#94a3b8"
            strokeWidth={1.5}
          />
        )}

        {/* Bars */}
        {portfolios.map((p, idx) => {
          const isHovered = hoveredIdx === idx;
          const x = padding.left + idx * totalBarWidth + (totalBarWidth - barWidth) / 2;
          const barY = p.sharpeRatio >= 0 ? getY(p.sharpeRatio) : zeroY;
          const barH = Math.max(2, Math.abs(getY(p.sharpeRatio) - zeroY));
          const fill = getUniverseColor(p.universe, isHovered);

          return (
            <g
              key={`bar-${idx}`}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              className="cursor-pointer transition-all duration-150"
            >
              {/* Invisible wide hit area for easy hover */}
              <rect
                x={padding.left + idx * totalBarWidth}
                y={padding.top}
                width={totalBarWidth}
                height={plotHeight}
                fill="transparent"
              />

              {/* Bar background highlight on hover */}
              {isHovered && (
                <rect
                  x={padding.left + idx * totalBarWidth}
                  y={padding.top}
                  width={totalBarWidth}
                  height={plotHeight}
                  fill="#f1f5f9"
                  opacity={0.6}
                  rx={6}
                />
              )}

              {/* The actual Bar */}
              <rect
                x={x}
                y={barY}
                width={barWidth}
                height={barH}
                fill={fill}
                rx={4}
                filter={isHovered ? `url(#shadow-${chartId})` : undefined}
                className="transition-colors duration-150"
              />

              {/* Sharpe value label on top of bar */}
              <text
                x={x + barWidth / 2}
                y={p.sharpeRatio >= 0 ? barY - 6 : barY + barH + 14}
                textAnchor="middle"
                className={`text-[11px] font-bold font-mono ${
                  isHovered ? 'fill-slate-900 font-extrabold' : 'fill-slate-600'
                }`}
              >
                {p.sharpeRatio.toFixed(2)}
              </text>

              {/* Rotated X-axis label */}
              <g transform={`translate(${x + barWidth / 2}, ${padding.top + plotHeight + 14})`}>
                <text
                  x={0}
                  y={0}
                  transform="rotate(-28)"
                  textAnchor="end"
                  className={`text-[10px] font-medium transition-colors ${
                    isHovered ? 'fill-blue-600 font-bold' : 'fill-slate-600'
                  }`}
                >
                  {p.model.replace(' (Benchmark)', '')}
                </text>
                <text
                  x={-6}
                  y={13}
                  transform="rotate(-28)"
                  textAnchor="end"
                  className="text-[9px] fill-slate-400 font-semibold uppercase"
                >
                  {p.universe}
                </text>
              </g>
            </g>
          );
        })}

        {/* Y Axis Title */}
        <text
          x={-height / 2 + 10}
          y={16}
          transform="rotate(-90)"
          textAnchor="middle"
          className="text-[11px] fill-slate-500 font-medium tracking-wide"
        >
          Sharpe Ratio
        </text>
      </svg>

      {/* Floating Tooltip */}
      {hoveredIdx !== null && portfolios[hoveredIdx] && (
        <div
          className="absolute pointer-events-none z-20 bg-slate-900/95 text-white px-3.5 py-2.5 rounded-xl shadow-xl border border-slate-700 text-xs backdrop-blur-sm transition-all"
          style={{
            left: `${Math.min(
              width - 180,
              Math.max(
                40,
                padding.left +
                  hoveredIdx * totalBarWidth +
                  totalBarWidth / 2 -
                  90
              )
            )}px`,
            top: '20px',
          }}
        >
          <div className="flex items-center gap-1.5 font-bold border-b border-slate-700/80 pb-1 mb-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{
                backgroundColor: getUniverseColor(portfolios[hoveredIdx].universe, false),
              }}
            />
            <span>{portfolios[hoveredIdx].model}</span>
            <span className="text-[10px] font-semibold text-slate-400 uppercase ml-auto">
              {portfolios[hoveredIdx].universe}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11px]">
            <span className="text-slate-400">Sharpe Ratio:</span>
            <span className="text-right font-bold text-amber-300">
              {portfolios[hoveredIdx].sharpeRatio.toFixed(3)}
            </span>
            <span className="text-slate-400">Ann. Return:</span>
            <span
              className={`text-right ${
                portfolios[hoveredIdx].expectedReturn >= 0
                  ? 'text-emerald-400'
                  : 'text-red-400'
              }`}
            >
              {(portfolios[hoveredIdx].expectedReturn * 100).toFixed(2)}%
            </span>
            <span className="text-slate-400">Ann. Volatility:</span>
            <span className="text-right text-rose-300">
              {(portfolios[hoveredIdx].volatility * 100).toFixed(2)}%
            </span>
            <span className="text-slate-400">Max Drawdown:</span>
            <span className="text-right text-amber-200">
              {(portfolios[hoveredIdx].maxDrawdown * 100).toFixed(2)}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

// ==========================================
// 2. Risk-Return Efficient Frontier & Scatter Plot
// ==========================================

interface RiskReturnScatterChartProps {
  portfolios: PortfolioResult[];
}

export const RiskReturnScatterChart: React.FC<RiskReturnScatterChartProps> = ({ portfolios }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const chartId = useId();

  if (!portfolios || portfolios.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
        No portfolio data available
      </div>
    );
  }

  // Layout parameters
  const width = 800;
  const height = 360;
  const padding = { top: 35, right: 40, bottom: 55, left: 65 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  // Extract ranges
  const volValues = portfolios.map(p => p.volatility * 100);
  const retValues = portfolios.map(p => p.expectedReturn * 100);

  const minVol = Math.min(...volValues);
  const maxVol = Math.max(...volValues);
  const minRet = Math.min(...retValues, 0);
  const maxRet = Math.max(...retValues, 5);

  // Buffer margins
  const xMargin = Math.max(1.0, (maxVol - minVol) * 0.15);
  const xMin = Math.max(0, Math.floor((minVol - xMargin) * 10) / 10);
  const xMax = Math.ceil((maxVol + xMargin) * 10) / 10;
  const xRange = xMax - xMin || 1;

  const yMargin = Math.max(1.0, (maxRet - minRet) * 0.15);
  const yMin = Math.floor((minRet - yMargin) * 10) / 10;
  const yMax = Math.ceil((maxRet + yMargin) * 10) / 10;
  const yRange = yMax - yMin || 1;

  const getX = (volPct: number) => padding.left + ((volPct - xMin) / xRange) * plotWidth;
  const getY = (retPct: number) => padding.top + plotHeight - ((retPct - yMin) / yRange) * plotHeight;

  // Grid ticks
  const xTicksCount = 5;
  const xTicks = Array.from({ length: xTicksCount + 1 }, (_, i) => {
    return xMin + (i * (xMax - xMin)) / xTicksCount;
  });

  const yTicksCount = 5;
  const yTicks = Array.from({ length: yTicksCount + 1 }, (_, i) => {
    return yMin + (i * (yMax - yMin)) / yTicksCount;
  });

  const getUniverseColor = (universe: string) => {
    switch (universe) {
      case 'Periphery':
        return '#2563eb'; // Blue
      case 'Core':
        return '#ef4444'; // Red
      case 'Full':
      default:
        return '#64748b'; // Slate
    }
  };

  // Capital Allocation Line from Risk-Free Rate (assume ~2% Rf for visual intuition or y=0)
  const rf = 0; // Baseline zero
  const maxSharpePortfolio = portfolios.reduce((best, p) => p.sharpeRatio > best.sharpeRatio ? p : best, portfolios[0]);

  return (
    <div className="relative w-full overflow-hidden select-none">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto block"
        style={{ minHeight: '320px' }}
      >
        <defs>
          <filter id={`point-shadow-${chartId}`} x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.25" />
          </filter>
        </defs>

        {/* Horizontal grid lines & Y labels (Return) */}
        {yTicks.map((tick, i) => {
          const y = getY(tick);
          return (
            <g key={`ygrid-${i}`}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="#e2e8f0"
                strokeDasharray={tick === 0 ? undefined : '4 4'}
                strokeWidth={tick === 0 ? 1.5 : 1}
              />
              <text
                x={padding.left - 10}
                y={y + 4}
                textAnchor="end"
                className="text-[11px] fill-slate-400 font-mono"
              >
                {tick.toFixed(1)}%
              </text>
            </g>
          );
        })}

        {/* Vertical grid lines & X labels (Volatility) */}
        {xTicks.map((tick, i) => {
          const x = getX(tick);
          return (
            <g key={`xgrid-${i}`}>
              <line
                x1={x}
                y1={padding.top}
                x2={x}
                y2={padding.top + plotHeight}
                stroke="#f1f5f9"
                strokeDasharray="3 3"
                strokeWidth={1}
              />
              <text
                x={x}
                y={padding.top + plotHeight + 18}
                textAnchor="middle"
                className="text-[11px] fill-slate-400 font-mono"
              >
                {tick.toFixed(1)}%
              </text>
            </g>
          );
        })}

        {/* Capital Allocation Line guideline to highest Sharpe portfolio */}
        {maxSharpePortfolio && (
          <line
            x1={getX(0)}
            y1={getY(rf)}
            x2={getX(maxSharpePortfolio.volatility * 100 * 1.25)}
            y2={getY(maxSharpePortfolio.expectedReturn * 100 * 1.25)}
            stroke="#94a3b8"
            strokeDasharray="3 3"
            strokeWidth={1.5}
            opacity={0.7}
          />
        )}

        {/* Axis Labels */}
        <text
          x={width / 2}
          y={height - 12}
          textAnchor="middle"
          className="text-[11px] fill-slate-500 font-semibold tracking-wide uppercase"
        >
          Annualized Volatility (Risk σ) → Lower is safer
        </text>

        <text
          x={-height / 2 + 10}
          y={18}
          transform="rotate(-90)"
          textAnchor="middle"
          className="text-[11px] fill-slate-500 font-semibold tracking-wide uppercase"
        >
          Annualized Expected Return (μ) ↑ Higher is better
        </text>

        {/* Plot Portfolios as Scatter Points */}
        {portfolios.map((p, idx) => {
          const isHovered = hoveredIdx === idx;
          const cx = getX(p.volatility * 100);
          const cy = getY(p.expectedReturn * 100);
          const color = getUniverseColor(p.universe);
          const isTopSharpe = p.model === maxSharpePortfolio?.model && p.universe === maxSharpePortfolio?.universe;

          return (
            <g
              key={`point-${idx}`}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              className="cursor-pointer transition-all"
            >
              {/* Invisible large hit area */}
              <circle cx={cx} cy={cy} r={24} fill="transparent" />

              {/* Pulsing halo for top Sharpe ratio */}
              {isTopSharpe && (
                <circle
                  cx={cx}
                  cy={cy}
                  r={isHovered ? 16 : 13}
                  fill={color}
                  opacity={0.2}
                  className="animate-pulse"
                />
              )}

              {/* Outer stroke circle */}
              <circle
                cx={cx}
                cy={cy}
                r={isHovered ? 9 : 7}
                fill="#ffffff"
                stroke={color}
                strokeWidth={isHovered ? 3.5 : 2.5}
                filter={`url(#point-shadow-${chartId})`}
                className="transition-all duration-150"
              />

              {/* Inner core circle */}
              <circle
                cx={cx}
                cy={cy}
                r={isHovered ? 5 : 3.5}
                fill={color}
                className="transition-all duration-150"
              />

              {/* Permanent short tag for key points */}
              <text
                x={cx + 10}
                y={cy - 8}
                className={`text-[10px] font-semibold transition-all ${
                  isHovered
                    ? 'fill-slate-900 font-bold scale-105'
                    : 'fill-slate-600'
                }`}
              >
                {p.model.replace(' (Benchmark)', '')}
              </text>
              <text
                x={cx + 10}
                y={cy + 4}
                className="text-[9px] fill-slate-400 font-mono font-medium"
              >
                SR {p.sharpeRatio.toFixed(2)}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Floating Detailed Card when hovering a point */}
      {hoveredIdx !== null && portfolios[hoveredIdx] && (
        <div
          className="absolute pointer-events-none z-20 bg-slate-900/95 text-white px-3.5 py-2.5 rounded-xl shadow-xl border border-slate-700 text-xs backdrop-blur-sm transition-all"
          style={{
            left: `${Math.min(
              width - 200,
              Math.max(
                20,
                getX(portfolios[hoveredIdx].volatility * 100) - 80
              )
            )}px`,
            top: `${Math.max(
              10,
              getY(portfolios[hoveredIdx].expectedReturn * 100) - 100
            )}px`,
          }}
        >
          <div className="flex items-center gap-1.5 font-bold border-b border-slate-700/80 pb-1 mb-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{
                backgroundColor: getUniverseColor(portfolios[hoveredIdx].universe),
              }}
            />
            <span>{portfolios[hoveredIdx].model}</span>
            <span className="text-[10px] font-semibold text-slate-400 uppercase ml-auto">
              {portfolios[hoveredIdx].universe}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px]">
            <span className="text-slate-400">Ann. Return:</span>
            <span
              className={`text-right font-bold ${
                portfolios[hoveredIdx].expectedReturn >= 0
                  ? 'text-emerald-400'
                  : 'text-red-400'
              }`}
            >
              {(portfolios[hoveredIdx].expectedReturn * 100).toFixed(2)}%
            </span>
            <span className="text-slate-400">Ann. Volatility:</span>
            <span className="text-right font-bold text-rose-300">
              {(portfolios[hoveredIdx].volatility * 100).toFixed(2)}%
            </span>
            <span className="text-slate-400">Sharpe Ratio:</span>
            <span className="text-right font-bold text-amber-300">
              {portfolios[hoveredIdx].sharpeRatio.toFixed(3)}
            </span>
            <span className="text-slate-400">Max Drawdown:</span>
            <span className="text-right text-amber-200">
              {(portfolios[hoveredIdx].maxDrawdown * 100).toFixed(2)}%
            </span>
          </div>
        </div>
      )}

      {/* Bottom Key Insights Banner */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-700">Efficient Frontier Positioning:</span>
          <span className="text-slate-500">Portfolios towards top-left provide superior risk-adjusted return.</span>
        </div>
        {maxSharpePortfolio && (
          <div className="flex items-center gap-2">
            <span className="text-slate-500">Optimal Tangency:</span>
            <span className="font-bold text-blue-700 font-mono">
              {maxSharpePortfolio.model} ({maxSharpePortfolio.universe}) — Sharpe {maxSharpePortfolio.sharpeRatio.toFixed(3)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
