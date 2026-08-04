import type { ReactNode } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, Check, LoaderCircle, Save } from 'lucide-react';
import { Button } from '@booking/ui/components/ui/button';
import { cn } from '@booking/ui/lib/utils';

/**
 * Presentation for the stepped create experience: the section shell, its step
 * hint, the context strip above it, the step navigator and the action bar.
 * Nothing here holds state — `use-form-wizard` owns that and `form-wizard`
 * composes the two. Section ids stay generic so every form declares its own
 * steps in a `*-form-progress` module.
 */

export function WizardSection<Id extends string>({
  id,
  step,
  title,
  description,
  icon,
  complete,
  error,
  children,
  contentClassName,
}: {
  id: Id;
  step?: number;
  title: string;
  description: string;
  icon: ReactNode;
  complete: boolean;
  error: boolean;
  children: ReactNode;
  contentClassName?: string;
}) {
  return (
    <section
      id={id}
      data-form-section
      className={cn(
        'scroll-mt-32 overflow-hidden rounded-2xl border bg-card shadow-[0_12px_36px_-28px_color-mix(in_oklch,var(--foreground)_35%,transparent)]',
        error && 'border-destructive/40',
      )}
      aria-labelledby={`${id}-title`}
    >
      <header className="flex items-start gap-3 border-b bg-muted/20 px-5 py-4 sm:px-6 sm:py-5">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl border bg-background text-primary shadow-xs [&_svg]:size-4.5">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          {step ? (
            <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Phần {step}
            </p>
          ) : null}
          <h2 id={`${id}-title`} className="text-base font-semibold tracking-tight">
            {title}
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
        <SectionState complete={complete} error={error} />
      </header>
      <div className={cn('p-5 sm:p-6', contentClassName)}>{children}</div>
    </section>
  );
}

export function WizardStepHint({
  children,
  required = true,
}: {
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <div className="rounded-xl border border-dashed bg-muted/20 px-4 py-3 text-xs leading-5">
      <p className="font-semibold text-foreground">
        {required ? (
          <>
            <span aria-hidden="true" className="text-destructive">
              *
            </span>{' '}
            Bắt buộc để tiếp tục
          </>
        ) : (
          'Không có thao tác bắt buộc'
        )}
      </p>
      <div className="mt-0.5 text-muted-foreground">{children}</div>
    </div>
  );
}

export interface WizardStepItem<Id extends string> {
  id: Id;
  label: string;
  shortLabel: string;
}

export function WizardNav<Id extends string>({
  items,
  currentIndex,
  completed,
  canNavigate,
  onNavigate,
  title = 'Tạo bản nháp',
  description = 'Hoàn thành từng phần. Bạn có thể sửa lại trước khi gửi duyệt.',
}: {
  items: ReadonlyArray<WizardStepItem<Id>>;
  currentIndex: number;
  completed: ReadonlySet<Id>;
  canNavigate: (index: number) => boolean;
  onNavigate: (index: number) => void;
  title?: string;
  description?: string;
}) {
  const current = items[currentIndex];
  return (
    <>
      <div className="sticky top-14 z-20 -mx-4 border-y bg-background/95 px-4 py-3 backdrop-blur xl:hidden">
        <label className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
          <span className="text-xs font-medium text-muted-foreground">
            Phần {currentIndex + 1}/{items.length}
          </span>
          <select
            value={String(currentIndex)}
            onChange={(event) => onNavigate(Number(event.target.value))}
            className="h-10 min-w-0 rounded-xl border bg-background px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Chọn phần của biểu mẫu"
          >
            {items.map((item, index) => (
              <option key={item.id} value={index} disabled={!canNavigate(index)}>
                {item.shortLabel}
              </option>
            ))}
          </select>
        </label>
      </div>

      <aside className="hidden xl:block">
        <div className="sticky top-20 overflow-hidden rounded-2xl border bg-card">
          <div className="border-b px-5 py-4">
            <p className="text-sm font-semibold">{title}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
          </div>
          <nav className="p-2" aria-label="Các phần của biểu mẫu">
            {items.map((item, index) => {
              const active = index === currentIndex;
              const done = completed.has(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={!canNavigate(index)}
                  aria-current={active ? 'step' : undefined}
                  onClick={() => onNavigate(index)}
                  className={cn(
                    'flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm outline-none transition-colors',
                    'focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-45',
                    active
                      ? 'bg-primary/10 font-semibold text-foreground'
                      : 'text-muted-foreground hover:bg-muted/50',
                  )}
                >
                  <span
                    className={cn(
                      'grid size-6 shrink-0 place-items-center rounded-full border text-[10px] font-semibold',
                      done
                        ? 'border-primary/20 bg-primary text-primary-foreground'
                        : active
                          ? 'border-primary/40 text-primary'
                          : 'bg-background',
                    )}
                  >
                    {done ? <Check className="size-3.5" aria-hidden /> : index + 1}
                  </span>
                  <span className="min-w-0 flex-1">{item.label}</span>
                </button>
              );
            })}
          </nav>
          <div className="border-t px-5 py-4 text-xs leading-5 text-muted-foreground">
            {current?.label ?? 'Biểu mẫu'}
          </div>
        </div>
      </aside>
    </>
  );
}

