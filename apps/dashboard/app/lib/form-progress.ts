import { formErrorMessagesAt } from '~/lib/form-errors';

/**
 * Save-readiness progress for the sectioned dashboard forms. Completion is
 * derived from the same contract used for submission, so optional fields never
 * reduce the score — they produce no Zod issue.
 *
 * One `fieldSection` map per form is the single source of truth for "which
 * section owns this field": progress, error badges, the wizard's jump-to-error
 * and the per-step error list all read it, so they cannot disagree.
 *
 * Structural schema type on purpose: the dashboard has no direct `zod`
 * dependency, it only consumes schemas from `@booking/contracts`.
 */

interface ProgressSchema {
  safeParse: (values: unknown) => {
    success: boolean;
    error?: { issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey> }> };
  };
}

export interface FormSectionDefinition<Id extends string> {
  id: Id;
  label: string;
  shortLabel: string;
}

export interface FormProgressItem<Id extends string> extends FormSectionDefinition<Id> {
  complete: boolean;
}

export interface FormProgress<Id extends string> {
  percentage: number;
  completedCount: number;
  items: FormProgressItem<Id>[];
}

export interface FormSectionMap<Id extends string, Values> {
  sections: ReadonlyArray<FormSectionDefinition<Id>>;
  fieldSection: Record<string, Id>;
  getProgress: (values: Values) => FormProgress<Id>;
  /** Map RHF/server field errors to the same visual sections. */
  getErrorSections: (errors: unknown) => Set<Id>;
  /** The section owning the first invalid field — where the wizard jumps to. */
  getFirstErrorSection: (errors: unknown) => Id | undefined;
  /** Every validation message belonging to one section, de-duplicated. */
  getSectionErrorMessages: (errors: unknown, section: Id) => string[];
}

/**
 * Progress for a form that has no client-side schema (a plain `<Form>` whose
 * only client validation is the browser's): a section counts as done once the
 * user has passed through it.
 */
export function progressFromCompleted<Id extends string>(
  sections: ReadonlyArray<FormSectionDefinition<Id>>,
  completed: ReadonlySet<Id>,
): FormProgress<Id> {
  const items = sections.map((section) => ({ ...section, complete: completed.has(section.id) }));
  const completedCount = items.filter((item) => item.complete).length;
  return {
    items,
    completedCount,
    percentage: Math.round((completedCount / items.length) * 100),
  };
}

export function createFormProgress<Id extends string, Values>({
  sections,
  fieldSection,
  schema,
}: {
  sections: ReadonlyArray<FormSectionDefinition<Id>>;
  fieldSection: Record<string, Id>;
  /**
   * Omit for a form with no client-side schema — `getProgress` then reports
   * nothing complete and the caller uses `progressFromCompleted` instead.
   */
  schema?: ProgressSchema;
}): FormSectionMap<Id, Values> {
  function getErrorSections(errors: unknown): Set<Id> {
    const found = new Set<Id>();
    if (!errors || typeof errors !== 'object') return found;

    for (const field of Object.keys(errors)) {
      const section = fieldSection[field];
      if (section) found.add(section);
    }
    return found;
  }

  return {
    sections,
    fieldSection,

    getProgress(values) {
      if (!schema) return progressFromCompleted(sections, new Set<Id>());

      const invalidSections = new Set<Id>();
      const result = schema.safeParse(values);

      if (!result.success) {
        for (const issue of result.error?.issues ?? []) {
          const section = fieldSection[String(issue.path[0] ?? '')];
          if (section) invalidSections.add(section);
        }
      }

      const items = sections.map((section) => ({
        ...section,
        complete: !invalidSections.has(section.id),
      }));

      const completedCount = items.filter((item) => item.complete).length;

      return {
        items,
        completedCount,
        percentage: Math.round((completedCount / items.length) * 100),
      };
    },

    getErrorSections,

    getFirstErrorSection(errors) {
      if (!errors || typeof errors !== 'object') return undefined;
      const field = Object.keys(errors)[0];
      return field ? fieldSection[field] : undefined;
    },

    getSectionErrorMessages(errors, section) {
      const messages = Object.entries(fieldSection).flatMap(([field, owner]) =>
        owner === section ? formErrorMessagesAt(errors, [field]) : [],
      );
      return [...new Set(messages)];
    },
  };
}
