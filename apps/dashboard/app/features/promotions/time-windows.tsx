import type { PromotionTimeWindowDto } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Input } from '@booking/ui/components/ui/input';
import { Label } from '@booking/ui/components/ui/label';
import { cn } from '@booking/ui/lib/utils';
import { Plus, Trash2 } from 'lucide-react';
import { WEEKDAY_SHORT } from '~/constants/time';

/** One editable off-peak window row (§12.2) — days-of-week + a from/to clock range. */
export type TimeWindow = { days: number[]; from: string; to: string };

/** Read-only off-peak windows as a list; empty → "Mọi khung giờ" (always applicable). */
export function TimeWindowsSummary({ windows }: { windows: PromotionTimeWindowDto[] | null }) {
  if (!windows || windows.length === 0) {
    return <span className="text-muted-foreground">Mọi khung giờ</span>;
  }
  return (
    <ul className="space-y-1">
      {windows.map((w, i) => (
        <li key={i} className="tabular-nums">
          <span className="font-medium">{w.days.map((d) => WEEKDAY_SHORT[d] ?? d).join(', ')}</span>
          <span className="text-muted-foreground"> · {w.from}–{w.to}</span>
        </li>
      ))}
    </ul>
  );
}

/** Controlled editor for the promotion's off-peak windows (weekday toggles + time range). */
export function TimeWindowsEditor({ windows, onChange }: { windows: TimeWindow[]; onChange: (w: TimeWindow[]) => void }) {
  const update = (i: number, patch: Partial<TimeWindow>) => onChange(windows.map((w, idx) => (idx === i ? { ...w, ...patch } : w)));
  const toggleDay = (i: number, day: number) => {
    const w = windows[i];
    const days = w.days.includes(day) ? w.days.filter((d) => d !== day) : [...w.days, day].sort((a, b) => a - b);
    update(i, { days });
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <Label>Khung giờ ưu đãi (off-peak, tuỳ chọn)</Label>
          <p className="text-sm text-muted-foreground">Chỉ áp dụng khi giờ bắt đầu đặt rơi vào một trong các khung giờ.</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...windows, { days: [], from: '18:00', to: '22:00' }])}>
          <Plus className="size-4" /> Thêm khung giờ
        </Button>
      </div>
      {windows.map((w, i) => (
        <div key={i} className="flex flex-wrap items-end gap-3 rounded-md border border-border p-3">
          <div className="space-y-1">
            <Label className="text-xs">Ngày trong tuần</Label>
            <div className="flex gap-1">
              {WEEKDAY_SHORT.map((lbl, day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(i, day)}
                  className={cn(
                    'size-8 rounded-md border text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    w.days.includes(day) ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground',
                  )}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs" htmlFor={`from-${i}`}>Từ</Label>
            <Input id={`from-${i}`} type="time" value={w.from} onChange={(e) => update(i, { from: e.target.value })} className="w-32" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs" htmlFor={`to-${i}`}>Đến</Label>
            <Input id={`to-${i}`} type="time" value={w.to} onChange={(e) => update(i, { to: e.target.value })} className="w-32" />
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={() => onChange(windows.filter((_, idx) => idx !== i))} aria-label="Xoá khung giờ">
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}
