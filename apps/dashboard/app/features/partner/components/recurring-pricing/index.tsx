import { useState } from 'react';
import { Link } from 'react-router';
import { CalendarDays, Clock3, Pencil, Repeat } from 'lucide-react';
import type { ListingResponse, PricingRuleResponse } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { SuccessBanner } from '~/components/action-feedback';
import { Money } from '~/components/money';
import { dashboardPaths } from '~/constants/paths';
import { defaultPrice, type CalendarMode } from '~/features/partner/lib/listing-calendar';
import { RuleForm } from './rule-form';
import { RuleRow } from './rule-row';

interface Props {
  listing: ListingResponse;
  mode: CalendarMode;
  rules: PricingRuleResponse[];
  canWrite: boolean;
}

/**
 * Repeating prices — weekend rates, peak-hour bands. These are the baseline the
 * month calendar then overrides, so this screen is where a partner sets pricing
 * once instead of touching every date forever.
 */
export function RecurringPricing({ listing, mode, rules, canWrite }: Props) {
  const [notice, setNotice] = useState<string | null>(null);
  const enabledModes = listing.bookingModes.filter(
    (item): item is CalendarMode => item === 'hourly' || item === 'daily',
  );
  const canPricing = canWrite && listing.bookingSelection === 'flexible_duration';
  const modeRules = rules.filter((rule) => rule.bookingMode === mode);
  const basePrice = defaultPrice(listing, mode);
  const unit = mode === 'hourly' ? 'giờ' : 'ngày';
  const listingPath = dashboardPaths.partner.listing(listing.id);

  if (listing.bookingSelection === 'fixed_packages') {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-dashed bg-muted/15 px-6 py-12 text-center">
        <span className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <Repeat className="size-5" aria-hidden />
        </span>
        <h2 className="mt-4 font-semibold">Gói cố định không dùng giá lặp lại</h2>
        <p className="mt-1 max-w-lg text-sm text-muted-foreground">
          Giá được thiết lập riêng trong từng gói dịch vụ. Lịch giá theo tuần không thay đổi giá của
          các gói này.
        </p>
        {canWrite ? (
          <Button asChild variant="outline" className="mt-5">
            <Link to={dashboardPaths.partner.listingEdit(listing.id)}>
              <Pencil className="size-4" aria-hidden /> Sửa các gói dịch vụ
            </Link>
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section
        className="rounded-2xl border bg-card p-5 shadow-none"
        aria-labelledby="pricing-overview-title"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Repeat className="size-5" aria-hidden />
            </span>
            <div>
              <h2 id="pricing-overview-title" className="font-semibold">
                Thiết lập giá theo tuần
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Tạo quy tắc cho các ngày hoặc khung giờ lặp lại hằng tuần. Giá riêng theo ngày trong
                “Lịch và giá” luôn được ưu tiên hơn.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {enabledModes.length > 1 ? (
              enabledModes.map((item) => (
                <Button
                  key={item}
                  asChild
                  size="sm"
                  variant={item === mode ? 'secondary' : 'ghost'}
                >
                  <Link to={`${listingPath}?tab=pricing&mode=${item}`}>
                    {item === 'hourly' ? 'Theo giờ' : 'Theo ngày'}
                  </Link>
                </Button>
              ))
            ) : (
              <span className="inline-flex min-h-9 items-center gap-2 px-2 text-sm font-medium">
                <Clock3 className="size-4 text-primary" aria-hidden />
                {mode === 'hourly' ? 'Theo giờ' : 'Theo ngày'}
              </span>
            )}
            <Button asChild size="sm" variant="outline">
              <Link to={`${listingPath}?tab=calendar`}>
                <CalendarDays className="size-4" /> Lịch và giá
              </Link>
            </Button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-end justify-between gap-3 border-t pt-4">
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Giá cơ bản
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {basePrice ? <Money value={basePrice} /> : 'Chưa thiết lập'}
              {basePrice ? (
                <span className="text-sm font-normal text-muted-foreground">/{unit}</span>
              ) : null}
            </p>
          </div>
          <p className="max-w-md text-sm text-muted-foreground">
            Quy tắc bên dưới chỉ thay giá ở đúng ngày và khung giờ được chọn.
          </p>
        </div>
      </section>

      <SuccessBanner message={notice} />

      <section className="space-y-3" aria-labelledby="active-rules-title">
        <div>
          <h2 id="active-rules-title" className="font-semibold">
            Quy tắc đang áp dụng
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {modeRules.length > 0
              ? `${modeRules.length} quy tắc cho hình thức ${mode === 'hourly' ? 'theo giờ' : 'theo ngày'}.`
              : 'Chưa có thay đổi nào so với giá cơ bản.'}
          </p>
        </div>
        {modeRules.length > 0 ? (
          <div className="space-y-2">
            {modeRules.map((rule) => (
              <RuleRow key={rule.id} rule={rule} unit={unit} canWrite={canPricing} />
            ))}
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-2xl border border-dashed bg-muted/15 px-5 py-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Repeat className="size-4" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-medium">Đang dùng giá cơ bản cho toàn bộ tuần</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Tạo quy tắc mới nếu cuối tuần, ngày thường hoặc một khung giờ cần mức giá khác.
              </p>
            </div>
          </div>
        )}
      </section>

      {canPricing ? (
        <RuleForm
          mode={mode}
          basePrice={basePrice}
          onSaved={() => setNotice('Đã thêm quy tắc giá lặp lại.')}
        />
      ) : (
        <p className="rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
          Bạn không có quyền thêm hoặc xoá quy tắc giá của tin đăng này.
        </p>
      )}
    </div>
  );
}
