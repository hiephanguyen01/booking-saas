import { useState } from 'react';
import { data, Form, Link, useNavigation } from 'react-router';
import { ArrowLeft, Plus, X } from 'lucide-react';
import {
  setAvailabilityRulesInputSchema,
  type AvailabilityRuleResponse,
  type ListingResponse,
} from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Input } from '@booking/ui/components/ui/input';
import { Switch } from '@booking/ui/components/ui/switch';
import type { Route } from './+types/hours';
import { apiGet, apiPut } from '~/lib/api.server';
import { requirePartner, canPartner } from '../partner.server';
import { PageHeader } from '~/components/page-header';
import {
  DAYS,
  DEFAULT_CLOSE,
  DEFAULT_OPEN,
  WINDOW_FIELD,
  decodeWindows,
  encodeWindow,
  isValidWindow,
  overlappingIndices,
  seedWeek,
  validateWeek,
  type HoursWindow,
  type WeekWindows,
} from '../listing-hours';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Giờ mở cửa · Đối tác · Bookify' }];
}

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

  // Every window of every open weekday — a day may legitimately have several.
  const rules = decodeWindows(form.getAll(WINDOW_FIELD).map(String));

  const parsed = setAvailabilityRulesInputSchema.safeParse({ rules });
  if (!parsed.success) {
    return data(
      { ok: false, error: 'Giờ mở cửa không hợp lệ (giờ đóng phải sau giờ mở).' },
      { status: 400 },
    );
  }
  const res = await apiPut(
    `/partner/listings/${params.listingId}/availability-rules`,
    parsed.data,
    auth,
  );
  return res.ok
    ? data({ ok: true, error: null })
    : data({ ok: false, error: res.error ?? 'Lưu không thành công.' }, { status: 400 });
}

export default function ListingHoursPage({ loaderData, actionData }: Route.ComponentProps) {
  const { listing, rules } = loaderData;
  const navigation = useNavigation();
  const saving = navigation.state !== 'idle';

  // Seed EVERY window of every weekday. A listing may store a split shift
  // (08:00–12:00 + 14:00–18:00); keeping only the first would delete the rest on
  // save, because the PUT replaces the whole rule set.
  const [week, setWeek] = useState<WeekWindows>(() => seedWeek(rules));

  const setDay = (dow: number, windows: HoursWindow[]): void =>
    setWeek((prev) => ({ ...prev, [dow]: windows }));

  const updateWindow = (dow: number, index: number, patch: Partial<HoursWindow>): void =>
    setDay(
      dow,
      (week[dow] ?? []).map((w, i) => (i === index ? { ...w, ...patch } : w)),
    );

  const errors = validateWeek(week);

  return (
    <div className="space-y-5">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
          <Link
            to={listing.groupId ? `/partner/listing-groups/${listing.groupId}` : '/partner/listings'}
          >
            <ArrowLeft className="size-4" aria-hidden /> Tin đăng
          </Link>
        </Button>
        <PageHeader
          title="Giờ mở cửa"
          description={`Lịch mở cửa hằng tuần cho “${listing.title}”. Cần thiết để tạo khung giờ cho đặt theo giờ. Một ngày có thể có nhiều khung giờ (ví dụ nghỉ trưa).`}
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
          const windows = week[d.dow] ?? [];
          const open = windows.length > 0;
          const clashes = overlappingIndices(windows);

          return (
            <div key={d.dow} className="rounded-lg border px-4 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex w-28 items-center gap-2">
                  <Switch
                    checked={open}
                    onCheckedChange={(on) =>
                      setDay(d.dow, on ? [{ open: DEFAULT_OPEN, close: DEFAULT_CLOSE }] : [])
                    }
                    aria-label={`Bật ${d.label}`}
                  />
                  <span className="text-sm font-medium">{d.label}</span>
                </div>
                {!open ? <span className="text-sm text-muted-foreground">Đóng cửa</span> : null}
              </div>

              {open ? (
                <div className="mt-3 space-y-2 sm:pl-28">
                  {windows.map((w, i) => (
                    <div key={i} className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        {/* Controlled inputs are display-only; the hidden field is
                            what submits, so add/remove needs no index bookkeeping. */}
                        <input type="hidden" name={WINDOW_FIELD} value={encodeWindow(d.dow, w)} />
                        <Input
                          type="time"
                          value={w.open}
                          onChange={(e) => updateWindow(d.dow, i, { open: e.target.value })}
                          className="w-32"
                          aria-label={`${d.label} — giờ mở, khung ${i + 1}`}
                        />
                        <span className="text-muted-foreground" aria-hidden>
                          →
                        </span>
                        <Input
                          type="time"
                          value={w.close}
                          onChange={(e) => updateWindow(d.dow, i, { close: e.target.value })}
                          className="w-32"
                          aria-label={`${d.label} — giờ đóng, khung ${i + 1}`}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setDay(d.dow, windows.filter((_, idx) => idx !== i))}
                          aria-label={`Xoá khung giờ ${i + 1} của ${d.label}`}
                        >
                          <X className="size-4" aria-hidden />
                        </Button>
                      </div>
                      {!isValidWindow(w) ? (
                        <p className="text-xs text-destructive">Giờ đóng phải sau giờ mở</p>
                      ) : clashes.has(i) ? (
                        <p className="text-xs text-destructive">Trùng với khung giờ khác</p>
                      ) : null}
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setDay(d.dow, [...windows, { open: DEFAULT_OPEN, close: DEFAULT_CLOSE }])
                    }
                  >
                    <Plus className="size-4" aria-hidden /> Thêm khung giờ
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}

        {errors.length > 0 ? (
          <ul className="space-y-1 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        ) : null}

        <div className="flex justify-end pt-1">
          <Button type="submit" disabled={saving || errors.length > 0}>
            {saving ? 'Đang lưu…' : 'Lưu giờ mở cửa'}
          </Button>
        </div>
      </Form>
    </div>
  );
}