export function WizardActions({
  currentIndex,
  total,
  busy,
  finalLabel,
  secondaryFinalLabel,
  onSecondaryFinal,
  onFinal,
  onBack,
  onNext,
}: {
  currentIndex: number;
  total: number;
  busy: boolean;
  finalLabel: string;
  secondaryFinalLabel?: string;
  onSecondaryFinal?: () => void;
  onFinal?: () => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const last = currentIndex === total - 1;
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-12px_32px_-24px_color-mix(in_oklch,var(--foreground)_50%,transparent)] backdrop-blur xl:static xl:z-auto xl:rounded-2xl xl:border xl:bg-card xl:p-4 xl:shadow-none">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2 xl:flex-nowrap xl:gap-3">
        <Button
          type="button"
          variant="ghost"
          size="control"
          disabled={currentIndex === 0 || busy}
          onClick={onBack}
        >
          <ArrowLeft aria-hidden /> Quay lại
        </Button>
        <p className="text-xs text-muted-foreground">
          Phần {currentIndex + 1}/{total}
        </p>
        {last ? (
          <div
            className={cn(
              'order-last grid w-full gap-2 xl:order-none xl:flex xl:w-auto xl:justify-end',
              secondaryFinalLabel ? 'grid-cols-2' : 'grid-cols-1',
            )}
          >
            {secondaryFinalLabel ? (
              <Button
                type="submit"
                size="control"
                variant="outline"
                disabled={busy}
                onClick={onSecondaryFinal}
              >
                {secondaryFinalLabel}
              </Button>
            ) : null}
            <Button type="submit" size="control" disabled={busy} onClick={onFinal}>
              {busy ? <LoaderCircle className="animate-spin" aria-hidden /> : <Save aria-hidden />}
              {busy ? 'Đang lưu…' : finalLabel}
            </Button>
          </div>
        ) : (
          <Button type="button" size="control" disabled={busy} onClick={onNext}>
            Tiếp tục <ArrowRight aria-hidden />
          </Button>
        )}
      </div>
    </div>
  );
}

export function WizardContextStrip({
  label,
  value,
  context,
  dirty,
  idleLabel = 'Đường dẫn tạo tự động khi lưu',
}: {
  label: string;
  value: string;
  context?: string;
  dirty: boolean;
  idleLabel?: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border bg-card px-5 py-4 shadow-[0_12px_36px_-28px_color-mix(in_oklch,var(--foreground)_35%,transparent)] sm:px-6">
      <div className="absolute inset-y-0 left-0 w-1 bg-primary" aria-hidden />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {label}
          </p>
          <p className="mt-1 text-sm font-semibold">
            {value}
            {context ? (
              <span className="font-normal text-muted-foreground"> · {context}</span>
            ) : null}
          </p>
        </div>
        <span
          className={cn(
            'rounded-full border px-2.5 py-1 text-xs font-medium',
            dirty
              ? 'border-warning/30 bg-warning/10 text-warning'
              : 'bg-muted/40 text-muted-foreground',
          )}
        >
          {dirty ? 'Có thay đổi chưa lưu' : idleLabel}
        </span>
      </div>
    </div>
  );
}

/** The current step's validation errors, listed above the section that owns them. */
export function WizardStepErrors({ messages }: { messages: string[] }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
    >
      <p className="font-medium">Kiểm tra phần này trước khi tiếp tục:</p>
      {messages.length > 0 ? (
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          {messages.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-1">Có trường chưa hợp lệ.</p>
      )}
    </div>
  );
}

function SectionState({ complete, error }: { complete: boolean; error: boolean }) {
  if (error) {
    return (
      <span
        className="grid size-8 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive"
        title="Có trường cần kiểm tra"
      >
        <AlertCircle className="size-4" aria-hidden />
        <span className="sr-only">Có trường cần kiểm tra</span>
      </span>
    );
  }
  if (complete) {
    return (
      <span
        className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"
        title="Đã đủ để lưu"
      >
        <Check className="size-4" aria-hidden />
        <span className="sr-only">Đã đủ để lưu</span>
      </span>
    );
  }
  return null;
}
