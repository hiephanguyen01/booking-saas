import type { FieldValues, Path } from "react-hook-form"

/** An option for `select`, `combobox`, and `radio` fields. */
export interface FieldOption {
  label: string
  value: string
}

/**
 * Shared config for every field. `name` is type-checked against the form's value
 * type `T` — a wrong key is a compile error. `colSpan` places the field on the
 * responsive grid; `hidden(values)` conditionally removes it (its value is dropped
 * from the submission).
 */
interface BaseFieldConfig<T extends FieldValues> {
  name: Path<T>
  label?: string
  description?: string
  placeholder?: string
  /** Columns spanned in the grid layout (1 = full width when `columns` is 1). */
  colSpan?: number
  /** Hide the field when the predicate is true, given the current form values. */
  hidden?: (values: T) => boolean
  disabled?: boolean
  autoComplete?: string
}

/** `text | email | password | url | number | textarea` — plain value inputs. */
export interface TextFieldConfig<T extends FieldValues> extends BaseFieldConfig<T> {
  type: "text" | "email" | "password" | "url" | "number" | "textarea"
  /** Textarea row hint. */
  rows?: number
}

/** `select | combobox | radio` — pick one of `options`. */
export interface ChoiceFieldConfig<T extends FieldValues> extends BaseFieldConfig<T> {
  type: "select" | "combobox" | "radio"
  options: FieldOption[]
  /** Placeholder shown in the combobox search box. */
  searchPlaceholder?: string
}

/** `checkbox | switch` — a boolean toggle. */
export interface BooleanFieldConfig<T extends FieldValues> extends BaseFieldConfig<T> {
  type: "checkbox" | "switch"
}

/** `date` — a calendar popover; the field value is a `Date`. */
export interface DateFieldConfig<T extends FieldValues> extends BaseFieldConfig<T> {
  type: "date"
}

export type FieldConfig<T extends FieldValues> =
  | TextFieldConfig<T>
  | ChoiceFieldConfig<T>
  | BooleanFieldConfig<T>
  | DateFieldConfig<T>
