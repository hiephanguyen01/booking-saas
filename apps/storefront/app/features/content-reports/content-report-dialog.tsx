import { createContentReportInputSchema, type ContentReportTarget } from '@booking/contracts';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import { Button } from '@booking/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@booking/ui/components/ui/dialog';
import { Flag, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router';
import { NsI18n, useTranslation } from '~/lib/i18n';
import { useContentReportDialogController } from './use-content-report-dialog-controller';

export function ContentReportDialog({
  open,
  onOpenChange,
  target,
  targetId,
  title,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: ContentReportTarget;
  targetId: string;
  title: string;
}) {
  const { t } = useTranslation(NsI18n.Listing);
  const { actionData, defaultValues, loginPath, view } = useContentReportDialogController({
    target,
    targetId,
  });

  if (view === 'login') {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ShieldAlert className="size-6" aria-hidden="true" />
            </span>
            <DialogTitle className="text-center">{t('report.loginTitle')}</DialogTitle>
            <DialogDescription className="text-center">{t('report.loginBody')}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:flex-col">
            <Button asChild className="w-full">
              <Link to={loginPath}>{t('report.loginCta')}</Link>
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => onOpenChange(false)}>
              {t('report.cancel')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  if (view === 'success') {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ShieldAlert className="size-6" aria-hidden="true" />
            </span>
            <DialogTitle className="text-center">{t('report.successTitle')}</DialogTitle>
            <DialogDescription className="text-center">
              {actionData?.duplicate ? t('report.duplicateBody') : t('report.successBody')}
            </DialogDescription>
          </DialogHeader>
          <Button className="w-full" onClick={() => onOpenChange(false)}>
            {t('report.close')}
          </Button>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <span className="flex size-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <Flag className="size-5" aria-hidden="true" />
          </span>
          <DialogTitle>{t('report.title')}</DialogTitle>
          <DialogDescription>{t('report.description', { title })}</DialogDescription>
        </DialogHeader>
        <GenericForm
          schema={createContentReportInputSchema}
          fields={[
            {
              name: 'reason',
              type: 'select',
              label: t('report.reasonLabel'),
              required: true,
              options: [
                ['misleading', t('report.reasons.misleading')],
                ['fraud_or_scam', t('report.reasons.fraudOrScam')],
                ['prohibited_content', t('report.reasons.prohibitedContent')],
                ['contact_or_off_platform', t('report.reasons.offPlatform')],
                ['duplicate_or_spam', t('report.reasons.spam')],
                ['other', t('report.reasons.other')],
              ].map(([value, label]) => ({ value, label })),
            },
            {
              name: 'details',
              type: 'textarea',
              rows: 4,
              label: t('report.detailsLabel'),
              placeholder: t('report.detailsPlaceholder'),
            },
          ]}
          defaultValues={defaultValues}
          submitLabel={t('report.submit')}
          submitPendingLabel={t('report.submitting')}
          serverError={actionData?.error === 'failed' ? t('report.failed') : null}
          fieldErrors={actionData?.fieldErrors}
          submitFullWidth
        />
      </DialogContent>
    </Dialog>
  );
}
