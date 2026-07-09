import { useId } from 'react';
import { formatVnd, formatVndShort } from '~/routes/admin/lib/format';

interface Point {
  date: string;
  label: string;
  gmv: number;
}

const W = 720;
const H = 220;
const PAD = { top: 16, right: 12, bottom: 26, left: 52 };

/**
 * 14-day platform GMV trend as a self-contained SVG area chart. Dependency-free
 * (recharts is not hoisted to app scope) and theme-aware via `currentColor` +
 * the primary token. Responsive through a viewBox; the container sets height.
 */
export function GmvChart({ data }: { data: Array<{ date: string; gmv: string }> }) {
  const gradientId = useId();
  const points: Point[] = data.map((p) => ({
    date: p.date,
    label: new Date(p.date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }),
    gmv: Number(p.gmv),
  }));

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const max = Math.max(1, ...points.map((p) => p.gmv));
  const n = points.length;

  const x = (i: number) => PAD.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.gmv).toFixed(1)}`).join(' ');
  const area = `${line} L ${x(n - 1).toFixed(1)} ${(PAD.top + innerH).toFixed(1)} L ${x(0).toFixed(1)} ${(PAD.top + innerH).toFixed(1)} Z`;

  const gridVals = [0, max / 2, max];
  const total = points.reduce((acc, p) => acc + p.gmv, 0);

  return (
    <div
      className="w-full text-primary"
      role="img"
      aria-label={`Biểu đồ GMV 14 ngày, tổng ${formatVnd(total)}`}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[220px] w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {gridVals.map((v, i) => (
          <g key={i}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(v)}
              y2={y(v)}
              className="stroke-border"
              strokeWidth={1}
              strokeDasharray={i === 0 ? undefined : '3 3'}
            />
            <text
              x={PAD.left - 8}
              y={y(v) + 3}
              textAnchor="end"
              className="fill-muted-foreground text-[10px] tabular-nums"
              style={{ fontSize: 10 }}
            >
              {formatVndShort(v)}
            </text>
          </g>
        ))}

        <path d={area} fill={`url(#${gradientId})`} stroke="none" />
        <path
          d={line}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

        {points.map((p, i) => (
          <g key={p.date}>
            <circle cx={x(i)} cy={y(p.gmv)} r={2.5} className="fill-primary" />
            <title>{`${p.date}: ${formatVnd(p.gmv)}`}</title>
          </g>
        ))}

        {points.map((p, i) =>
          n <= 8 || i === 0 || i === n - 1 || i % 3 === 0 ? (
            <text
              key={`lbl-${p.date}`}
              x={x(i)}
              y={H - 8}
              textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
              className="fill-muted-foreground text-[10px]"
              style={{ fontSize: 10 }}
            >
              {p.label}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}
