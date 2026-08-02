import { useState } from 'react';
import { Link } from 'react-router';
import { CalendarDays, Repeat } from 'lucide-react';
import type { ListingResponse, PricingRuleResponse } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { SuccessBanner } from '~/components/action-feedback';
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

  if (listing.bookingSelection === 'fixed_packages') {
    return (
      <div className="rounded-xl border border-dashed bg-muted/20 px-6 py-12 text-center">
        <Repeat className="mx-auto size-8 text-muted-foreground" />
        <h2 className="mt-3 font-semibold">Không áp dụng cho gói cố định</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Giá của tin đăng này được quản lý trong mục “Các gói dịch vụ”.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border bg-muted/20 p-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium">
            <Repeat className="size-4 text-primary" /> Giá lặp lại
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Khai báo một lần, áp mãi cho những thứ trong tuần bạn chọn. Giá riêng đặt cho một ngày
            cụ thể ở tab “Lịch và giá” luôn đè lên các quy tắc ở đây.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {enabledModes.map((item) => (
            <Button key={item} asChild size="sm" variant={item === mode ? 'default' : 'outline'}>
              <Link to={`?tab=pricing&mode=${item}`}>
                {item === 'hourly' ? 'Theo giờ' : 'Theo ngày'}
              </Link>
            </Button>
          ))}
          <Button asChild size="sm" variant="outline">
            <Link to="?tab=calendar">
              <CalendarDays className="size-4" /> Lịch và giá
            </Link>
          </Button>
        </div>
      </div>

      <SuccessBanner message={notice} />

      <div className="space-y-2">
        <h2 className="text-sm font-medium">
          {modeRules.length > 0
            ? `${modeRules.length} quy tắc đang áp dụng`
            : 'Chưa có quy tắc lặp lại nào'}
        </h2>
        {modeRules.length > 0 ? (
          modeRules.map((rule) => (
            <RuleRow key={rule.id} rule={rule} unit={unit} canWrite={canPricing} />
          ))
        ) : (
          <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            Mọi giờ/ngày đang dùng giá mặc định của tin đăng.
          </p>
        )}
      </div>

      {canPricing ? (
        <RuleForm
          mode={mode}
          basePrice={basePrice}
          onSaved={() => setNotice('Đã thêm quy tắc giá lặp lại.')}
        />
      ) : null}
    </div>
  );
}
