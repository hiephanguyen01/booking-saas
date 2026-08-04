'use client';

import { format } from 'date-fns';
import {
  AlertCircle,
  CalendarIcon,
  CheckIcon,
  ChevronsUpDownIcon,
  Eye,
  EyeOff,
  Pipette,
} from 'lucide-react';
import * as React from 'react';
import { useFormContext, type FieldValues } from 'react-hook-form';
import { HexColorPicker } from 'react-colorful';

import { ImageUpload } from '@booking/ui/components/form/image-upload';
import type {
  BooleanFieldConfig,
  ChoiceFieldConfig,
  ColorFieldConfig,
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
 * `radio` + `variant: "segmented"`: a button group, so it carries its own chrome.
 *
 * These are raw `<button>` elements, not the `Button` primitive — the selected /
 * unselected states below own the border, background and text colour outright,
 * which no `Button` variant expresses. So the 44px control height is written out
 * here rather than inherited from `size="control"`; keep it in step with the
 * `Input` beside it.
 */
/**
 * A segmented control shows which option is *selected* — it is not the form's
 * action. Filling the selected segment with `--primary` made it outrank the
 * submit button beside it (a settings screen with three of these read as three
 * competing CTAs), so the selection is carried by an elevated card-coloured pill
 * on a muted track, the way a segmented control conventionally reads.
 */
// Capped: a two-option control stretched to a full form column reads as a pair of
// banners rather than one control, and the hit areas grow far past what they need.
const SEGMENTED_TRACK = 'flex w-full max-w-md gap-1 rounded-lg bg-muted p-1';
// `h-11` still, not the shorter pill the muted track invites: this is a form
// control and every form control in this product is a 44px touch target.
const SEGMENTED_BASE =
  'flex h-11 flex-1 items-center justify-center rounded-md px-4 text-sm font-medium outline-none transition-all focus-visible:ring-[3px] focus-visible:ring-ring/50';
const SEGMENTED_ON = 'bg-background text-foreground shadow-sm ring-1 ring-border font-semibold';
const SEGMENTED_OFF = 'text-muted-foreground hover:text-foreground';

/**
 * Renders a single field from its config, bound to react-hook-form. Boolean and
 * date types get their own inline layout; everything else uses the standard
 * label / control / message stack.
 */
export function FieldRenderer<T extends FieldValues>({ field }: { field: FieldConfig<T> }) {
  const { control } = useFormContext<T>();

  if (field.type === 'checkbox' || field.type === 'switch') {
    return <BooleanField field={field} control={control} />;
  }

  if (field.type === 'color') {
    return <ColorField field={field} control={control} />;
  }

  return (
    <FormField
      control={control}
      name={field.name}
      render={({ field: rhf }) => (
        <FormItem>
          {field.label ? (
            <FormLabel>
              {field.label}
              {field.required ? (
                <span aria-hidden="true" className="mr-1 text-destructive">
                  *
                </span>
              ) : null}
            </FormLabel>
          ) : null}
          <FormControl>{renderControl(field, rhf)}</FormControl>
          {field.description ? <FormDescription>{field.description}</FormDescription> : null}
          <FieldMessage />
        </FormItem>
      )}
    />
  );
}

/** Inline error row (AlertCircle + destructive text) below a field's control. */
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
): React.ReactElement {
  switch (field.type) {
    case 'textarea':
      return (
        <Textarea
          placeholder={field.placeholder}
          rows={(field as TextFieldConfig<T>).rows}
          disabled={field.disabled}
          required={field.required}
          {...textBinding(rhf)}
        />
      );
    case 'password':
      return <PasswordControl field={field} rhf={rhf} />;
    case 'select':
      return <SelectControl field={field} rhf={rhf} />;
    case 'combobox':
      return <ComboboxControl field={field} rhf={rhf} />;
    case 'radio':
      return <RadioControl field={field} rhf={rhf} />;
    case 'date':
      return <DateControl field={field} rhf={rhf} />;
    case 'file':
      return <FileControl field={field} rhf={rhf} />;
    case 'number':
      return (
        <Input
          type="number"
          inputMode="decimal"
          placeholder={field.placeholder}
          autoComplete={field.autoComplete}
          disabled={field.disabled}
          required={field.required}
          min={field.min}
          max={field.max}
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
}: {
  field: TextFieldConfig<T>;
  rhf: RhfField;
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
        className={withToggle ? 'pr-11' : undefined}
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
}: {
  field: ChoiceFieldConfig<T>;
  rhf: RhfField;
}) {
  return (
    <Select
      value={rhf.value ? String(rhf.value) : undefined}
      onValueChange={rhf.onChange}
      disabled={field.disabled}
      required={field.required}
    >
      <SelectTrigger className="w-full">
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
}: {
  field: ChoiceFieldConfig<T>;
  rhf: RhfField;
}) {
  // Segmented: a horizontal button group (register-partner partner-type toggle).
  if (field.variant === 'segmented') {
    return (
      <div className={SEGMENTED_TRACK}>
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
        // The whole row is the tap target, so it takes the control's touch height.
        <label key={opt.value} className="flex min-h-11 items-center gap-2 text-sm font-normal">
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
}: {
  field: ChoiceFieldConfig<T>;
  rhf: RhfField;
}) {
  const [open, setOpen] = React.useState(false);
  const current = field.options.find((o) => o.value === rhf.value);
  return (
    <div className="w-full">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="control"
            role="combobox"
            aria-expanded={open}
            disabled={field.disabled}
            aria-required={field.required}
            className={cn(
              'w-full justify-between font-normal hover:bg-primary/10 hover:text-primary active:bg-primary active:text-primary-foreground data-[state=open]:bg-primary data-[state=open]:text-primary-foreground data-[state=open]:hover:bg-primary data-[state=open]:hover:text-primary-foreground dark:hover:bg-primary/10 dark:hover:text-primary',
              !current && 'text-muted-foreground',
            )}
          >
            <span className="truncate">{current?.label ?? field.placeholder ?? 'Chọn...'}</span>
            <ChevronsUpDownIcon className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] max-w-[var(--radix-popover-content-available-width)] p-0"
          align="start"
        >
          <Command>
            <CommandInput placeholder={field.searchPlaceholder ?? 'Tìm kiếm...'} />
            <CommandList>
              <CommandEmpty>Không có kết quả.</CommandEmpty>
              <CommandGroup>
                {field.options.map((opt) => {
                  const selected = opt.value === rhf.value;
                  return (
                    <CommandItem
                      key={opt.value}
                      value={opt.label}
                      className={cn(
                        'data-[selected=true]:bg-primary/10 data-[selected=true]:text-primary',
                        selected &&
                          'bg-primary text-primary-foreground data-[selected=true]:bg-primary data-[selected=true]:text-primary-foreground',
                      )}
                      onSelect={() => {
                        rhf.onChange(opt.value);
                        setOpen(false);
                      }}
                    >
                      <CheckIcon
                        className={cn(
                          'mr-2 size-4',
                          selected
                            ? 'text-primary-foreground opacity-100'
                            : 'text-primary opacity-0',
                        )}
                      />
                      {opt.label}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
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
          size="control"
          disabled={field.disabled}
          className={cn('w-full justify-start font-normal', !value && 'text-muted-foreground')}
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
}: {
  field: FileFieldConfig<T>;
  rhf: RhfField;
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
      reorderable={field.reorderable}
      presignEndpoint={field.presignEndpoint}
      disabled={field.disabled}
      variant={field.variant}
    />
  );
}

const DEFAULT_COLOR_PRESETS = [
  '#0f172a',
  '#1d4ed8',
  '#0f766e',
  '#7c3aed',
  '#be123c',
  '#c2410c',
];

function normalizeHex(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  return /^#[\da-f]{6}$/i.test(withHash) ? withHash.toLowerCase() : null;
}

function ColorField<T extends FieldValues>({
  field,
  control,
}: {
  field: ColorFieldConfig<T>;
  control: ReturnType<typeof useFormContext<T>>['control'];
}) {
  const presets = field.presets?.length ? field.presets : DEFAULT_COLOR_PRESETS;

  return (
    <FormField
      control={control}
      name={field.name}
      render={({ field: rhf }) => {
        const currentHex = normalizeHex(rhf.value);
        const pickerColor = currentHex ?? normalizeHex(presets[0]) ?? '#0f172a';

        return (
          <FormItem>
            {field.label ? <FormLabel>{field.label}</FormLabel> : null}
            <div className="flex gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={field.disabled}
                    aria-label={`Mở bảng chọn ${field.label?.toLocaleLowerCase('vi') ?? 'màu'}`}
                    className="size-11 shrink-0 p-1.5"
                  >
                    {currentHex ? (
                      <span
                        className="size-full rounded-sm border border-black/10 shadow-inner dark:border-white/15"
                        style={{ backgroundColor: currentHex }}
                      />
                    ) : (
                      <Pipette className="size-4 text-muted-foreground" />
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-72 space-y-4 p-3">
                  <HexColorPicker
                    color={pickerColor}
                    onChange={rhf.onChange}
                    aria-label={`Chọn ${field.label?.toLocaleLowerCase('vi') ?? 'màu'}`}
                    className="!h-44 !w-full"
                  />
                  <div>
                    <p className="mb-2 text-xs font-medium text-muted-foreground">Màu gợi ý</p>
                    <div className="grid grid-cols-6 gap-2" role="group" aria-label="Màu gợi ý">
                      {presets.map((preset) => {
                        const normalized = normalizeHex(preset);
                        if (!normalized) return null;
                        const selected = normalized === currentHex;
                        return (
                          <button
                            key={normalized}
                            type="button"
                            aria-label={`Chọn màu ${normalized}`}
                            aria-pressed={selected}
                            disabled={field.disabled}
                            onClick={() => rhf.onChange(normalized)}
                            className="aspect-square rounded-md border border-black/10 shadow-sm outline-none transition-transform hover:scale-105 active:scale-95 focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:border-white/15"
                            style={{ backgroundColor: normalized }}
                          >
                            <span className="sr-only">{normalized}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={field.disabled || !rhf.value}
                    onClick={() => rhf.onChange('')}
                    className="w-full text-muted-foreground"
                  >
                    Dùng màu mặc định
                  </Button>
                </PopoverContent>
              </Popover>
              <FormControl>
                <Input
                  type="text"
                  placeholder={field.placeholder ?? '#000000'}
                  autoComplete="off"
                  disabled={field.disabled}
                  required={field.required}
                  className="font-mono uppercase"
                  {...textBinding(rhf)}
                />
              </FormControl>
            </div>
            {field.description ? <FormDescription>{field.description}</FormDescription> : null}
            <FieldMessage />
          </FormItem>
        );
      }}
    />
  );
}

function BooleanField<T extends FieldValues>({
  field,
  control,
}: {
  field: BooleanFieldConfig<T>;
  control: ReturnType<typeof useFormContext<T>>['control'];
}) {
  return (
    <FormField
      control={control}
      name={field.name}
      render={({ field: rhf }) => (
        <FormItem className="flex flex-row items-start gap-3 space-y-0 rounded-lg border p-4">
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
              />
            )}
          </FormControl>
          <div className="space-y-1 leading-none">
            {field.label ? <FormLabel>{field.label}</FormLabel> : null}
            {field.description ? <FormDescription>{field.description}</FormDescription> : null}
            <FieldMessage />
          </div>
        </FormItem>
      )}
    />
  );
}
