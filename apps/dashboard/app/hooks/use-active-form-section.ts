import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Scroll-spy over the `data-form-section` elements rendered by `WizardSection`.
 * Drives the edit workspaces' rail, where every section is on the page at once
 * and the highlighted entry has to follow the scroll position.
 */
export function useActiveFormSection<Id extends string>(
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

    const sections = Array.from(document.querySelectorAll<HTMLElement>('[data-form-section]'));
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
    const sections = Array.from(document.querySelectorAll<HTMLElement>('[data-form-section]'));
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
