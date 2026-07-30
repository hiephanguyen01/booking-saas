import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AlertCircle,
  Check,
  ChevronRight,
  Circle,
  LoaderCircle,
  Save,
} from 'lucide-react';
import { Button } from '@booking/ui/components/ui/button';
import { Progress } from '@booking/ui/components/ui/progress';
import { cn } from '@booking/ui/lib/utils';
import type {
  ListingFormProgress,
  ListingFormSectionId,
} from './listing-form-progress';

export function ListingFormSection({
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
  id: ListingFormSectionId;
  step: number;
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
          <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Bước {step}
          </p>
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
}: {
  typeName: string;
  itemContext: string;
  dirty: boolean;
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
          {dirty ? 'Có thay đổi chưa lưu' : 'Đường dẫn tạo tự động khi lưu'}
        </span>
      </div>
    </div>
  );
}

export function ListingFormRail({
  progress,
  errorSections,
  activeSection,
  dirty,
  isSubmitting,
  submitLabel,
  onNavigate,
}: ListingNavigationProps) {
  return (
    <aside className="hidden self-stretch lg:block">
      <div className="sticky top-20 space-y-4">
        <div className="overflow-hidden rounded-2xl border bg-card shadow-[0_12px_36px_-28px_hsl(var(--foreground)/0.35)]">
          <div className="border-b p-5">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Mức độ hoàn thiện</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">
                  {progress.percentage}%
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                {progress.completedCount}/{progress.items.length} mục
              </p>
            </div>
            <Progress value={progress.percentage} className="mt-4 h-1.5" />
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              Chỉ tính những thông tin bắt buộc để có thể lưu tin đăng.
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
            <p className="mt-2 text-center text-[11px] leading-4 text-muted-foreground">
              Tin đăng được lưu ở trạng thái nháp để bạn kiểm tra.
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}

export function ListingFormMobileNav({
  progress,
  errorSections,
  activeSection,
  onNavigate,
}: Pick<
  ListingNavigationProps,
  'progress' | 'errorSections' | 'activeSection' | 'onNavigate'
>) {
  return (
    <div className="sticky top-14 z-20 -mx-4 border-y bg-background/95 px-4 py-2 backdrop-blur lg:hidden">
      <nav
        className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="Các phần của biểu mẫu"
      >
        {progress.items.map((item) => {
          const active = activeSection === item.id;
          const error = errorSections.has(item.id);
          return (
            <button
              key={item.id}
              type="button"
              aria-current={active ? 'step' : undefined}
              onClick={() => onNavigate(item.id)}
              className={cn(
                'flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium outline-none transition-colors',
                'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'bg-card text-muted-foreground',
                error && !active && 'border-destructive/40 text-destructive',
              )}
            >
              {error ? (
                <AlertCircle className="size-3.5" aria-hidden />
              ) : item.complete ? (
                <Check className="size-3.5" aria-hidden />
              ) : null}
              {item.shortLabel}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

export function ListingFormMobileActions({
  progress,
  isSubmitting,
  submitLabel,
}: Pick<ListingNavigationProps, 'progress' | 'isSubmitting' | 'submitLabel'>) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-12px_32px_-24px_hsl(var(--foreground)/0.5)] backdrop-blur lg:hidden">
      <div className="mx-auto flex max-w-2xl items-center gap-3">
        <div className="min-w-20">
          <p className="text-[11px] text-muted-foreground">Hoàn thiện</p>
          <p className="text-sm font-semibold tabular-nums">{progress.percentage}%</p>
        </div>
        <Progress value={progress.percentage} className="hidden h-1.5 flex-1 sm:block" />
        <Button type="submit" size="control" disabled={isSubmitting} className="ml-auto px-5">
          {isSubmitting ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
          {isSubmitting ? 'Đang lưu…' : submitLabel}
        </Button>
      </div>
    </div>
  );
}

interface ListingNavigationProps {
  progress: ListingFormProgress;
  errorSections: Set<ListingFormSectionId>;
  activeSection: ListingFormSectionId;
  dirty: boolean;
  isSubmitting: boolean;
  submitLabel: string;
  onNavigate: (id: ListingFormSectionId) => void;
}

function SectionNavigationButton({
  index,
  id,
  label,
  active,
  complete,
  error,
  onNavigate,
}: {
  index: number;
  id: ListingFormSectionId;
  label: string;
  active: boolean;
  complete: boolean;
  error: boolean;
  onNavigate: (id: ListingFormSectionId) => void;
}) {
  return (
    <button
      type="button"
      aria-current={active ? 'step' : undefined}
      onClick={() => onNavigate(id)}
      className={cn(
        'group flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm outline-none transition-colors',
        'focus-visible:ring-2 focus-visible:ring-ring',
        active ? 'bg-primary/10 font-semibold text-foreground' : 'text-muted-foreground hover:bg-muted/50',
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

export function useActiveListingFormSection(): {
  activeSection: ListingFormSectionId;
  navigateToSection: (id: ListingFormSectionId) => void;
} {
  const [activeSection, setActiveSection] =
    useState<ListingFormSectionId>('listing-content');
  const navigationTargetRef = useRef<ListingFormSectionId | null>(null);
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
        setActiveSection(lastSection.id as ListingFormSectionId);
      }
      return;
    }

    const scrollAnchor = 132;
    let active = sections[0];
    for (const section of sections) {
      if (section.getBoundingClientRect().top > scrollAnchor) break;
      active = section;
    }

    if (active?.id) setActiveSection(active.id as ListingFormSectionId);
  }, []);

  const scheduleNavigationRelease = useCallback(() => {
    if (navigationReleaseTimerRef.current) {
      clearTimeout(navigationReleaseTimerRef.current);
    }

    navigationReleaseTimerRef.current = setTimeout(() => {
      navigationTargetRef.current = null;
      updateActiveSection();
    }, 160);
  }, [updateActiveSection]);

  useEffect(() => {
    let animationFrame: number | null = null;

    const handleViewportChange = () => {
      if (navigationTargetRef.current) {
        scheduleNavigationRelease();
        return;
      }

      if (animationFrame !== null) return;
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = null;
        updateActiveSection();
      });
    };

    updateActiveSection();
    window.addEventListener('scroll', handleViewportChange, { passive: true });
    window.addEventListener('resize', handleViewportChange);

    return () => {
      window.removeEventListener('scroll', handleViewportChange);
      window.removeEventListener('resize', handleViewportChange);
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
      if (navigationReleaseTimerRef.current) {
        clearTimeout(navigationReleaseTimerRef.current);
      }
    };
  }, [scheduleNavigationRelease, updateActiveSection]);

  const navigateToSection = useCallback(
    (id: ListingFormSectionId) => {
      navigationTargetRef.current = id;
      setActiveSection(id);
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      scheduleNavigationRelease();
    },
    [scheduleNavigationRelease],
  );

  return { activeSection, navigateToSection };
}
