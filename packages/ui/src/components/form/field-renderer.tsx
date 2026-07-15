'use client';

import { format } from 'date-fns';
import {
  AlertCircle,
  CalendarIcon,
  CheckIcon,
  ChevronsUpDownIcon,
  Eye,
  EyeOff,
} from 'lucide-react';
import * as React from 'react';
import { useFormContext, type FieldValues } from 'react-hook-form';

import { ImageUpload } from '@booking/ui/components/form/image-upload';
import type {
  BooleanFieldConfig,
  ChoiceFieldConfig,
  DateFieldConfig,
  FieldConfig,
  FileFieldConfig,
  TextFieldConfig,
} from '@booking/ui/components/form/types';
import { Button } from '@booking/ui/components/ui/button';
import { Calendar } from '@booking/ui/components/ui/calendar';
import { Checkbox } from '@booking/ui/components/ui/checkbox';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@booking/ui/components/ui/command';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  useFormField,
} from '@booking/ui/components/ui/form';
import { Input } from '@booking/ui/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@booking/ui/components/ui/popover';
import { RadioGroup, RadioGroupItem } from '@booking/ui/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@booking/ui/components/ui/select';
import { Switch } from '@booking/ui/components/ui/switch';
import { Textarea } from '@booking/ui/components/ui/textarea';
import { cn } from '@booking/ui/lib/utils';

/**
 * Premium control styling (the "register partner" design system, expressed in
 * semantic tokens so it stays dark-mode-correct and tenant-themeable). Merged
 * last onto the shadcn primitives via `cn`, so `tailwind-merge` overrides their
 * baseline height/radius/focus-ring.
 */
const PREMIUM_CONTROL =
  'rounded-lg px-4 text-sm focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-0';
const PREMIUM_TEXTAREA =
  'min-h-28 rounded-lg px-4 py-3 text-sm focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-0';
const PREMIUM_TRIGGER = 'w-full rounded-lg px-4 text-sm';
const SEGMENTED_BASE =
  'flex flex-1 items-center justify-center rounded-lg border text-sm font-semibold transition-all';
const SEGMENTED_ON = 'border-primary bg-primary text-primary-foreground shadow-sm';
const SEGMENTED_OFF =
  'border-input bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground';

export type FieldAppearance = 'default' | 'partner';

const PARTNER_CONTROL =
  'h-14 rounded-sm border-[#d0d5dd] bg-white px-4 text-base font-medium text-[#101828] shadow-none placeholder:text-[#667085] focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15';
const PARTNER_TEXTAREA =
  'min-h-28 rounded-sm border-[#d0d5dd] bg-white px-4 py-3 text-base font-medium text-[#101828] shadow-none placeholder:text-[#667085] focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15';
const PARTNER_TRIGGER =
  'h-14 w-full rounded-sm border-[#d0d5dd] bg-white px-4 text-base font-medium text-[#667085] shadow-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15';

/**
 * Renders a single field from its config, bound to react-hook-form. Boolean and
 * date types get their own inline layout; everything else uses the standard
 * label / control / message stack.
 */
export function FieldRenderer<T extends FieldValues>({
  field,
  appearance = 'default',
}: {
  field: FieldConfig<T>;
  appearance?: FieldAppearance;
}) {
  const { control } = useFormContext<T>();
  const isPartnerSegmented =
    appearance === 'partner' && field.type === 'radio' && field.variant === 'segmented';

  if (field.type === 'checkbox' || field.type === 'switch') {
    return <BooleanField field={field} control={control} appearance={appearance} />;
  }

  return (
    <FormField
      control={control}
      name={field.name}
      render={({ field: rhf }) => (
        <FormItem className={cn(isPartnerSegmented && 'gap-4')}>
          {field.label ? (
            <FormLabel
              className={cn(
                'font-medium',
                appearance === 'partner' && 'text-sm leading-5 text-[#344054]',
                isPartnerSegmented && 'text-lg font-semibold leading-7 text-[#3f3f3f]',
              )}
            >
              {field.label}
              {field.required ? (
                <span aria-hidden="true" className="mr-1 text-[#f43f3f]">
                  *
                </span>
              ) : null}
            </FormLabel>
          ) : null}
          <FormControl>{renderControl(field, rhf, appearance)}</FormControl>
          {field.description ? <FormDescription>{field.description}</FormDescription> : null}
          <FieldMessage />
        </FormItem>
      )}
    />
  );
}

/** Premium inline error row (AlertCircle + destructive text), matching the register page. */
function FieldMessage() {
  const { error, formMessageId } = useFormField();
  const message = error?.message ? String(error.message) : null;
  if (!message) return null;
  return (
    <p id={formMessageId} className="flex items-center gap-1 text-xs text-destructive">
      <AlertCircle className="size-3 shrink-0" />
      {message}
    </p>
  );
}

