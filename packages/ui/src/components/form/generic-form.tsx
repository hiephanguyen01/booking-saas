"use client"

import * as React from "react"
import { useForm, type DefaultValues, type FieldValues, type Path } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useNavigation, useSubmit } from "react-router"
import type { z } from "zod"

import { cn } from "@booking/ui/lib/utils"
import { Button } from "@booking/ui/components/ui/button"
import { Form } from "@booking/ui/components/ui/form"
import { FieldRenderer } from "@booking/ui/components/form/field-renderer"
import type { FieldConfig } from "@booking/ui/components/form/types"

export interface GenericFormProps<TSchema extends z.ZodType<FieldValues>> {
  /** Zod schema from `@booking/contracts` — validates on the client and (again) in the action. */
  schema: TSchema
  /** Field configs; `name`s are type-checked against the schema's inferred type. */
  fields: FieldConfig<z.infer<TSchema>>[]
  defaultValues?: DefaultValues<z.infer<TSchema>>
  submitLabel?: string
  /** Grid columns for the layout (default 1). Per-field `colSpan` overrides width. */
  columns?: 1 | 2 | 3
  /** Form-level error from the action (`data({ error }, …)`). */
  serverError?: string | null
  /** Per-field errors from the action (`parsed.error.flatten().fieldErrors`). */
  fieldErrors?: Partial<Record<string, string[] | undefined>> | null
  /** HTTP method for the submission (default "post"). */
  method?: "post" | "put" | "patch"
  /** Optional route path to submit to; defaults to the current route's action. */
  action?: string
  /** Extra content rendered below the fields (e.g. a secondary button). */
  children?: React.ReactNode
  className?: string
}

const COLS: Record<1 | 2 | 3, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
}

const SPAN: Record<number, string> = {
  1: "sm:col-span-1",
  2: "sm:col-span-2",
  3: "sm:col-span-3",
}

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
  submitLabel = "Lưu",
  columns = 1,
  serverError,
  fieldErrors,
  method = "post",
  action,
  children,
  className,
}: GenericFormProps<TSchema>) {
  type Values = z.infer<TSchema>
  const form = useForm<Values>({
    // Schemas with .transform()/.default() have differing in/out types; build a
    // dedicated form for those instead of GenericForm (see CLAUDE.md §6).
    resolver: zodResolver(schema as never),
    defaultValues,
  })
  const submit = useSubmit()
  const navigation = useNavigation()
  const isSubmitting = navigation.state === "submitting"

  const values = form.watch()

  // Map server-side field errors onto the inputs.
  const { setError } = form
  React.useEffect(() => {
    if (!fieldErrors) return
    for (const [name, messages] of Object.entries(fieldErrors)) {
      if (messages && messages.length > 0) {
        setError(name as Path<Values>, { type: "server", message: messages[0] })
      }
    }
  }, [fieldErrors, setError])

  const optionalNames = React.useMemo(() => optionalKeys(schema), [schema])

  const onValid = (data: Values) => {
    const payload: Record<string, unknown> = { ...data }
    // Drop hidden fields and coerce blank optionals to undefined.
    for (const field of fields) {
      if (field.hidden?.(data)) {
        delete payload[field.name]
        continue
      }
      if (payload[field.name] === "" && optionalNames.has(field.name)) {
        payload[field.name] = undefined
      }
    }
    submit(payload as never, {
      method,
      action,
      encType: "application/json",
    })
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onValid)} className={cn("space-y-6", className)} noValidate>
        {serverError ? (
          <div
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {serverError}
          </div>
        ) : null}

        <div className={cn("grid gap-4", COLS[columns])}>
          {fields.map((field) => {
            if (field.hidden?.(values as Values)) return null
            const span = field.colSpan ? SPAN[field.colSpan] : undefined
            return (
              <div key={field.name} className={cn(span)}>
                <FieldRenderer field={field} />
              </div>
            )
          })}
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Đang lưu..." : submitLabel}
          </Button>
          {children}
        </div>
      </form>
    </Form>
  )
}

/** Names of optional top-level keys in a ZodObject schema (best-effort). */
function optionalKeys(schema: z.ZodType): Set<string> {
  const names = new Set<string>()
  const shape = (schema as { shape?: Record<string, { isOptional?: () => boolean }> }).shape
  if (shape) {
    for (const [key, def] of Object.entries(shape)) {
      if (typeof def.isOptional === "function" && def.isOptional()) names.add(key)
    }
  }
  return names
}
