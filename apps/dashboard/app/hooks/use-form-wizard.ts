import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormSectionDefinition, FormSectionMap } from '~/lib/form-progress';

/**
 * State for a stepped create form: which step is showing, how far the user has
 * got, which steps they have completed and which they have attempted (an
 * attempted step is allowed to show its errors; an untouched one is not).
 *
 * Validation is injected into `next()` rather than assumed, so a
 * react-hook-form form passes `form.trigger(...)` while a plain `<Form>` passes
 * a native `reportValidity()` check and both get the same behaviour.
 */

export interface FormWizardController<Id extends string> {
  index: number;
  current: FormSectionDefinition<Id> | undefined;
  furthestIndex: number;
  completed: ReadonlySet<Id>;
  attempted: ReadonlySet<Id>;
  /** 1-based position, for `WizardSection`'s "Phần N" label. */
  stepNumber: (id: Id) => number;
  goBack: () => void;
  goTo: (index: number) => void;
  /** Validate the current step; on success mark it complete and move on. */
  next: (validateStep: (id: Id) => boolean | Promise<boolean>) => Promise<void>;
  /** Reveal the step owning the first invalid field (GenericForm `onInvalid`). */
  revealInvalid: (errors: unknown) => void;
  /** Un-complete steps that stopped being valid after a later edit. */
  retainCompleted: (stillComplete: (id: Id) => boolean) => void;
}

export function scrollToWizardTop(): void {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
}

/**
 * `validateStep` for a form with no client-side schema: run the browser's own
 * constraint validation over the step's controls and let it surface the first
 * failure. Only the visible step is checked, so the message always has
 * somewhere to point.
 */
export function validateNativeStep(sectionId: string): boolean {
  const section = document.getElementById(sectionId);
  if (!section) return true;

  const controls = section.querySelectorAll<
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  >('input, select, textarea');
  for (const control of controls) {
    if (!control.checkValidity()) {
      control.reportValidity();
      return false;
    }
  }
  return true;
}

/** After the DOM has settled, put the caret on the step's first bad control. */
function focusFirstInvalidControl(sectionId: string): void {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      const firstInvalid = document
        .getElementById(sectionId)
        ?.querySelector<HTMLElement>('[aria-invalid="true"]');
      firstInvalid?.focus();
      firstInvalid?.scrollIntoView({ block: 'center' });
    });
  });
}

export function useFormWizard<Id extends string, Values>({
  map,
  fieldErrors,
  enabled = true,
}: {
  map: FormSectionMap<Id, Values>;
  /** Field errors returned by the route action, which arrive after a submit. */
  fieldErrors?: Record<string, string[]> | null;
  /** `false` on edit surfaces, where every section is on the page at once. */
  enabled?: boolean;
}): FormWizardController<Id> {
  const { sections, fieldSection } = map;

  const initialIndex = useMemo(() => {
    const firstField = Object.keys(fieldErrors ?? {})[0];
    const section = firstField ? fieldSection[firstField] : undefined;
    return Math.max(
      0,
      sections.findIndex((item) => item.id === section),
    );
    // The initial index is a mount-time seed; later errors go through the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [index, setIndex] = useState(initialIndex);
  const [furthestIndex, setFurthestIndex] = useState(initialIndex);
  const [completed, setCompleted] = useState<Set<Id>>(() => new Set());
  const [attempted, setAttempted] = useState<Set<Id>>(() => new Set());

  const reveal = useCallback((target: number) => {
    setIndex(target);
    setFurthestIndex((furthest) => Math.max(furthest, target));
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const firstField = Object.keys(fieldErrors ?? {})[0];
    const section = firstField ? fieldSection[firstField] : undefined;
    const target = sections.findIndex((item) => item.id === section);
    if (target < 0) return;
    reveal(target);
    if (section) setAttempted((previous) => new Set(previous).add(section));
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[name="${firstField}"]`)?.focus();
    });
  }, [enabled, fieldErrors, fieldSection, reveal, sections]);

  const current = sections[index];

  const next = useCallback<FormWizardController<Id>['next']>(
    async (validateStep) => {
      if (!current) return;
      setAttempted((previous) => new Set(previous).add(current.id));
      if (!(await validateStep(current.id))) {
        focusFirstInvalidControl(current.id);
        return;
      }
      setCompleted((previous) => new Set(previous).add(current.id));
      reveal(Math.min(index + 1, sections.length - 1));
      scrollToWizardTop();
    },
    [current, index, reveal, sections.length],
  );

  const revealInvalid = useCallback<FormWizardController<Id>['revealInvalid']>(
    (errors) => {
      if (!enabled) return;
      const invalid = map.getErrorSections(errors);
      if (invalid.size > 0) setAttempted((previous) => new Set([...previous, ...invalid]));
      const section = map.getFirstErrorSection(errors);
      const target = sections.findIndex((item) => item.id === section);
      if (target < 0) return;
      reveal(target);
    },
    [enabled, map, reveal, sections],
  );

  const retainCompleted = useCallback<FormWizardController<Id>['retainCompleted']>(
    (stillComplete) => {
      setCompleted((previous) => {
        const stale = [...previous].filter((id) => !stillComplete(id));
        if (stale.length === 0) return previous;
        const nextCompleted = new Set(previous);
        for (const id of stale) nextCompleted.delete(id);
        return nextCompleted;
      });
    },
    [],
  );

  return {
    index,
    current,
    furthestIndex,
    completed,
    attempted,
    stepNumber: useCallback(
      (id) => sections.findIndex((item) => item.id === id) + 1,
      [sections],
    ),
    goBack: useCallback(() => {
      setIndex((previous) => Math.max(0, previous - 1));
      scrollToWizardTop();
    }, []),
    goTo: useCallback((target: number) => {
      setIndex(target);
      scrollToWizardTop();
    }, []),
    next,
    revealInvalid,
    retainCompleted,
  };
}