type RhfField = {
  value: unknown;
  onChange: (value: unknown) => void;
  onBlur: () => void;
  name: string;
  ref: React.Ref<unknown>;
  disabled?: boolean;
};

function renderControl<T extends FieldValues>(
  field: FieldConfig<T>,
  rhf: RhfField,
  appearance: FieldAppearance,
): React.ReactElement {
  switch (field.type) {
    case 'textarea':
      return (
        <Textarea
          placeholder={field.placeholder}
          rows={(field as TextFieldConfig<T>).rows}
          disabled={field.disabled}
          required={field.required}
          className={appearance === 'partner' ? PARTNER_TEXTAREA : PREMIUM_TEXTAREA}
          {...textBinding(rhf)}
        />
      );
    case 'password':
      return <PasswordControl field={field} rhf={rhf} appearance={appearance} />;
    case 'select':
      return <SelectControl field={field} rhf={rhf} appearance={appearance} />;
    case 'combobox':
      return <ComboboxControl field={field} rhf={rhf} appearance={appearance} />;
    case 'radio':
      return <RadioControl field={field} rhf={rhf} appearance={appearance} />;
    case 'date':
      return <DateControl field={field} rhf={rhf} />;
    case 'file':
      return <FileControl field={field} rhf={rhf} appearance={appearance} />;
    case 'number':
      return (
        <Input
          type="number"
          inputMode="decimal"
          placeholder={field.placeholder}
          autoComplete={field.autoComplete}
          disabled={field.disabled}
          required={field.required}
          className={appearance === 'partner' ? PARTNER_CONTROL : PREMIUM_CONTROL}
          name={rhf.name}
          onBlur={rhf.onBlur}
          value={rhf.value === undefined || rhf.value === null ? '' : String(rhf.value)}
          onChange={(e) => rhf.onChange(e.target.value === '' ? undefined : e.target.valueAsNumber)}
        />
      );
    default:
      return (
        <Input
          type={field.type}
          placeholder={field.placeholder}
          autoComplete={field.autoComplete}
          disabled={field.disabled}
          required={field.required}
          className={appearance === 'partner' ? PARTNER_CONTROL : PREMIUM_CONTROL}
          {...textBinding(rhf)}
        />
      );
  }
}

/** Coerces null/undefined to "" so inputs stay controlled. */
function textBinding(rhf: RhfField) {
  return {
    name: rhf.name,
    onBlur: rhf.onBlur,
    value: rhf.value === undefined || rhf.value === null ? '' : String(rhf.value),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      rhf.onChange(e.target.value),
  };
}

function PasswordControl<T extends FieldValues>({
  field,
  rhf,
  appearance,
}: {
  field: TextFieldConfig<T>;
  rhf: RhfField;
  appearance: FieldAppearance;
}) {
  const [show, setShow] = React.useState(false);
  const withToggle = field.showToggle !== false;
  return (
    <div className="relative">
      <Input
        type={show ? 'text' : 'password'}
        placeholder={field.placeholder}
        autoComplete={field.autoComplete}
        disabled={field.disabled}
        required={field.required}
        className={cn(
          appearance === 'partner' ? PARTNER_CONTROL : PREMIUM_CONTROL,
          withToggle && 'pr-11',
        )}
        {...textBinding(rhf)}
      />
      {withToggle ? (
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setShow((s) => !s)}
          aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      ) : null}
    </div>
  );
}

