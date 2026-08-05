import type { ReactNode } from 'react';
import { AlertCircle, Check, ChevronRight, Circle, LoaderCircle, Save } from 'lucide-react';
import { Button } from '@booking/ui/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@booking/ui/components/ui/select';
import { cn } from '@booking/ui/lib/utils';
import type { FormProgress } from '~/lib/form-progress';

/**
 * The non-stepped counterpart to `wizard-chrome`: every section is on the page
 * at once and the rail is a scroll-spy table of contents. Used by the edit
 * workspaces, whose sections are already valid and so must stay reachable in
 * any order.
 */

interface FormRailProps<Id extends string> {
  progress: FormProgress<Id>;
  errorSections: ReadonlySet<Id>;
  activeSection: Id;
  dirty: boolean;
  isSubmitting: boolean;
  submitLabel: string;
  onNavigate: (id: Id) => void;
}

export function WizardRail<Id extends string>({
  progress,
  errorSections,
  activeSection,
  dirty,
  isSubmitting,
  submitLabel,
  onNavigate,
  hint = 'Tin đăng được lưu ở trạng thái nháp để bạn kiểm tra.',
}: FormRailProps<Id> & { hint?: ReactNode }) {
  return (
    <aside className="hidden self-stretch xl:block">
      <div className="sticky top-20 space-y-4">
        <div className="overflow-hidden rounded-2xl border bg-card shadow-[0_12px_36px_-28px_color-mix(in_oklch,var(--foreground)_35%,transparent)]">
          <div className="border-b p-5">
            <p className="text-sm font-semibold">Các phần chỉnh sửa</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Di chuyển nhanh giữa các phần. Bạn có thể lưu lại khi nội dung hợp lệ.
            </p>
          </div>

          <nav className="p-2" aria-label="Các phần của biểu mẫu">
            {progress.items.map((item, index) => (
              <SectionNavigationButton
                key={item.id}
                index={index}
                id={item.id}
                label={item.label}
                active={activeSection === item.id}
                complete={item.complete}
                error={errorSections.has(item.id)}
                onNavigate={onNavigate}
              />
            ))}
          </nav>

          <div className="border-t p-4">
            <Button type="submit" size="control" disabled={isSubmitting} className="w-full">
              {isSubmitting ? (
                <LoaderCircle className="animate-spin" aria-hidden />
              ) : dirty ? (
                <Save aria-hidden />
              ) : (
                <ChevronRight aria-hidden />
              )}
              {isSubmitting ? 'Đang lưu…' : submitLabel}
            </Button>
            <p className="mt-2 text-center text-[11px] leading-4 text-muted-foreground">{hint}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

export function FormRailMobileNav<Id extends string>({
  progress,
  errorSections,
  activeSection,
  onNavigate,
}: Pick<FormRailProps<Id>, 'progress' | 'errorSections' | 'activeSection' | 'onNavigate'>) {
  return (
    <div className="sticky top-14 z-20 -mx-4 border-y bg-background/95 px-4 py-3 backdrop-blur xl:hidden">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
        <span className="text-xs font-medium text-muted-foreground">
          Phần{' '}
          {Math.max(
            0,
            progress.items.findIndex((item) => item.id === activeSection),
          ) + 1}
          /{progress.items.length}
        </span>
        <Select value={activeSection} onValueChange={(value) => onNavigate(value as Id)}>
          <SelectTrigger className="w-full min-w-0 font-medium" aria-label="Chọn phần của biểu mẫu">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {progress.items.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {errorSections.has(item.id) ? 'Cần kiểm tra: ' : ''}
                {item.shortLabel}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export function FormRailMobileActions({
  isSubmitting,
  submitLabel,
}: {
  isSubmitting: boolean;
  submitLabel: string;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-12px_32px_-24px_color-mix(in_oklch,var(--foreground)_50%,transparent)] backdrop-blur xl:hidden">
      <div className="mx-auto flex max-w-2xl items-center gap-3">
        <p className="text-xs text-muted-foreground">Lưu toàn bộ thay đổi trên trang</p>
        <Button type="submit" size="control" disabled={isSubmitting} className="ml-auto px-5">
          {isSubmitting ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
          {isSubmitting ? 'Đang lưu…' : submitLabel}
        </Button>
      </div>
    </div>
  );
}

function SectionNavigationButton<Id extends string>({
  index,
  id,
  label,
  active,
  complete,
  error,
  onNavigate,
}: {
  index: number;
  id: Id;
  label: string;
  active: boolean;
  complete: boolean;
  error: boolean;
  onNavigate: (id: Id) => void;
}) {
  return (
    <button
      type="button"
      aria-current={active ? 'step' : undefined}
      onClick={() => onNavigate(id)}
      className={cn(
        'group flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm outline-none transition-colors',
        'focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'bg-primary/10 font-semibold text-foreground'
          : 'text-muted-foreground hover:bg-muted/50',
      )}
    >
      <span
        className={cn(
          'grid size-6 shrink-0 place-items-center rounded-full border text-[10px] font-semibold',
          error
            ? 'border-destructive/30 bg-destructive/10 text-destructive'
            : complete
              ? 'border-primary/20 bg-primary text-primary-foreground'
              : active
                ? 'border-primary/30 text-primary'
                : 'bg-background',
        )}
      >
        {error ? (
          <AlertCircle className="size-3.5" aria-hidden />
        ) : complete ? (
          <Check className="size-3.5" aria-hidden />
        ) : (
          index + 1
        )}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {active ? <Circle className="size-2 fill-current text-primary" aria-hidden /> : null}
    </button>
  );
}
