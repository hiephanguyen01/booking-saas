import type { StorefrontPromotion, ValidatePromoResponse } from '@booking/contracts';
import { NsI18n, useTranslation } from '@booking/i18n';
import { Button } from '@booking/ui/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@booking/ui/components/ui/dialog';
import { Input } from '@booking/ui/components/ui/input';
import { Check, ChevronRight, TicketPercent, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Form, Link } from 'react-router';
import { storefrontPaths } from '~/constants/paths';
import { useLocale } from '~/hooks/use-locale';
import { formatVnd } from '~/lib/ui';

/** Query keys every promo navigation carries through so the checkout selection stays intact. */
const CHECKOUT_KEYS = ['listing', 'mode', 'start', 'end', 'qty', 'packageId'] as const;

export function PromoForm({
  searchParams,
  promoCode,
  promo,
  promotions,
  promotionsUnavailable,
}: {
  searchParams: URLSearchParams;
  promoCode: string | null;
  promo: ValidatePromoResponse | null;
  promotions: StorefrontPromotion[];
  promotionsUnavailable: boolean;
}) {
  const { t } = useTranslation(NsI18n.Checkout);
  const locale = useLocale();
  const applied = promo?.valid ?? false;
  const errorCode = promo && !promo.valid ? promo.error : undefined;
  const [open, setOpen] = useState(Boolean(errorCode));
  const [selectedCode, setSelectedCode] = useState<string | null>(applied ? promoCode : null);
  const promoInputRef = useRef<HTMLInputElement>(null);
  const hidden = CHECKOUT_KEYS.flatMap((key) => {
    const value = searchParams.get(key);
    return value === null ? [] : ([[key, value]] as const);
  });
  const selectedPromotion = promotions.find((item) => item.code === selectedCode);
  const selectedSavings =
    selectedPromotion?.discountAmount ??
    (promo?.valid && selectedCode === promoCode ? promo.discountAmount : null);

  useEffect(() => {
    if (promo?.valid) setOpen(false);
    else if (errorCode) setOpen(true);
  }, [errorCode, promo?.valid, promoCode]);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) setSelectedCode(applied ? promoCode : null);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="flex shrink-0 items-center gap-1 rounded-sm text-sm leading-5 font-medium text-success outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <TicketPercent className="size-5" strokeWidth={1.6} aria-hidden="true" />
          <span>{applied ? promoCode : t('promoSection')}</span>
          <ChevronRight className="size-5" aria-hidden="true" />
        </button>
      </DialogTrigger>

      <DialogContent
        showCloseButton={false}
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-2xl"
        onOpenAutoFocus={
          errorCode
            ? (event) => {
                event.preventDefault();
                promoInputRef.current?.focus();
              }
            : undefined
        }
      >
        <DialogHeader className="shrink-0 border-b px-5 py-5 pr-16 text-left sm:px-7 sm:py-6">
          <DialogTitle className="text-xl leading-7 sm:text-2xl">
            {t('promoDialog.title')}
          </DialogTitle>
          <DialogDescription className="mt-1 text-sm leading-5">
            {t('promoDialog.description')}
          </DialogDescription>
        </DialogHeader>
        <DialogClose asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 sm:top-5 sm:right-5"
            aria-label={t('promoDialog.close')}
          >
            <X className="size-5" aria-hidden="true" />
          </Button>
        </DialogClose>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
          <Form method="get" className="flex flex-col gap-3 sm:flex-row">
            <CheckoutHiddenFields hidden={hidden} />
            <Input
              ref={promoInputRef}
              name="promo"
              defaultValue={promoCode ?? ''}
              placeholder={t('promoDialog.inputPlaceholder')}
              aria-label={t('promoSection')}
              aria-invalid={Boolean(errorCode)}
              aria-describedby={errorCode ? 'promo-code-error' : undefined}
              className="uppercase sm:flex-1"
            />
            <Button type="submit" size="control" className="sm:px-7">
              {t('promoApply')}
            </Button>
          </Form>
          {errorCode ? (
            <p id="promo-code-error" className="mt-2 text-sm text-destructive" aria-live="polite">
              {t(`promoErrors.${errorCode}`)}
            </p>
          ) : null}

          <h3 className="mt-7 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            {t('promoDialog.available')}
          </h3>

          {promotionsUnavailable ? (
            <p className="mt-3 rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
              {t('promoDialog.unavailable')}
            </p>
          ) : promotions.length === 0 ? (
            <p className="mt-3 rounded-lg border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
              {t('promoDialog.empty')}
            </p>
          ) : (
            <div
              className="mt-3 grid gap-3 sm:grid-cols-2"
              role="radiogroup"
              aria-label={t('promoDialog.available')}
            >
              {promotions.map((item) => {
                const selected = item.code === selectedCode;
                return (
                  <button
                    key={item.code}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-disabled={!item.eligible}
                    disabled={!item.eligible}
                    onClick={() => setSelectedCode(item.code)}
                    className="group grid min-h-32 grid-cols-[5.75rem_1fr] overflow-hidden rounded-xl border border-border bg-background text-left outline-none transition-colors enabled:hover:border-success/60 enabled:focus-visible:ring-2 enabled:focus-visible:ring-ring enabled:focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-muted/30 sm:grid-cols-[6.25rem_1fr]"
                  >
                    <span
                      className={`relative flex flex-col items-center justify-center px-2 text-center after:absolute after:top-1/2 after:-right-2.5 after:size-5 after:-translate-y-1/2 after:rounded-full after:bg-background ${
                        item.eligible
                          ? 'bg-success text-success-foreground'
                          : 'bg-muted text-muted-foreground after:bg-muted/30'
                      }`}
                    >
                      <span className="text-xl font-bold sm:text-2xl">{discountBadge(item)}</span>
                      <span className="text-[0.65rem] font-semibold tracking-wide uppercase">
                        {t('promoDialog.discountBadge')}
                      </span>
                    </span>

                    <span className="relative flex min-w-0 flex-col gap-1 p-3 pl-4 text-sm">
                      <span
                        className={
                          item.eligible
                            ? 'font-semibold text-foreground'
                            : 'font-semibold text-muted-foreground'
                        }
                      >
                        {item.name}
                      </span>
                      {item.minOrderAmount ? (
                        <span className="text-xs text-muted-foreground">
                          {t('promoDialog.minOrder', {
                            amount: formatVnd(item.minOrderAmount) ?? '',
                          })}
                        </span>
                      ) : null}
                      {item.firstBookingOnly ? (
                        <span className="text-xs text-muted-foreground">
                          {t('promoDialog.firstBooking')}
                        </span>
                      ) : null}
                      {item.endsAt ? (
                        <span className="mt-auto text-xs text-muted-foreground">
                          {t('promoDialog.expires', { date: formatPromoDate(item.endsAt, locale) })}
                        </span>
                      ) : null}
                      {!item.eligible && item.error ? (
                        <span className="mt-auto text-xs font-medium text-muted-foreground italic">
                          {t(`promoErrors.${item.error}`)}
                        </span>
                      ) : null}
                      <span
                        aria-hidden="true"
                        className={`absolute right-3 bottom-3 flex size-5 items-center justify-center rounded-full border ${
                          selected
                            ? 'border-success bg-success text-success-foreground'
                            : 'border-border bg-background'
                        }`}
                      >
                        {selected ? <Check className="size-3.5" strokeWidth={2.5} /> : null}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t bg-muted/30 px-5 py-4 sm:flex sm:items-center sm:justify-between sm:gap-5 sm:px-7 sm:py-5">
          <div className="min-w-0">
            {selectedCode && selectedSavings ? (
              <p className="text-sm text-muted-foreground">
                {t('promoDialog.selected', { code: selectedCode })}
                <span className="mt-0.5 block text-xl font-semibold text-success">
                  {t('promoDialog.savings', { amount: formatVnd(selectedSavings) ?? '' })}
                </span>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">{t('promoDialog.selectPrompt')}</p>
            )}
            {applied ? (
              <Link
                to={promoUrl(hidden, locale)}
                className="mt-1 inline-block rounded-sm text-xs font-semibold text-foreground underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {t('promoRemove')}
              </Link>
            ) : null}
          </div>

          <div className="mt-4 flex gap-2 sm:mt-0 sm:shrink-0">
            <DialogClose asChild>
              <Button
                type="button"
                variant="secondary"
                size="control"
                className="flex-1 sm:flex-none"
              >
                {t('promoDialog.cancel')}
              </Button>
            </DialogClose>
            <Form method="get" className="flex-1 sm:flex-none">
              <CheckoutHiddenFields hidden={hidden} />
              {selectedCode ? <input type="hidden" name="promo" value={selectedCode} /> : null}
              <Button
                type="submit"
                size="control"
                className="w-full sm:min-w-32"
                disabled={!selectedCode}
              >
                {t('promoApply')}
              </Button>
            </Form>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CheckoutHiddenFields({ hidden }: { hidden: readonly (readonly [string, string])[] }) {
  return hidden.map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />);
}

function promoUrl(hidden: readonly (readonly [string, string])[], locale: 'vi' | 'en'): string {
  const params = new URLSearchParams(hidden.map(([key, value]) => [key, value]));
  return `${storefrontPaths.checkout(locale)}?${params.toString()}`;
}

function discountBadge(promotion: StorefrontPromotion): string {
  if (promotion.discountType === 'percent') return `${promotion.discountValue}%`;
  const value = BigInt(promotion.discountValue);
  if (value >= 1_000_000n && value % 1_000_000n === 0n) return `${value / 1_000_000n}M`;
  if (value >= 1_000n && value % 1_000n === 0n) return `${value / 1_000n}K`;
  return formatVnd(promotion.discountValue) ?? promotion.discountValue;
}

function formatPromoDate(value: string, locale: 'vi' | 'en'): string {
  return new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-GB').format(new Date(value));
}
