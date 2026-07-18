import { Alert, AlertDescription } from '@booking/ui/components/ui/alert';
import { Button } from '@booking/ui/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@booking/ui/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@booking/ui/components/ui/radio-group';
import { Textarea } from '@booking/ui/components/ui/textarea';
import { CircleAlert, Check } from 'lucide-react';
import { useState } from 'react';
import { Form, useNavigation } from 'react-router';
import { NsI18n, useTranslation } from '../../../lib/i18n';

const REASON_KEYS = [
  'schedule',
  'listing',
  'promotion',
  'cheaper',
  'changedMind',
  'other',
] as const;

export function CancelBookingDialog({
  defaultOpen = false,
  serverError = null,
}: {
  defaultOpen?: boolean;
  serverError?: string | null;
}) {
  const { t } = useTranslation(NsI18n.Account);
  const navigation = useNavigation();
  const [open, setOpen] = useState(defaultOpen || Boolean(serverError));
  const [selected, setSelected] = useState('');
  const [otherReason, setOtherReason] = useState('');
  const reason = selected === 'other' ? otherReason.trim() : selected;
  const submitting = navigation.state === 'submitting';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="secondary"
          className="h-10 rounded-sm bg-slate-700 px-6 text-white hover:bg-slate-800"
        >
          {t('bookings.cancel')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto rounded-none border-0 p-6 sm:max-w-[562px] sm:p-8">
        <DialogHeader>
          <DialogTitle className="text-2xl">{t('bookings.cancelDialog.title')}</DialogTitle>
          <DialogDescription className="sr-only">
            {t('bookings.cancelDialog.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 text-sm">
          <p className="flex items-center gap-2 text-emerald-600">
            <Check className="size-4" /> {t('bookings.freeCancellation')}
          </p>
          <p className="flex items-center gap-2 text-muted-foreground">
            <Check className="size-4 text-emerald-600" />
            {t('bookings.lateCancellation', { percent: 50 })}
          </p>
        </div>

        <Alert className="border-0 bg-amber-100 text-amber-700">
          <CircleAlert />
          <AlertDescription className="text-amber-700">
            {t('bookings.cancelDialog.warning')}
          </AlertDescription>
        </Alert>

        <Form method="post" className="space-y-5">
          <input type="hidden" name="intent" value="cancel" />
          <input type="hidden" name="reason" value={reason} />
          <RadioGroup value={selected} onValueChange={setSelected} className="gap-4">
            {REASON_KEYS.map((key) => (
              <label key={key} className="flex cursor-pointer items-start gap-3 text-sm leading-5">
                <RadioGroupItem value={key} className="mt-0.5" />
                <span>{t(`bookings.cancelDialog.reasons.${key}`)}</span>
              </label>
            ))}
          </RadioGroup>

          {selected === 'other' ? (
            <div>
              <Textarea
                value={otherReason}
                onChange={(event) => setOtherReason(event.currentTarget.value)}
                maxLength={500}
                placeholder={t('bookings.cancelDialog.otherPlaceholder')}
                aria-invalid={selected === 'other' && otherReason.trim().length === 0}
                className="min-h-20 rounded-sm"
              />
              <p className="mt-1 text-xs text-muted-foreground">{otherReason.length}/500</p>
            </div>
          ) : null}

          {serverError ? (
            <p role="alert" className="text-sm text-destructive">
              {t('bookings.actionFailed')}
            </p>
          ) : null}

          <DialogFooter className="grid grid-cols-2 gap-3 sm:grid-cols-2">
            <DialogClose asChild>
              <Button type="button" variant="outline" className="h-12 rounded-sm">
                {t('bookings.cancelDialog.back')}
              </Button>
            </DialogClose>
            <Button type="submit" className="h-12 rounded-sm" disabled={!reason || submitting}>
              {submitting
                ? t('bookings.cancelDialog.submitting')
                : t('bookings.cancelDialog.confirm')}
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
