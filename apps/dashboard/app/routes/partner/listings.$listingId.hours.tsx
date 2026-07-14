import { useState } from 'react';
import { data, Form, Link, useNavigation } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import {
  setAvailabilityRulesInputSchema,
  type AvailabilityRuleResponse,
  type ListingResponse,
} from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Input } from '@booking/ui/components/ui/input';
import { Switch } from '@booking/ui/components/ui/switch';
import type { Route } from './+types/listings.$listingId.hours';
import { apiGet, apiPut } from '~/lib/api.server';
import { requirePartner, canPartner } from './partner.server';
import { PageHeader } from './components/page-header';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Giờ mở cửa · Đối tác · Bookify' }];
}

// Display order Mon…Sun; `dow` is the backend's 0=Sun…6=Sat value.
const DAYS: { dow: number; label: string }[] = [
  { dow: 1, label: 'Thứ 2' },
  { dow: 2, label: 'Thứ 3' },
  { dow: 3, label: 'Thứ 4' },
  { dow: 4, label: 'Thứ 5' },
  { dow: 5, label: 'Thứ 6' },
  { dow: 6, label: 'Thứ 7' },
  { dow: 0, label: 'Chủ nhật' },
];

const DEFAULT_OPEN = '08:00';
const DEFAULT_CLOSE = '20:00';

export async function loader({ request, params }: Route.LoaderArgs) {
  const { auth, membership } = await requirePartner(request);
  if (!canPartner(membership, 'partner.availability.manage')) {
    throw new Response('Không có quyền quản lý lịch.', { status: 403 });
  }
  const id = params.listingId;
  // Own-listings list also enforces ownership: a listing not in it → 404.
  const listingsRes = await apiGet<ListingResponse[]>('/partner/listings', auth);
  const listing = (listingsRes.data ?? []).find((l) => l.id === id);
  if (!listing) throw new Response('Không tìm thấy tin đăng.', { status: 404 });

  const rulesRes = await apiGet<AvailabilityRuleResponse[]>(
    `/partner/listings/${id}/availability-rules`,
    auth,
  );
  return {
    listing: { id: listing.id, title: listing.title, groupId: listing.groupId },
    rules: rulesRes.ok && rulesRes.data ? rulesRes.data : [],
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { auth, membership } = await requirePartner(request);
  if (!canPartner(membership, 'partner.availability.manage')) {
    return data({ ok: false, error: 'Không có quyền quản lý lịch.' }, { status: 403 });
  }
  const form = await request.formData();

  const rules = DAYS.filter((d) => form.get(`enabled_${d.dow}`) === 'on').map((d) => ({
    dayOfWeek: d.dow,
    openTime: String(form.get(`open_${d.dow}`) ?? DEFAULT_OPEN),
    closeTime: String(form.get(`close_${d.dow}`) ?? DEFAULT_CLOSE),
  }));

  const parsed = setAvailabilityRulesInputSchema.safeParse({ rules });
  if (!parsed.success) {
    return data(
      { ok: false, error: 'Giờ mở cửa không hợp lệ (giờ đóng phải sau giờ mở).' },
      { status: 400 },
    );
  }
  const res = await apiPut(`/partner/listings/${params.listingId}/availability-rules`, parsed.data, auth);
  return res.ok
    ? data({ ok: true, error: null })
    : data({ ok: false, error: res.error ?? 'Lưu không thành công.' }, { status: 400 });
}

interface DayState {
  enabled: boolean;
  open: string;
  close: string;
}

export default function ListingHoursPage({ loaderData, actionData }: Route.ComponentProps) {
  const { listing, rules } = loaderData;
  const navigation = useNavigation();
  const saving = navigation.state !== 'idle';

  // Seed each weekday from its first existing rule (a listing may store several
  // windows/day; the editor manages one contiguous window per day).
  const [days, setDays] = useState<Record<number, DayState>>(() => {
    const seed: Record<number, DayState> = {};
    for (const d of DAYS) {
      const rule = rules.find((r) => r.dayOfWeek === d.dow);
      seed[d.dow] = rule
        ? { enabled: true, open: rule.openTime, close: rule.closeTime }
        : { enabled: false, open: DEFAULT_OPEN, close: DEFAULT_CLOSE };
    }
    return seed;
  });

  const update = (dow: number, patch: Partial<DayState>): void =>
    setDays((prev) => ({ ...prev, [dow]: { ...prev[dow], ...patch } }));

  return (
    <div className="space-y-5">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
          <Link to={listing.groupId ? `/partner/listing-groups/${listing.groupId}` : '/partner/listings'}>
            <ArrowLeft className="size-4" aria-hidden /> Tin đăng
          </Link>
        </Button>
        <PageHeader
          title="Giờ mở cửa"
          description={`Lịch mở cửa hằng tuần cho “${listing.title}”. Cần thiết để tạo khung giờ cho đặt theo giờ.`}
        />
      </div>

      {actionData?.ok ? (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
          Đã lưu giờ mở cửa.
        </div>
      ) : actionData?.error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {actionData.error}
        </div>
      ) : null}

      <Form method="post" className="space-y-3">
        {DAYS.map((d) => {
          const state = days[d.dow];
          return (
            <div
              key={d.dow}
              className="flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3"
            >
              <div className="flex w-28 items-center gap-2">
                <Switch
                  checked={state.enabled}
                  onCheckedChange={(v) => update(d.dow, { enabled: v })}
                  aria-label={`Bật ${d.label}`}
                />
                <span className="text-sm font-medium">{d.label}</span>
              </div>
              {/* Persist the toggle for the plain form POST. */}
              {state.enabled ? <input type="hidden" name={`enabled_${d.dow}`} value="on" /> : null}

              <div className="flex items-center gap-2 text-sm">
                <Input
                  type="time"
                  name={`open_${d.dow}`}
                  value={state.open}
                  disabled={!state.enabled}
                  onChange={(e) => update(d.dow, { open: e.target.value })}
                  className="w-32"
                />
                <span className="text-muted-foreground">→</span>
                <Input
                  type="time"
                  name={`close_${d.dow}`}
                  value={state.close}
                  disabled={!state.enabled}
                  onChange={(e) => update(d.dow, { close: e.target.value })}
                  className="w-32"
                />
              </div>
              {state.enabled && state.open >= state.close ? (
                <span className="text-xs text-destructive">Giờ đóng phải sau giờ mở</span>
              ) : null}
            </div>
          );
        })}

        <div className="flex justify-end pt-1">
          <Button type="submit" disabled={saving}>
            {saving ? 'Đang lưu…' : 'Lưu giờ mở cửa'}
          </Button>
        </div>
      </Form>
    </div>
  );
}
