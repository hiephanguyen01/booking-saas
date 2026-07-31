import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@booking/ui/components/ui/button';
import { Input } from '@booking/ui/components/ui/input';
import { Label } from '@booking/ui/components/ui/label';
import {
  DEFAULT_CLOSE,
  DEFAULT_OPEN,
  isValidWindow,
  overlappingIndices,
  type HoursWindow,
} from '~/features/partner/lib/listing-hours';

/** Wire name for one window; the value is `open|close`. */
export const EXCEPTION_WINDOW_FIELD = 'window';

interface Props {
  /** Windows the day already has; empty seeds one default row. */
  initial: HoursWindow[];
  /** Distinguishes the two dialogs' input ids on a page that can render both. */
  idPrefix: string;
  /** Raised on every edit so the parent can block submit while invalid. */
  onValidityChange?: (valid: boolean) => void;
}

/**
 * Edits the N opening windows of one `custom_hours` day — a special day can
 * break for lunch, exactly as a weekday can.
 *
 * Validation reuses `isValidWindow` / `overlappingIndices` from the weekly-hours
 * editor rather than restating it: both screens describe the same thing, and a
 * second copy of "what counts as a clash" is how the two would drift apart.
 *
 * Windows post as repeated hidden fields instead of indexed names, so adding or
 * removing a row never has to renumber anything (same trick as `hours.tsx`).
 */
export function WindowListField({ initial, idPrefix, onValidityChange }: Props) {
  const [windows, setWindows] = useState<HoursWindow[]>(
    initial.length > 0 ? initial : [{ open: DEFAULT_OPEN, close: DEFAULT_CLOSE }],
  );
  const clashes = overlappingIndices(windows);
  const valid = windows.length > 0 && windows.every(isValidWindow) && clashes.size === 0;

  const update = (next: HoursWindow[]): void => {
    setWindows(next);
    onValidityChange?.(
      next.length > 0 && next.every(isValidWindow) && overlappingIndices(next).size === 0,
    );
  };

  return (
    <div className="space-y-2">
      <Label>Khung giờ mở cửa</Label>
      {windows.map((window, index) => (
        <div key={index} className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="hidden"
              name={EXCEPTION_WINDOW_FIELD}
              value={`${window.open}|${window.close}`}
            />
            <Input
              type="time"
              value={window.open}
              onChange={(event) =>
                update(
                  windows.map((item, current) =>
                    current === index ? { ...item, open: event.target.value } : item,
                  ),
                )
              }
              className="w-32"
              aria-label={`Giờ mở, khung ${index + 1}`}
            />
            <span className="text-muted-foreground" aria-hidden>
              →
            </span>
            <Input
              type="time"
              value={window.close}
              onChange={(event) =>
                update(
                  windows.map((item, current) =>
                    current === index ? { ...item, close: event.target.value } : item,
                  ),
                )
              }
              className="w-32"
              aria-label={`Giờ đóng, khung ${index + 1}`}
            />
            {windows.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => update(windows.filter((_, current) => current !== index))}
                aria-label={`Xoá khung giờ ${index + 1}`}
              >
                <X className="size-4" aria-hidden />
              </Button>
            ) : null}
          </div>
          {!isValidWindow(window) ? (
            <p className="text-xs text-destructive">Giờ đóng phải sau giờ mở</p>
          ) : clashes.has(index) ? (
            <p className="text-xs text-destructive">Trùng với khung giờ khác</p>
          ) : null}
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        id={`${idPrefix}-add-window`}
        onClick={() => update([...windows, { open: DEFAULT_OPEN, close: DEFAULT_CLOSE }])}
      >
        <Plus className="size-4" aria-hidden /> Thêm khung giờ
      </Button>
      {!valid ? null : (
        <p className="text-xs text-muted-foreground">
          Ngoài các khung trên, ngày này đóng cửa — đó là cách khai giờ nghỉ trưa.
        </p>
      )}
    </div>
  );
}
