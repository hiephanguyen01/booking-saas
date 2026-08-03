import { useState, type FormEvent } from 'react';
import { data, Form, useNavigation, useSubmit } from 'react-router';
import { Plus, X } from 'lucide-react';
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
import { requirePartner } from '~/features/partner/server/partner.server';
import { ErrorBanner, SuccessBanner } from '~/components/action-feedback';
import { dashboardPaths } from '~/constants/paths';
import { BackLink } from '~/components/back-link';
import { FormActions, FormSurface, Section } from '~/components/form-layout';
import { PageHeader } from '~/components/page-header';
import { useSubmissionGuard } from '~/hooks/use-submission-guard';
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
} from '~/features/partner/lib/listing-hours';
import { apiPaths } from '~/constants/api-paths';
import { actionMessages, notFoundMessages } from '~/constants/messages';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Giờ mở cửa · Đối tác · BookingOS' }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { auth } = await requirePartner(request, 'partner.availability.manage');
  const id = params.listingId;
  const listingRes = await apiGet<ListingResponse>(apiPaths.partner.listing(id), auth);
  if (!listingRes.ok || !listingRes.data) {
    throw new Response(notFoundMessages.listing, { status: 404 });
  }
  const listing = listingRes.data;

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
  const { auth, can } = await requirePartner(request);
  if (!can('partner.availability.manage')) {
    return data({ ok: false, error: 'Không có quyền quản lý lịch.' }, { status: 403 });
  }
  const form = await request.formData();
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
    : data({ ok: false, error: res.error ?? actionMessages.saveFailed }, { status: 400 });
}

export default function ListingHoursPage({ loaderData, actionData }: Route.ComponentProps) {
  const { listing, rules } = loaderData;
  const navigation = useNavigation();
  const submit = useSubmit();
  const { busy: saving, run } = useSubmissionGuard(navigation.state);
  const [week, setWeek] = useState<WeekWindows>(() => seedWeek(rules));

  const setDay = (dow: number, windows: HoursWindow[]): void =>
    setWeek((previous) => ({ ...previous, [dow]: windows }));

  const updateWindow = (dow: number, index: number, patch: Partial<HoursWindow>): void =>
    setDay(
      dow,
      (week[dow] ?? []).map((window, currentIndex) =>
        currentIndex === index ? { ...window, ...patch } : window,
      ),
    );

  const errors = validateWeek(week);

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    run(() => submit(formData, { method: 'post' }));
  };

  return (
    <div className="space-y-5" aria-busy={saving}>
      <div>
        <BackLink
          to={
            listing.groupId
              ? dashboardPaths.partner.listingGroup(listing.groupId)
              : dashboardPaths.partner.listing(listing.id)
          }
          label="Tin đăng"
          className="mb-2"
        />
        <PageHeader
          title="Giờ mở cửa"
          description={`Lịch hoạt động hằng tuần của “${listing.title}”. Có thể thêm nhiều khung trong một ngày nếu có giờ nghỉ.`}
        />
      </div>

      <SuccessBanner message={actionData?.ok ? 'Đã lưu giờ mở cửa.' : null} />
      <ErrorBanner error={actionData?.error} />

      <Form method="post" className="space-y-3" onSubmit={handleSubmit}>
        <fieldset disabled={saving} className="m-0 min-w-0 space-y-3 border-0 p-0">
          <FormSurface>
            <Section
              title="Lịch trong tuần"
              description="Bật những ngày nhận đặt lịch và khai báo giờ mở, giờ đóng."
            >
              {DAYS.map((day) => {
                const windows = week[day.dow] ?? [];
                const open = windows.length > 0;
                const clashes = overlappingIndices(windows);

                return (
                  <div key={day.dow} className="rounded-lg border px-4 py-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex w-28 items-center gap-2">
                        <Switch
                          checked={open}
                          onCheckedChange={(enabled) =>
                            setDay(
                              day.dow,
                              enabled ? [{ open: DEFAULT_OPEN, close: DEFAULT_CLOSE }] : [],
                            )
                          }
                          aria-label={`Bật ${day.label}`}
                        />
                        <span className="text-sm font-medium">{day.label}</span>
                      </div>
                      {!open ? (
                        <span className="text-sm text-muted-foreground">Đóng cửa</span>
                      ) : null}
                    </div>

                    {open ? (
                      <div className="mt-3 space-y-2 sm:pl-28">
                        {windows.map((window, index) => (
                          <div key={index} className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2 text-sm">
                              <input
                                type="hidden"
                                name={WINDOW_FIELD}
                                value={encodeWindow(day.dow, window)}
                              />
                              <Input
                                type="time"
                                value={window.open}
                                onChange={(event) =>
                                  updateWindow(day.dow, index, { open: event.target.value })
                                }
                                className="w-32"
                                aria-label={`${day.label} — giờ mở, khung ${index + 1}`}
                              />
                              <span className="text-muted-foreground" aria-hidden>
                                →
                              </span>
                              <Input
                                type="time"
                                value={window.close}
                                onChange={(event) =>
                                  updateWindow(day.dow, index, { close: event.target.value })
                                }
                                className="w-32"
                                aria-label={`${day.label} — giờ đóng, khung ${index + 1}`}
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() =>
                                  setDay(
                                    day.dow,
                                    windows.filter((_, currentIndex) => currentIndex !== index),
                                  )
                                }
                                aria-label={`Xoá khung giờ ${index + 1} của ${day.label}`}
                              >
                                <X className="size-4" aria-hidden />
                              </Button>
                            </div>
                            {!isValidWindow(window) ? (
                              <p className="text-xs text-destructive">Giờ đóng phải sau giờ mở</p>
                            ) : clashes.has(index) ? (
                              <p className="text-xs text-destructive">Trùng với khung giờ khác</p>
                            ) : null}
                          </div>
                        ))}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setDay(day.dow, [
                              ...windows,
                              { open: DEFAULT_OPEN, close: DEFAULT_CLOSE },
                            ])
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
                  {errors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              ) : null}
            </Section>
          </FormSurface>

          <FormActions hint="Thay đổi chỉ có hiệu lực sau khi lưu.">
            <Button type="submit" size="control" disabled={saving || errors.length > 0}>
              {saving ? 'Đang lưu…' : 'Lưu giờ mở cửa'}
            </Button>
          </FormActions>
        </fieldset>
      </Form>
    </div>
  );
}
