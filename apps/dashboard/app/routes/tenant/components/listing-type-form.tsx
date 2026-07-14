import { useState } from 'react';
import { useNavigation, useSubmit } from 'react-router';
import { Plus, X } from 'lucide-react';
import type { AttributeFieldType, BookingMode, ListingTypeResponse } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Checkbox } from '@booking/ui/components/ui/checkbox';
import { Input } from '@booking/ui/components/ui/input';
import { Switch } from '@booking/ui/components/ui/switch';
import { ImageUpload, FAVICON_ACCEPT } from '@booking/ui/components/form/image-upload';
import { Section, Grid, Field } from '~/components/form-layout';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@booking/ui/components/ui/select';

const ALL_MODES: BookingMode[] = ['hourly', 'daily', 'inventory', 'appointment', 'class'];
const MODE_LABEL: Record<BookingMode, string> = {
  hourly: 'Theo giờ',
  daily: 'Theo ngày',
  inventory: 'Theo kho',
  appointment: 'Lịch hẹn',
  class: 'Lớp học',
};
const FIELD_TYPES: { value: AttributeFieldType; label: string }[] = [
  { value: 'text', label: 'Văn bản' },
  { value: 'number', label: 'Số' },
  { value: 'select', label: 'Chọn một' },
  { value: 'multiselect', label: 'Chọn nhiều' },
  { value: 'boolean', label: 'Có/Không' },
];

interface AttrRow {
  key: string;
  label: string;
  type: AttributeFieldType;
  required: boolean;
  filterable: boolean;
  options: string; // comma-separated in the editor
}

interface FormState {
  name: string;
  slug: string;
  icon: string;
  unitLabel: string;
  allowedModes: BookingMode[];
  defaultModes: BookingMode[];
  sortOrder: string;
  isActive: boolean;
  requiresIdentityVerification: boolean;
  attributes: AttrRow[];
}

function initialState(t?: ListingTypeResponse): FormState {
  return {
    name: t?.name ?? '',
    slug: t?.slug ?? '',
    icon: t?.icon ?? '',
    unitLabel: t?.unitLabel ?? '',
    allowedModes: t?.allowedModes ?? ['hourly'],
    defaultModes: t?.defaultModes ?? [],
    sortOrder: String(t?.sortOrder ?? 0),
    isActive: t?.isActive ?? true,
    requiresIdentityVerification: t?.requiresIdentityVerification ?? false,
    attributes: (t?.attributeSchema ?? []).map((f) => ({
      key: f.key,
      label: f.label,
      type: f.type,
      required: f.required,
      filterable: f.filterable,
      options: (f.options ?? []).join(', '),
    })),
  };
}

