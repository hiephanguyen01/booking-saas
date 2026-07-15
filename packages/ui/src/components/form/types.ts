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
  /** Grid rows spanned by taller controls such as document upload tiles. */
  rowSpan?: number
  /** Hide the field when the predicate is true, given the current form values. */
  hidden?: (values: T) => boolean
  disabled?: boolean
  /** Shows the required marker and forwards required semantics to native controls. */
  required?: boolean
  autoComplete?: string
}

/** `text | email | password | url | number | textarea` — plain value inputs. */
export interface TextFieldConfig<T extends FieldValues> extends BaseFieldConfig<T> {
  type: "text" | "email" | "password" | "url" | "number" | "textarea"
  /** Textarea row hint. */
  rows?: number
  /**
   * Password fields render a show/hide eye toggle by default. Set `false` to hide it.
   * Ignored for non-password types.
   */
  showToggle?: boolean
}

/** `select | combobox | radio` — pick one of `options`. */
export interface ChoiceFieldConfig<T extends FieldValues> extends BaseFieldConfig<T> {
  type: "select" | "combobox" | "radio"
  options: FieldOption[]
  /** Placeholder shown in the combobox search box. */
  searchPlaceholder?: string
  /**
   * `radio` layout: `"default"` = a vertical radio list; `"segmented"` = a
   * horizontal button group (the register-partner partner-type toggle). Ignored
   * for `select`/`combobox`.
   */
  variant?: "default" | "segmented"
}

/** `checkbox | switch` — a boolean toggle. */
export interface BooleanFieldConfig<T extends FieldValues> extends BaseFieldConfig<T> {
  type: "checkbox" | "switch"
}

/** `date` — a calendar popover; the field value is a `Date`. */
export interface DateFieldConfig<T extends FieldValues> extends BaseFieldConfig<T> {
  type: "date"
}

/**
 * `file` — an image uploader (direct-to-storage presign, §4.2). The value is a URL
 * `string` (single) or `string[]` (multiple) — never a `File` — so the form still
 * submits plain JSON. `target` is the storage album passed to the presign endpoint.
 */
export interface FileFieldConfig<T extends FieldValues> extends BaseFieldConfig<T> {
  type: "file"
  /** Multiple → value is `string[]`; single (default) → a `string`. */
  multiple?: boolean
  /** Storage album/target for the presign endpoint. */
  target: "listings" | "groups" | "partners" | "tenants"
  /** Accepted MIME types (defaults to the image allowlist). */
  accept?: readonly string[]
  maxSizeMb?: number
  /** Cap on total images in multiple mode. */
  maxFiles?: number
  /** Same-origin resource route proxying `POST /uploads/presign`. */
  presignEndpoint?: string
  /** Select and preview locally without uploading. Useful before an upload API exists. */
  previewOnly?: boolean
  /** Larger dashed tile used by document-verification forms. */
  variant?: "default" | "document"
}

export type FieldConfig<T extends FieldValues> =
  | TextFieldConfig<T>
  | ChoiceFieldConfig<T>
  | BooleanFieldConfig<T>
  | DateFieldConfig<T>
  | FileFieldConfig<T>
