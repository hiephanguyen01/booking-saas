import type { ValidatePromoResponse } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Input } from '@booking/ui/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@booking/ui/components/ui/popover';
import { ChevronRight, TicketPercent } from 'lucide-react';
import { Form, Link } from 'react-router';
import { NsI18n, useTranslation } from '@booking/i18n';
import { storefrontPaths } from '~/constants/paths';
import { formatVnd } from '~/lib/ui';
import { useLocale } from '~/hooks/use-locale';

/** The query keys the promo form must carry through so the quote stays intact. */
const CHECKOUT_KEYS = ['listing', 'mode', 'start', 'end', 'qty'] as const;

export function PromoForm({
  searchParams,
  promoCode,
  promo,
}: {
  searchParams: URLSearchParams;
  promoCode: string | null;
  promo: ValidatePromoResponse | null;
}) {
  const { t } = useTranslation(NsI18n.Checkout);
  const locale = useLocale();
  const hidden = CHECKOUT_KEYS.map((key) => [key, searchParams.get(key) ?? ''] as const);
  const applied = promo?.valid ?? false;
  const errorCode = promo && !promo.valid ? promo.error : undefined;

  // Applying a code is a GET navigation, so the panel re-renders closed and the
  // rejection reason below would never be seen. Reopen it when one came back.
  return (
    <Popover defaultOpen={Boolean(errorCode)}>
      <PopoverTrigger className="flex shrink-0 items-center gap-1 rounded-sm text-sm leading-5 font-medium text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none [&[data-state=open]>svg:last-child]:rotate-90">
        <TicketPercent className="size-5" strokeWidth={1.6} aria-hidden="true" />
        <span>{applied ? promoCode : t('promoSection')}</span>
        <ChevronRight className="size-5 transition-transform" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72.5 p-3">
        {promo?.valid ? (
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium text-primary">
              {t('promoApplied', {
                code: promoCode ?? '',
                amount: formatVnd(promo.discountAmount) ?? '',
              })}
            </span>
            <Link
              to={promoRemoveUrl(hidden, locale)}
              className="shrink-0 rounded-sm text-xs font-semibold hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              {t('promoRemove')}
            </Link>
          </div>
        ) : (
          <Form method="get" className="flex gap-2">
            {hidden.map(([key, value]) => (
              <input key={key} type="hidden" name={key} value={value} />
            ))}
            <Input
              name="promo"
              defaultValue={promoCode ?? ''}
              placeholder={t('promoPlaceholder')}
              aria-label={t('promoSection')}
              className="uppercase"
            />
            <Button type="submit" variant="outline" size="control">
              {t('promoApply')}
            </Button>
          </Form>
        )}
        {errorCode ? (
          <p className="mt-2 text-xs text-destructive">{t(`promoErrors.${errorCode}`)}</p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function promoRemoveUrl(
  hidden: readonly (readonly [string, string])[],
  locale: 'vi' | 'en',
): string {
  const params = new URLSearchParams(hidden.map(([key, value]) => [key, value]));
  return `${storefrontPaths.checkout(locale)}?${params.toString()}`;
}
