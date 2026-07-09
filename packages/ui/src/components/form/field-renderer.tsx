"use client"

import * as React from "react"
import { format } from "date-fns"
import { CalendarIcon, CheckIcon, ChevronsUpDownIcon } from "lucide-react"
import { useFormContext, type FieldValues } from "react-hook-form"

import { cn } from "@booking/ui/lib/utils"
import { Button } from "@booking/ui/components/ui/button"
import { Calendar } from "@booking/ui/components/ui/calendar"
import { Checkbox } from "@booking/ui/components/ui/checkbox"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@booking/ui/components/ui/command"
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@booking/ui/components/ui/form"
import { Input } from "@booking/ui/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@booking/ui/components/ui/popover"
import { RadioGroup, RadioGroupItem } from "@booking/ui/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@booking/ui/components/ui/select"
import { Switch } from "@booking/ui/components/ui/switch"
import { Textarea } from "@booking/ui/components/ui/textarea"
import type {
  BooleanFieldConfig,
  ChoiceFieldConfig,
  DateFieldConfig,
  FieldConfig,
  TextFieldConfig,
} from "@booking/ui/components/form/types"

/**
 * Renders a single field from its config, bound to react-hook-form. Boolean and
 * date types get their own inline layout; everything else uses the standard
 * label / control / message stack.
 */
export function FieldRenderer<T extends FieldValues>({ field }: { field: FieldConfig<T> }) {
  const { control } = useFormContext<T>()

  if (field.type === "checkbox" || field.type === "switch") {
    return <BooleanField field={field} control={control} />
  }

  return (
    <FormField
      control={control}
      name={field.name}
      render={({ field: rhf }) => (
        <FormItem>
          {field.label ? <FormLabel>{field.label}</FormLabel> : null}
          <FormControl>{renderControl(field, rhf)}</FormControl>
          {field.description ? <FormDescription>{field.description}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

type RhfField = {
  value: unknown
  onChange: (value: unknown) => void
  onBlur: () => void
  name: string
  ref: React.Ref<unknown>
  disabled?: boolean
}

function renderControl<T extends FieldValues>(
  field: FieldConfig<T>,
  rhf: RhfField,
): React.ReactElement {
  switch (field.type) {
    case "textarea":
      return (
        <Textarea
          placeholder={field.placeholder}
          rows={(field as TextFieldConfig<T>).rows}
          disabled={field.disabled}
          {...textBinding(rhf)}
        />
      )
    case "select":
      return <SelectControl field={field} rhf={rhf} />
    case "combobox":
      return <ComboboxControl field={field} rhf={rhf} />
    case "radio":
      return <RadioControl field={field} rhf={rhf} />
    case "date":
      return <DateControl field={field} rhf={rhf} />
    case "number":
      return (
        <Input
          type="number"
          inputMode="decimal"
          placeholder={field.placeholder}
          autoComplete={field.autoComplete}
          disabled={field.disabled}
          name={rhf.name}
          onBlur={rhf.onBlur}
          value={rhf.value === undefined || rhf.value === null ? "" : String(rhf.value)}
          onChange={(e) => rhf.onChange(e.target.value === "" ? undefined : e.target.valueAsNumber)}
        />
      )
    default:
      return (
        <Input
          type={field.type}
          placeholder={field.placeholder}
          autoComplete={field.autoComplete}
          disabled={field.disabled}
          {...textBinding(rhf)}
        />
      )
  }
}

/** Coerces null/undefined to "" so inputs stay controlled. */
function textBinding(rhf: RhfField) {
  return {
    name: rhf.name,
    onBlur: rhf.onBlur,
    value: rhf.value === undefined || rhf.value === null ? "" : String(rhf.value),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      rhf.onChange(e.target.value),
  }
}

function SelectControl<T extends FieldValues>({
  field,
  rhf,
}: {
  field: ChoiceFieldConfig<T>
  rhf: RhfField
}) {
  return (
    <Select
      value={rhf.value ? String(rhf.value) : undefined}
      onValueChange={rhf.onChange}
      disabled={field.disabled}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder={field.placeholder ?? "Chọn..."} />
      </SelectTrigger>
      <SelectContent>
        {field.options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function RadioControl<T extends FieldValues>({
  field,
  rhf,
}: {
  field: ChoiceFieldConfig<T>
  rhf: RhfField
}) {
  return (
    <RadioGroup
      value={rhf.value ? String(rhf.value) : undefined}
      onValueChange={rhf.onChange}
      disabled={field.disabled}
      className="flex flex-col gap-2"
    >
      {field.options.map((opt) => (
        <label key={opt.value} className="flex items-center gap-2 text-sm font-normal">
          <RadioGroupItem value={opt.value} />
          {opt.label}
        </label>
      ))}
    </RadioGroup>
  )
}

function ComboboxControl<T extends FieldValues>({
  field,
  rhf,
}: {
  field: ChoiceFieldConfig<T>
  rhf: RhfField
}) {
  const [open, setOpen] = React.useState(false)
  const current = field.options.find((o) => o.value === rhf.value)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={field.disabled}
          className={cn("w-full justify-between font-normal", !current && "text-muted-foreground")}
        >
          {current?.label ?? field.placeholder ?? "Chọn..."}
          <ChevronsUpDownIcon className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder={field.searchPlaceholder ?? "Tìm kiếm..."} />
          <CommandList>
            <CommandEmpty>Không có kết quả.</CommandEmpty>
            <CommandGroup>
              {field.options.map((opt) => (
                <CommandItem
                  key={opt.value}
                  value={opt.label}
                  onSelect={() => {
                    rhf.onChange(opt.value)
                    setOpen(false)
                  }}
                >
                  <CheckIcon
                    className={cn(
                      "mr-2 size-4",
                      opt.value === rhf.value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {opt.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function DateControl<T extends FieldValues>({
  field,
  rhf,
}: {
  field: DateFieldConfig<T>
  rhf: RhfField
}) {
  const [open, setOpen] = React.useState(false)
  const value = rhf.value instanceof Date ? rhf.value : rhf.value ? new Date(String(rhf.value)) : undefined
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={field.disabled}
          className={cn("w-full justify-start font-normal", !value && "text-muted-foreground")}
        >
          <CalendarIcon className="mr-2 size-4" />
          {value ? format(value, "dd/MM/yyyy") : (field.placeholder ?? "Chọn ngày")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={(d) => {
            rhf.onChange(d)
            setOpen(false)
          }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  )
}

function BooleanField<T extends FieldValues>({
  field,
  control,
}: {
  field: BooleanFieldConfig<T>
  control: ReturnType<typeof useFormContext<T>>["control"]
}) {
  return (
    <FormField
      control={control}
      name={field.name}
      render={({ field: rhf }) => (
        <FormItem className="flex flex-row items-start gap-3 space-y-0 rounded-md border p-3">
          <FormControl>
            {field.type === "switch" ? (
              <Switch
                checked={!!rhf.value}
                onCheckedChange={rhf.onChange}
                disabled={field.disabled}
              />
            ) : (
              <Checkbox
                checked={!!rhf.value}
                onCheckedChange={rhf.onChange}
                disabled={field.disabled}
              />
            )}
          </FormControl>
          <div className="space-y-1 leading-none">
            {field.label ? <FormLabel>{field.label}</FormLabel> : null}
            {field.description ? <FormDescription>{field.description}</FormDescription> : null}
            <FormMessage />
          </div>
        </FormItem>
      )}
    />
  )
}
