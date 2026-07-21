'use client';

import * as React from 'react';
import {
  useForm,
  type DefaultValues,
  type FieldValues,
  type Path,
  type UseFormReturn,
} from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigation, useSubmit } from 'react-router';
import { AlertCircle } from 'lucide-react';
import type { z } from 'zod';

import { cn } from '@booking/ui/lib/utils';
import { Button } from '@booking/ui/components/ui/button';
import { Form } from '@booking/ui/components/ui/form';
import { FieldRenderer } from '@booking/ui/components/form/field-renderer';
import type { FieldConfig } from '@booking/ui/components/form/types';

export interface GenericFormProps<TSchema extends z.ZodType<FieldValues>> {
  /** Zod schema from `@booking/contracts` — validates on the client and (again) in the action. */
  schema: TSchema;
  /** Field configs; `name`s are type-checked against the schema's inferred type. */
  fields: FieldConfig<z.infer<TSchema>>[];
  defaultValues?: DefaultValues<z.infer<TSchema>>;
  submitLabel?: string;
  /** Localized label shown while the form is being submitted. */
  submitPendingLabel?: string;
  /** Grid columns for the layout (default 1). Per-field `colSpan` overrides width. */
  columns?: 1 | 2 | 3 | 4;
  /** Form-level error from the action (`data({ error }, …)`). */
  serverError?: string | null;
  /** Per-field errors from the action (`parsed.error.flatten().fieldErrors`). */
  fieldErrors?: Partial<Record<string, string[] | undefined>> | null;
  /** HTTP method for the submission (default "post"). */
  method?: 'post' | 'put' | 'patch';
  /** Optional route path to submit to; defaults to the current route's action. */
  action?: string;
  /** Stretch the submit button to full width (onboarding pages). */
  submitFullWidth?: boolean;
  /**
   * Custom controls rendered inside the form, below the config-driven grid. Use
   * this for fields the `fields` config can't express (dynamic repeaters, mode
   * pickers): bind them to the passed `form` with `Controller`/`form.setValue`
   * and they register into the same react-hook-form instance, so their values
   * are validated by the schema and flow into the submitted payload.
   */
  extraFields?: (form: UseFormReturn<z.infer<TSchema>>) => React.ReactNode;
  /**
   * Optional custom field composition for layouts with visual sections. Each
   * node remains registered to this GenericForm instance; callers only decide
   * where the already-bound field is rendered.
   */
  renderFields?: (
    fields: Array<{ name: string; node: React.ReactNode }>,
    values: z.infer<TSchema>,
  ) => React.ReactNode;
  /**
   * Final mapping of the validated form values into the JSON payload, applied
   * after blank-optional/hidden cleanup. Use it to coerce or assemble nested
   * shapes (e.g. build `modeConfig` from flat inputs) before submit.
   */
  transform?: (values: z.infer<TSchema>) => Record<string, unknown>;
  /** Extra content rendered below the fields (e.g. a secondary button). */
  children?: React.ReactNode;
  className?: string;
  /** Warn before closing/reloading a page that contains unsaved changes. */
  warnOnUnsavedChanges?: boolean;
  /** Reset react-hook-form's dirty state after the parent confirms a successful save. */
  resetDirtyOnSuccess?: boolean;
}

const COLS: Record<1 | 2 | 3 | 4, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
};

const SPAN: Record<number, string> = {
  1: 'sm:col-span-1',
  2: 'sm:col-span-2',
  3: 'sm:col-span-3',
  4: 'sm:col-span-2 lg:col-span-4',
};

const ROW_SPAN: Record<number, string> = {
  1: 'lg:row-span-1',
  2: 'lg:row-span-2',
  3: 'lg:row-span-3',
};

/**
 * Schema-driven form (CLAUDE.md §6). Validates with the shared zod schema on the
 * client, then submits the values as JSON via `useSubmit` — the route's `action`
 * re-validates with the same schema. Optional text fields submit blank as
 * `undefined` (read from the schema's `.isOptional()`).
 */
