import type { AttributeField } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Checkbox } from '@booking/ui/components/ui/checkbox';
import { Input } from '@booking/ui/components/ui/input';
import { Switch } from '@booking/ui/components/ui/switch';
import { X } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@booking/ui/components/ui/select';
import { Field } from '~/components/form-layout';

/** One dynamic listing-type attribute rendered as its declared control. */
export function AttributeInput({
  field,
  value,
  onChange,
}: {
  field: AttributeField;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  if (field.type === 'boolean') {
    return (
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={value === true} onCheckedChange={(v) => onChange(v)} />
        {field.label}
      </label>
    );
  }
  if (field.type === 'select') {
    return (
      <Field label={field.label}>
        <Select value={typeof value === 'string' ? value : ''} onValueChange={onChange}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    );
  }
  if (field.type === 'multiselect') {
    const selected = Array.isArray(value) ? (value as string[]) : [];
    return (
      <Field label={field.label}>
        <div className="flex flex-wrap gap-3">
          {(field.options ?? []).map((o) => (
            <label key={o} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={selected.includes(o)}
                onCheckedChange={(v) =>
                  onChange(v === true ? [...selected, o] : selected.filter((x) => x !== o))
                }
              />
              {o}
            </label>
          ))}
        </div>
      </Field>
    );
  }
  if (field.type === 'list') {
    // A descriptive bullet list (string[]). Always show one trailing empty input
    // to type into; `commit` drops blanks so stored state never carries an empty
    // line (which the server would reject).
    const lines = Array.isArray(value)
      ? (value as unknown[]).filter((v): v is string => typeof v === 'string')
      : [];
    const rows = [...lines, ''];
    const commit = (next: string[]) => onChange(next.filter((line) => line.trim() !== ''));
    return (
      <Field label={field.label}>
        <div className="space-y-2">
          {rows.map((line, i) => (
            <div key={i} className="flex gap-2">
              <Input
                value={line}
                placeholder={i === rows.length - 1 ? 'Thêm dòng…' : undefined}
                onChange={(e) => {
                  const next = [...rows];
                  next[i] = e.target.value;
                  commit(next);
                }}
              />
              {i < rows.length - 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => commit(rows.filter((_, x) => x !== i))}
                  aria-label="Xoá dòng"
                >
                  <X className="size-4" />
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      </Field>
    );
  }
  return (
    <Field label={field.label}>
      <Input
        type={field.type === 'number' ? 'number' : 'text'}
        value={value === undefined || value === null ? '' : String(value)}
        onChange={(e) =>
          onChange(field.type === 'number' ? Number(e.target.value) : e.target.value)
        }
      />
    </Field>
  );
}
