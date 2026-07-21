import { useId } from 'react';
import { TrendingUp } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { InfoHint } from '@booking/ui/components/ui/info-hint';
import { formatDayMonth, formatVnd, formatVndCompact } from '~/lib/format';

interface Point {
  date: string;
  label: string;
  gmv: number;
}

const W = 720;
const H = 220;
const PAD = { top: 16, right: 12, bottom: 26, left: 52 };

/**
 * 14-day platform GMV trend as a self-contained SVG area chart. It needs no
 * chart-library dependency and stays theme-aware through `currentColor` plus
 * the primary token. Responsive through a viewBox; the container sets height.
 */
export function GmvChart({ data }: { data: Array<{ date: string; gmv: string }> }) {
  const gradientId = useId();
  const points: Point[] = data.map((p) => ({
    date: p.date,
    label: formatDayMonth(p.date),
    gmv: Number(p.gmv),
  }));

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const max = Math.max(1, ...points.map((p) => p.gmv));
  const n = points.length;

  const x = (i: number) => PAD.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;

  const line = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.gmv).toFixed(1)}`)
    .join(' ');
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
              {formatVndCompact(v)}
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

/** "GMV 14 ngày gần nhất" card wrapping {@link GmvChart}, with the no-data state. */
export function GmvTrendCard({ trend }: { trend: Array<{ date: string; gmv: string }> }) {
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="size-4 text-muted-foreground" />
          GMV 14 ngày gần nhất
          <InfoHint>Tổng giá trị giao dịch mỗi ngày trong 14 ngày qua.</InfoHint>
        </CardTitle>
        <CardDescription>Tổng giá trị booking đã xác nhận theo ngày.</CardDescription>
      </CardHeader>
      <CardContent>
        {trend.length > 0 ? (
          <GmvChart data={trend} />
        ) : (
          <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
            Chưa có dữ liệu GMV.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