export function GenericForm<TSchema extends z.ZodType<FieldValues>>({
  schema,
  fields,
  defaultValues,
  submitLabel = 'Lưu',
  submitPendingLabel = 'Đang lưu...',
  columns = 1,
  serverError,
  fieldErrors,
  method = 'post',
  action,
  submitFullWidth,
  extraFields,
  renderFields,
  transform,
  children,
  className,
  warnOnUnsavedChanges,
  resetDirtyOnSuccess,
}: GenericFormProps<TSchema>) {
  type Values = z.infer<TSchema>;
  const form = useForm<Values>({
    // Schemas with .transform()/.default() have differing in/out types; build a
    // dedicated form for those instead of GenericForm (see CLAUDE.md §6).
    resolver: zodResolver(schema as never),
    defaultValues,
  });
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === 'submitting';

  const values = form.watch();

  React.useEffect(() => {
    if (resetDirtyOnSuccess) form.reset(form.getValues());
  }, [form, resetDirtyOnSuccess]);

  React.useEffect(() => {
    if (!warnOnUnsavedChanges || !form.formState.isDirty || isSubmitting) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = true;
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [form.formState.isDirty, isSubmitting, warnOnUnsavedChanges]);

  // Map server-side field errors onto the inputs.
  const { setError } = form;
  React.useEffect(() => {
    if (!fieldErrors) return;
    for (const [name, messages] of Object.entries(fieldErrors)) {
      if (messages && messages.length > 0) {
        setError(name as Path<Values>, { type: 'server', message: messages[0] });
      }
    }
  }, [fieldErrors, setError]);

  const optionalNames = React.useMemo(() => optionalKeys(schema), [schema]);

  const onValid = (data: Values) => {
    let payload: Record<string, unknown> = { ...data };
    // Drop hidden fields and coerce blank optionals to undefined.
    for (const field of fields) {
      if (field.hidden?.(data)) {
        delete payload[field.name];
        continue;
      }
      if (payload[field.name] === '' && optionalNames.has(field.name)) {
        payload[field.name] = undefined;
      }
    }
    // Let the caller assemble/coerce nested shapes (e.g. modeConfig) last.
    if (transform) payload = transform(payload as Values);
    submit(payload as never, {
      method,
      action,
      encType: 'application/json',
    });
  };

  const renderedFields = fields.flatMap((field) => {
    if (field.hidden?.(values as Values)) return [];
    const span = field.colSpan ? SPAN[field.colSpan] : undefined;
    const rowSpan = field.rowSpan ? ROW_SPAN[field.rowSpan] : undefined;
    return [
      {
        name: String(field.name),
        node: (
          <div key={field.name} className={cn(span, rowSpan)}>
            <FieldRenderer field={field} />
          </div>
        ),
      },
    ];
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onValid)}
        className={cn(renderFields ? undefined : 'space-y-6', className)}
        noValidate
      >
        {serverError ? (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            <AlertCircle className="size-4 shrink-0" />
            {serverError}
          </div>
        ) : null}

        {renderFields ? (
          renderFields(renderedFields, values as Values)
        ) : (
          <div className={cn('grid gap-5', COLS[columns])}>
            {renderedFields.map((field) => field.node)}
          </div>
        )}

        {extraFields ? extraFields(form) : null}

        <div className={cn('flex items-center gap-3', submitFullWidth && 'flex-col')}>
          <Button
            type="submit"
            size="control"
            disabled={isSubmitting}
            className={cn('px-8 font-semibold', submitFullWidth && 'w-full')}
          >
            {isSubmitting ? submitPendingLabel : submitLabel}
          </Button>
          {children}
        </div>
      </form>
    </Form>
  );
}

/** Names of optional top-level keys in a ZodObject schema (best-effort). */
function optionalKeys(schema: z.ZodType): Set<string> {
  const names = new Set<string>();
  const shape = (schema as { shape?: Record<string, { isOptional?: () => boolean }> }).shape;
  if (shape) {
    for (const [key, def] of Object.entries(shape)) {
      if (typeof def.isOptional === 'function' && def.isOptional()) names.add(key);
    }
  }
  return names;
}
