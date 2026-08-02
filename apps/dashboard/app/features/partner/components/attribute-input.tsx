import type { AttributeField } from '@booking/contracts';
import {
  SortableCollection,
  SortableHandle,
  SortableItem,
} from '@booking/ui/components/form/sortable-collection';
import { Button } from '@booking/ui/components/ui/button';
import { Checkbox } from '@booking/ui/components/ui/checkbox';
import { Input } from '@booking/ui/components/ui/input';
import { Switch } from '@booking/ui/components/ui/switch';
import { CirclePlus } from 'lucide-react';
import * as React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@booking/ui/components/ui/select';
import { Field } from '~/components/form-layout';
import { ListingTypeIcon } from '~/components/listing-type-icon';

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
  // The attribute schema carries its own glyph (same allowlist as the listing
  // type's icon); label it here exactly as the storefront spec cards do.
  const icon = field.icon ? <ListingTypeIcon name={field.icon} className="size-4" /> : null;

  if (field.type === 'boolean') {
    return (
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={value === true} onCheckedChange={(v) => onChange(v)} />
        {icon ? <span className="text-muted-foreground">{icon}</span> : null}
        {field.label}
      </label>
    );
  }
  if (field.type === 'select') {
    return (
      <Field label={field.label} icon={icon}>
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
      <Field label={field.label} icon={icon}>
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
    return (
      <SortableListAttribute label={field.label} icon={icon} value={value} onChange={onChange} />
    );
  }
  return (
    <Field label={field.label} icon={icon}>
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

interface EditableListRow {
  id: string;
  value: string;
}

function SortableListAttribute({
  label,
  icon,
  value,
  onChange,
}: {
  label: string;
  icon?: React.ReactNode;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const externalLines = React.useMemo(
    () =>
      Array.isArray(value) ? value.filter((line): line is string => typeof line === 'string') : [],
    [value],
  );
  const externalSignature = JSON.stringify(externalLines);
  const idSeed = React.useId();
  const nextId = React.useRef(0);
  const inputRefs = React.useRef(new Map<string, HTMLInputElement>());
  const lastEmitted = React.useRef(externalSignature);
  const createId = React.useCallback(() => `${idSeed}-list-row-${nextId.current++}`, [idSeed]);
  const [rows, setRows] = React.useState<EditableListRow[]>(() =>
    externalLines.map((line) => ({ id: createId(), value: line })),
  );

  React.useEffect(() => {
    if (externalSignature === lastEmitted.current) return;
    lastEmitted.current = externalSignature;
    setRows((current) =>
      externalLines.map((line, index) =>
        current[index]?.value === line ? current[index] : { id: createId(), value: line },
      ),
    );
  }, [createId, externalLines, externalSignature]);

  const emit = (nextRows: EditableListRow[]) => {
    const nextValue = nextRows.map((row) => row.value).filter((line) => line.trim() !== '');
    lastEmitted.current = JSON.stringify(nextValue);
    onChange(nextValue);
  };

  const update = (index: number, nextValue: string) => {
    const nextRows = rows.map((row, current) =>
      current === index ? { ...row, value: nextValue } : row,
    );
    setRows(nextRows);
    emit(nextRows);
  };

  const remove = (index: number) => {
    const nextRows = rows.filter((_, current) => current !== index);
    setRows(nextRows);
    emit(nextRows);
  };

  const move = (fromIndex: number, toIndex: number) => {
    const nextRows = [...rows];
    const [row] = nextRows.splice(fromIndex, 1);
    if (!row) return;
    nextRows.splice(toIndex, 0, row);
    setRows(nextRows);
    emit(nextRows);
  };

  const add = () => {
    const emptyRow = rows.find((row) => row.value.trim() === '');
    if (emptyRow) {
      inputRefs.current.get(emptyRow.id)?.focus();
      return;
    }

    const row = { id: createId(), value: '' };
    setRows([...rows, row]);
    window.requestAnimationFrame(() => inputRefs.current.get(row.id)?.focus());
  };

  return (
    <Field label={label} icon={icon}>
      <div className="space-y-2">
        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-muted/20 px-4 py-3 text-xs leading-5 text-muted-foreground">
            Chưa có {label.toLocaleLowerCase('vi')}. Chỉ thêm những thông tin giúp khách đưa ra
            quyết định.
          </div>
        ) : null}
        <SortableCollection onMove={move} announcementLabel="Giá trị">
          <div className="space-y-2">
            {rows.map((row, index) => (
              <SortableItem key={row.id} id={row.id} index={index} disabled={rows.length < 2}>
                {({ itemRef, handleRef, isDragging }) => (
                  <div
                    ref={itemRef}
                    className={[
                      'grid min-w-0 grid-cols-[2rem_2.75rem_minmax(0,1fr)_auto] items-center gap-2 rounded-xl transition',
                      isDragging ? 'z-10 opacity-45 ring-2 ring-primary/40' : '',
                    ].join(' ')}
                  >
                    <span className="text-center text-sm tabular-nums text-muted-foreground">
                      #{index + 1}
                    </span>
                    <SortableHandle
                      ref={handleRef}
                      label={`Kéo để sắp xếp giá trị ${index + 1}`}
                      disabled={rows.length < 2}
                      className="border bg-muted/30"
                    />
                    <Input
                      ref={(element) => {
                        if (element) inputRefs.current.set(row.id, element);
                        else inputRefs.current.delete(row.id);
                      }}
                      value={row.value}
                      placeholder="Nhập giá trị"
                      aria-label={`${label} ${index + 1}`}
                      className="min-w-0 rounded-xl"
                      onChange={(event) => update(index, event.target.value)}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="control"
                      onClick={() => remove(index)}
                      aria-label={`Xóa giá trị ${index + 1}`}
                      className="rounded-xl px-4"
                    >
                      Xóa
                    </Button>
                  </div>
                )}
              </SortableItem>
            ))}
          </div>
        </SortableCollection>

        <Button type="button" variant="ghost" size="sm" onClick={add} className="px-1">
          <CirclePlus className="size-4" />
          Thêm giá trị
        </Button>
      </div>
    </Field>
  );
}
