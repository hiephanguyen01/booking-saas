import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@booking/ui/components/ui/accordion';
import { Mail, MapPin, Phone } from 'lucide-react';
import { useOutletContext } from 'react-router';
import { AccountPanel, PageHeading } from '~/features/account/components/shared/account-primitives';
import type { AccountOutletContext } from '~/features/account/hooks/use-account-layout-controller';
import { NsI18n, useTranslation } from '@booking/i18n';

export function HelpPage() {
  const { tenant } = useOutletContext<AccountOutletContext>();
  const { t } = useTranslation(NsI18n.Account);
  const contact = tenant.themeConfig.contact;
  const faqs = [
    [t('help.q1'), t('help.a1')],
    [t('help.q2'), t('help.a2')],
    [t('help.q3'), t('help.a3')],
  ];
  return (
    <div className="space-y-(--sf-section-gap) md:space-y-4">
      <PageHeading title={t('help.title')} />
      <div className="grid gap-(--sf-section-gap) md:gap-4 lg:grid-cols-[1.35fr_.65fr]">
        <AccountPanel className="p-(--sf-surface-pad) md:p-8">
          <h2 className="mb-4 font-semibold">{t('help.faq')}</h2>
          <Accordion type="single" collapsible>
            {faqs.map(([question, answer], index) => (
              <AccordionItem key={question} value={`faq-${index}`}>
                <AccordionTrigger className="text-left text-sm">{question}</AccordionTrigger>
                <AccordionContent className="text-sm leading-6 text-muted-foreground">
                  {answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </AccountPanel>
        <AccountPanel className="self-start p-(--sf-surface-pad) md:p-6">
          <h2 className="font-semibold">{t('help.contact')}</h2>
          <div className="mt-5 space-y-4 text-sm">
            {contact?.phone ? (
              <a
                href={`tel:${contact.phone}`}
                className="flex items-start gap-3 hover:text-primary"
              >
                <Phone className="mt-0.5 size-4" />
                {contact.phone}
              </a>
            ) : null}
            {contact?.email ? (
              <a
                href={`mailto:${contact.email}`}
                className="flex items-start gap-3 break-all hover:text-primary"
              >
                <Mail className="mt-0.5 size-4 shrink-0" />
                {contact.email}
              </a>
            ) : null}
            {contact?.address ? (
              <p className="flex items-start gap-3 text-muted-foreground">
                <MapPin className="mt-0.5 size-4 shrink-0" />
                {contact.address}
              </p>
            ) : null}
          </div>
        </AccountPanel>
      </div>
    </div>
  );
}
