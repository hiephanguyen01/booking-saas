/**
 * Save-readiness progress for the stepped partner forms (listing + listing
 * group). Completion is derived from the same contract used for submission, so
 * optional fields never reduce the score — they produce no Zod issue.
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

export function createFormProgress<Id extends string, Values>({
  sections,
  fieldSection,
  schema,
}: {
  sections: ReadonlyArray<FormSectionDefinition<Id>>;
  fieldSection: Record<string, Id>;
  schema: ProgressSchema;
}): {
  getProgress: (values: Values) => FormProgress<Id>;
  getErrorSections: (errors: unknown) => Set<Id>;
} {
  return {
    getProgress(values) {
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

    /** Map RHF/server field errors to the same visual sections. */
    getErrorSections(errors) {
      const sections = new Set<Id>();
      if (!errors || typeof errors !== 'object') return sections;

      for (const field of Object.keys(errors)) {
        const section = fieldSection[field];
        if (section) sections.add(section);
      }
      return sections;
    },
  };
}