function SelectControl<T extends FieldValues>({
  field,
  rhf,
  appearance,
}: {
  field: ChoiceFieldConfig<T>;
  rhf: RhfField;
  appearance: FieldAppearance;
}) {
  return (
    <Select
      value={rhf.value ? String(rhf.value) : undefined}
      onValueChange={rhf.onChange}
      disabled={field.disabled}
      required={field.required}
    >
      <SelectTrigger className={appearance === 'partner' ? PARTNER_TRIGGER : PREMIUM_TRIGGER}>
        <SelectValue placeholder={field.placeholder ?? 'Chọn...'} />
      </SelectTrigger>
      <SelectContent>
        {field.options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function RadioControl<T extends FieldValues>({
  field,
  rhf,
  appearance,
}: {
  field: ChoiceFieldConfig<T>;
  rhf: RhfField;
  appearance: FieldAppearance;
}) {
  // Segmented: a horizontal button group (register-partner partner-type toggle).
  if (field.variant === 'segmented') {
    if (appearance === 'partner') {
      return (
        <RadioGroup
          value={rhf.value ? String(rhf.value) : undefined}
          onValueChange={rhf.onChange}
          disabled={field.disabled}
          aria-required={field.required}
          className="grid grid-cols-1 gap-2 sm:grid-cols-[240px_240px] sm:gap-4"
        >
          {field.options.map((opt) => (
            <label
              key={opt.value}
              className="flex min-h-14 cursor-pointer items-center gap-3 px-4 text-base font-medium text-[#101828]"
            >
              <RadioGroupItem
                value={opt.value}
                className="size-5 border-[#344054] text-primary data-[state=checked]:border-primary"
              />
              {opt.label}
            </label>
          ))}
        </RadioGroup>
      );
    }

    return (
      <div className="flex gap-3">
        {field.options.map((opt) => {
          const selected = String(rhf.value) === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              disabled={field.disabled}
              onClick={() => rhf.onChange(opt.value)}
              className={cn(SEGMENTED_BASE, selected ? SEGMENTED_ON : SEGMENTED_OFF)}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    );
  }

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
  );
}

function ComboboxControl<T extends FieldValues>({
  field,
  rhf,
  appearance,
}: {
  field: ChoiceFieldConfig<T>;
  rhf: RhfField;
  appearance: FieldAppearance;
}) {
  const [open, setOpen] = React.useState(false);
  const current = field.options.find((o) => o.value === rhf.value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={field.disabled}
          aria-required={field.required}
          className={cn(
            appearance === 'partner' ? PARTNER_TRIGGER : PREMIUM_TRIGGER,
            'justify-between font-normal',
            !current && 'text-muted-foreground',
          )}
        >
          {current?.label ?? field.placeholder ?? 'Chọn...'}
          <ChevronsUpDownIcon className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder={field.searchPlaceholder ?? 'Tìm kiếm...'} />
          <CommandList>
            <CommandEmpty>Không có kết quả.</CommandEmpty>
            <CommandGroup>
              {field.options.map((opt) => (
                <CommandItem
                  key={opt.value}
                  value={opt.label}
                  onSelect={() => {
                    rhf.onChange(opt.value);
                    setOpen(false);
                  }}
                >
                  <CheckIcon
                    className={cn(
                      'mr-2 size-4',
                      opt.value === rhf.value ? 'opacity-100' : 'opacity-0',
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
  );
}

function DateControl<T extends FieldValues>({
  field,
  rhf,
}: {
  field: DateFieldConfig<T>;
  rhf: RhfField;
}) {
  const [open, setOpen] = React.useState(false);
  const value =
    rhf.value instanceof Date ? rhf.value : rhf.value ? new Date(String(rhf.value)) : undefined;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={field.disabled}
          className={cn(
            PREMIUM_TRIGGER,
            'justify-start font-normal',
            !value && 'text-muted-foreground',
          )}
        >
          <CalendarIcon className="mr-2 size-4" />
          {value ? format(value, 'dd/MM/yyyy') : (field.placeholder ?? 'Chọn ngày')}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={(d) => {
            rhf.onChange(d);
            setOpen(false);
          }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}

function FileControl<T extends FieldValues>({
  field,
  rhf,
  appearance,
}: {
  field: FileFieldConfig<T>;
  rhf: RhfField;
  appearance: FieldAppearance;
}) {
  return (
    <ImageUpload
      value={rhf.value as string | string[] | undefined}
      onChange={rhf.onChange}
      multiple={field.multiple}
      target={field.target}
      accept={field.accept}
      maxSizeMb={field.maxSizeMb}
      maxFiles={field.maxFiles}
      presignEndpoint={field.presignEndpoint}
      disabled={field.disabled}
      previewOnly={field.previewOnly}
      variant={field.variant}
      className={appearance === 'partner' ? 'w-full' : undefined}
    />
  );
}

function BooleanField<T extends FieldValues>({
  field,
  control,
  appearance,
}: {
  field: BooleanFieldConfig<T>;
  control: ReturnType<typeof useFormContext<T>>['control'];
  appearance: FieldAppearance;
}) {
  return (
    <FormField
      control={control}
      name={field.name}
      render={({ field: rhf }) => (
        <FormItem
          className={cn(
            'flex flex-row items-start gap-3 space-y-0 rounded-lg border p-4',
            appearance === 'partner' && 'rounded-none border-0 p-0',
          )}
        >
          <FormControl>
            {field.type === 'switch' ? (
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
                required={field.required}
                className={appearance === 'partner' ? 'mt-0.5 size-5 border-[#344054]' : undefined}
              />
            )}
          </FormControl>
          <div className="space-y-1 leading-none">
            {field.label ? (
              <FormLabel
                className={cn(
                  'font-medium',
                  appearance === 'partner' && 'text-base font-normal leading-6 text-[#344054]',
                )}
              >
                {field.label}
              </FormLabel>
            ) : null}
            {field.description ? <FormDescription>{field.description}</FormDescription> : null}
            <FieldMessage />
          </div>
        </FormItem>
      )}
    />
  );
}
