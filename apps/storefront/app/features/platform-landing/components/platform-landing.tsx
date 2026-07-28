import { NsI18n, useTranslation } from '~/lib/i18n';
import type { PlatformRootLoaderPayload } from '~/features/root/server/root-loader.server';
import { PlatformHeader } from './platform-header';
import {
  CapabilitiesSection,
  ConsultationSection,
  DemosSection,
  FaqSection,
  PlatformFooter,
  PlatformHero,
  PricingSection,
  ServiceModelsSection,
  TransformationSection,
  TrustSection,
  WorkflowSection,
} from './platform-sections';

export function PlatformLanding({ loaderData }: { loaderData: PlatformRootLoaderPayload }) {
  const { t } = useTranslation(NsI18n.Platform);

  return (
    <div className="platform-landing overflow-x-clip selection:bg-[#ffb020] selection:text-[#0a0e13]">
      <a href="#platform-main" className="platform-skip-link">
        {t('skipToContent')}
      </a>
      <PlatformHeader locale={loaderData.locale} dashboardLoginUrl={loaderData.dashboardLoginUrl} />
      <main id="platform-main">
        <PlatformHero />
        <ServiceModelsSection />
        <TransformationSection />
        <CapabilitiesSection />
        <WorkflowSection />
        <DemosSection />
        <PricingSection />
        <TrustSection />
        <FaqSection />
        <ConsultationSection />
      </main>
      <PlatformFooter loaderData={loaderData} />
    </div>
  );
}