export function ListingTypeForm({
  listingType,
  serverError,
  fieldErrors,
}: {
  listingType?: ListingTypeResponse;
  serverError?: string | null;
  fieldErrors?: Record<string, string[]> | null;
}) {
  const submit = useSubmit();
  const navigation = useNavigation();
  const saving = navigation.state !== 'idle';
  const isEdit = Boolean(listingType);
  const [state, setState] = useState<FormState>(() => initialState(listingType));

  const set = <K extends keyof FormState>(key: K, value: FormState[K]): void =>
    setState((s) => ({ ...s, [key]: value }));

  function toggleMode(field: 'allowedModes' | 'defaultModes', mode: BookingMode, on: boolean): void {
    setState((s) => {
      const next = on ? [...s[field], mode] : s[field].filter((m) => m !== mode);
      // Keep defaultModes a subset of allowedModes.
      if (field === 'allowedModes' && !on) {
        return { ...s, allowedModes: next, defaultModes: s.defaultModes.filter((m) => m !== mode) };
      }
      return { ...s, [field]: next };
    });
  }

  function updateAttr(i: number, patch: Partial<AttrRow>): void {
    setState((s) => ({ ...s, attributes: s.attributes.map((a, idx) => (idx === i ? { ...a, ...patch } : a)) }));
  }

  function handleSubmit(): void {
    const attributeSchema = state.attributes.map((a) => {
      const isChoice = a.type === 'select' || a.type === 'multiselect';
      return {
        key: a.key.trim(),
        label: a.label.trim(),
        type: a.type,
        required: a.required,
        filterable: a.filterable,
        ...(isChoice
          ? { options: a.options.split(',').map((o) => o.trim()).filter(Boolean) }
          : {}),
      };
    });
    const payload: Record<string, unknown> = {
      name: state.name.trim(),
      slug: state.slug.trim(),
      icon: state.icon.trim() || undefined,
      unitLabel: state.unitLabel.trim() || undefined,
      allowedModes: state.allowedModes,
      defaultModes: state.defaultModes,
      sortOrder: Math.max(0, Math.round(Number(state.sortOrder) || 0)),
      isActive: state.isActive,
      requiresIdentityVerification: state.requiresIdentityVerification,
      attributeSchema,
    };
    submit(payload as never, { method: 'post', encType: 'application/json' });
  }

  return (
    <div className="max-w-2xl space-y-6">
      {serverError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {serverError}
        </div>
      ) : null}

      <Section title="Thông tin">
        <Grid>
          <Field label="Tên loại" error={fieldErrors?.name}>
            <Input value={state.name} onChange={(e) => set('name', e.target.value)} placeholder="VD: Studio" />
          </Field>
          <Field label="Slug" error={fieldErrors?.slug}>
            <Input value={state.slug} onChange={(e) => set('slug', e.target.value)} placeholder="studio" />
          </Field>
          <Field label="Biểu tượng (tuỳ chọn)">
            <ImageUpload
              value={state.icon}
              onChange={(v) => set('icon', typeof v === 'string' ? v : (v[0] ?? ''))}
              target="tenants"
              accept={FAVICON_ACCEPT}
              maxSizeMb={2}
            />
          </Field>
          <Field label="Đơn vị giá (tuỳ chọn)">
            <Input value={state.unitLabel} onChange={(e) => set('unitLabel', e.target.value)} placeholder="giờ" />
          </Field>
          <Field label="Thứ tự hiển thị">
            <Input type="number" min={0} value={state.sortOrder} onChange={(e) => set('sortOrder', e.target.value)} />
          </Field>
        </Grid>
        <div className="flex flex-wrap gap-6 pt-1">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={state.isActive} onCheckedChange={(v) => set('isActive', v)} /> Đang hoạt động
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={state.requiresIdentityVerification}
              onCheckedChange={(v) => set('requiresIdentityVerification', v)}
            />
            Yêu cầu xác minh danh tính
          </label>
        </div>
      </Section>

      <Section title="Hình thức đặt cho phép">
        <div className="flex flex-wrap gap-4">
          {ALL_MODES.map((m) => (
            <label key={m} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={state.allowedModes.includes(m)}
                onCheckedChange={(v) => toggleMode('allowedModes', m, v === true)}
              />
              {MODE_LABEL[m]}
            </label>
          ))}
        </div>
        {fieldErrors?.allowedModes ? <p className="text-xs text-destructive">{fieldErrors.allowedModes[0]}</p> : null}
        <p className="pt-2 text-xs font-medium text-muted-foreground">Bật sẵn khi tạo listing:</p>
        <div className="flex flex-wrap gap-4">
          {state.allowedModes.map((m) => (
            <label key={m} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={state.defaultModes.includes(m)}
                onCheckedChange={(v) => toggleMode('defaultModes', m, v === true)}
              />
              {MODE_LABEL[m]}
            </label>
          ))}
        </div>
      </Section>

      <Section title="Thuộc tính tuỳ biến">
        <p className="text-xs text-muted-foreground">
          Các trường sẽ hiện khi đối tác tạo listing thuộc loại này. Trường “lọc được” trở thành bộ lọc trên storefront.
        </p>
        {fieldErrors?.attributeSchema ? (
          <p className="text-xs text-destructive">{fieldErrors.attributeSchema[0]}</p>
        ) : null}
        <div className="space-y-3">
          {state.attributes.map((a, i) => {
            const isChoice = a.type === 'select' || a.type === 'multiselect';
            return (
              <div key={i} className="space-y-3 rounded-md border p-3">
                <div className="flex items-start gap-2">
                  <div className="grid flex-1 gap-3 sm:grid-cols-2">
                    <Field label="Khoá (key)">
                      <Input value={a.key} onChange={(e) => updateAttr(i, { key: e.target.value })} placeholder="area" />
                    </Field>
                    <Field label="Nhãn">
                      <Input value={a.label} onChange={(e) => updateAttr(i, { label: e.target.value })} placeholder="Diện tích" />
                    </Field>
                    <Field label="Kiểu">
                      <Select value={a.type} onValueChange={(v) => updateAttr(i, { type: v as AttributeFieldType })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {FIELD_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    {isChoice ? (
                      <Field label="Tuỳ chọn (phân tách bằng dấu phẩy)">
                        <Input value={a.options} onChange={(e) => updateAttr(i, { options: e.target.value })} placeholder="Hàn Quốc, Vintage" />
                      </Field>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => set('attributes', state.attributes.filter((_, idx) => idx !== i))}
                    aria-label="Xoá trường"
                  >
                    <X className="size-4" />
                  </Button>
                </div>
                <div className="flex gap-6">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={a.required} onCheckedChange={(v) => updateAttr(i, { required: v === true })} /> Bắt buộc
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={a.filterable} onCheckedChange={(v) => updateAttr(i, { filterable: v === true })} /> Lọc được
                  </label>
                </div>
              </div>
            );
          })}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            set('attributes', [
              ...state.attributes,
              { key: '', label: '', type: 'text', required: false, filterable: false, options: '' },
            ])
          }
        >
          <Plus className="size-4" /> Thêm thuộc tính
        </Button>
      </Section>

      <div className="flex justify-end">
        <Button type="button" onClick={handleSubmit} disabled={saving}>
          {saving ? 'Đang lưu…' : isEdit ? 'Lưu thay đổi' : 'Tạo loại dịch vụ'}
        </Button>
      </div>
    </div>
  );
}

