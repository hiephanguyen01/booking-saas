import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Circle,
  LoaderCircle,
  Save,
} from 'lucide-react';
import { Button } from '@booking/ui/components/ui/button';
import { cn } from '@booking/ui/lib/utils';
import type { FormProgress } from '~/features/partner/lib/form-progress';

/**
 * The stepped-form design shared by the partner listing form and the listing
 * group ("thông tin chung") form. Section ids are generic so each form declares
 * its own steps in its `*-form-progress` module.
 */

export function ListingFormSection<Id extends string>({
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
      data-listing-form-section
      className={cn(
        'scroll-mt-32 overflow-hidden rounded-2xl border bg-card shadow-[0_12px_36px_-28px_hsl(var(--foreground)/0.35)]',
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

export interface ListingWizardItem<Id extends string> {
  id: Id;
  label: string;
  shortLabel: string;
}

export function ListingWizardNav<Id extends string>({
  items,
  currentIndex,
  furthestIndex,
  completed,
  canNavigate,
  onNavigate,
}: {
  items: ReadonlyArray<ListingWizardItem<Id>>;
  currentIndex: number;
  furthestIndex: number;
  completed: Set<Id>;
  canNavigate: (index: number) => boolean;
  onNavigate: (index: number) => void;
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
            <p className="text-sm font-semibold">Tạo bản nháp</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Hoàn thành từng phần. Bạn có thể sửa lại trước khi gửi duyệt.
            </p>
          </div>
          <nav className="p-2" aria-label="Các phần tạo bài đăng">
            {items.map((item, index) => {
              const active = index === currentIndex;
              const done = completed.has(item.id);
              const available = index <= furthestIndex && canNavigate(index);
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={!available}
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
            {current?.label ?? 'Biểu mẫu bài đăng'}
          </div>
        </div>
      </aside>
    </>
  );
}

export function ListingWizardActions({
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
    <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-12px_32px_-24px_hsl(var(--foreground)/0.5)] backdrop-blur xl:static xl:z-auto xl:rounded-2xl xl:border xl:bg-card xl:p-4 xl:shadow-none">
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

export function ListingContextStrip({
  typeName,
  itemContext,
  dirty,
  idleLabel = 'Đường dẫn tạo tự động khi lưu',
}: {
  typeName: string;
  itemContext: string;
  dirty: boolean;
  idleLabel?: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border bg-card px-5 py-4 shadow-[0_12px_36px_-28px_hsl(var(--foreground)/0.35)] sm:px-6">
      <div className="absolute inset-y-0 left-0 w-1 bg-primary" aria-hidden />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Loại dịch vụ
          </p>
          <p className="mt-1 text-sm font-semibold">
            {typeName} <span className="font-normal text-muted-foreground">· {itemContext}</span>
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

export function ListingFormRail<Id extends string>({
  progress,
  errorSections,
  activeSection,
  dirty,
  isSubmitting,
  submitLabel,
  onNavigate,
  hint = 'Tin đăng được lưu ở trạng thái nháp để bạn kiểm tra.',
}: ListingNavigationProps<Id> & { hint?: ReactNode }) {
  return (
    <aside className="hidden self-stretch xl:block">
      <div className="sticky top-20 space-y-4">
        <div className="overflow-hidden rounded-2xl border bg-card shadow-[0_12px_36px_-28px_hsl(var(--foreground)/0.35)]">
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

export function ListingFormMobileNav<Id extends string>({
  progress,
  errorSections,
  activeSection,
  onNavigate,
}: Pick<
  ListingNavigationProps<Id>,
  'progress' | 'errorSections' | 'activeSection' | 'onNavigate'
>) {
  return (
    <div className="sticky top-14 z-20 -mx-4 border-y bg-background/95 px-4 py-3 backdrop-blur xl:hidden">
      <label className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
        <span className="text-xs font-medium text-muted-foreground">
          Phần{' '}
          {Math.max(
            0,
            progress.items.findIndex((item) => item.id === activeSection),
          ) + 1}
          /{progress.items.length}
        </span>
        <select
          value={activeSection}
          onChange={(event) => onNavigate(event.target.value as Id)}
          className="h-10 min-w-0 rounded-xl border bg-background px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Chọn phần của biểu mẫu"
        >
          {progress.items.map((item) => (
            <option key={item.id} value={item.id}>
              {errorSections.has(item.id) ? 'Cần kiểm tra: ' : ''}
              {item.shortLabel}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

export function ListingFormMobileActions<Id extends string>({
  isSubmitting,
  submitLabel,
}: Pick<ListingNavigationProps<Id>, 'progress' | 'isSubmitting' | 'submitLabel'>) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-12px_32px_-24px_hsl(var(--foreground)/0.5)] backdrop-blur xl:hidden">
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

interface ListingNavigationProps<Id extends string> {
  progress: FormProgress<Id>;
  errorSections: Set<Id>;
  activeSection: Id;
  dirty: boolean;
  isSubmitting: boolean;
  submitLabel: string;
  onNavigate: (id: Id) => void;
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

export function useActiveListingFormSection<Id extends string>(
  initialSection: Id,
): {
  activeSection: Id;
  navigateToSection: (id: Id) => void;
} {
  const [activeSection, setActiveSection] = useState<Id>(initialSection);
  const navigationTargetRef = useRef<Id | null>(null);
  const navigationReleaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateActiveSection = useCallback(() => {
    if (navigationTargetRef.current) return;

    const sections = Array.from(
      document.querySelectorAll<HTMLElement>('[data-listing-form-section]'),
    );
    if (sections.length === 0) return;

    const pageBottom = window.scrollY + window.innerHeight;
    const isAtPageBottom = pageBottom >= document.documentElement.scrollHeight - 2;
    if (isAtPageBottom) {
      const lastSection = sections[sections.length - 1];
      if (lastSection?.id) {
        setActiveSection(lastSection.id as Id);
      }
      return;
    }

    const scrollAnchor = 132;
    let active = sections[0];
    for (const section of sections) {
      if (section.getBoundingClientRect().top > scrollAnchor) break;
      active = section;
    }

    if (active?.id) setActiveSection(active.id as Id);
  }, []);

  const scheduleNavigationRelease = useCallback(() => {
    if (navigationReleaseTimerRef.current) {
      clearTimeout(navigationReleaseTimerRef.current);
    }

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    navigationReleaseTimerRef.current = setTimeout(
      () => {
        navigationTargetRef.current = null;
        updateActiveSection();
      },
      reducedMotion ? 0 : 450,
    );
  }, [updateActiveSection]);

  useEffect(() => {
    const visibleSections = new Map<Element, IntersectionObserverEntry>();
    const sections = Array.from(
      document.querySelectorAll<HTMLElement>('[data-listing-form-section]'),
    );
    updateActiveSection();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visibleSections.set(entry.target, entry);
          else visibleSections.delete(entry.target);
        }
        if (navigationTargetRef.current) return;

        const active = Array.from(visibleSections.values()).sort(
          (left, right) =>
            Math.abs(left.boundingClientRect.top - 132) -
            Math.abs(right.boundingClientRect.top - 132),
        )[0]?.target as HTMLElement | undefined;
        if (active?.id) setActiveSection(active.id as Id);
      },
      {
        rootMargin: '-132px 0px -55% 0px',
        threshold: [0, 0.01, 0.25, 0.5, 1],
      },
    );

    for (const section of sections) observer.observe(section);

    return () => {
      observer.disconnect();
      if (navigationReleaseTimerRef.current) {
        clearTimeout(navigationReleaseTimerRef.current);
      }
    };
  }, [scheduleNavigationRelease, updateActiveSection]);

  const navigateToSection = useCallback(
    (id: Id) => {
      navigationTargetRef.current = id;
      setActiveSection(id);
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      document
        .getElementById(id)
        ?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
      scheduleNavigationRelease();
    },
    [scheduleNavigationRelease],
  );

  return { activeSection, navigateToSection };
}
