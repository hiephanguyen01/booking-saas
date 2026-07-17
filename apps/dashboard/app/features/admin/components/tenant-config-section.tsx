import { ChevronDown, Settings2 } from 'lucide-react';
import type { TenantDetailResponse } from '@booking/contracts';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@booking/ui/components/ui/collapsible';
import { DetailField } from '@booking/ui/components/detail/detail-field';
import { DetailGrid } from '@booking/ui/components/detail/detail-grid';
import { DetailSection } from '@booking/ui/components/detail/detail-section';
import { asRecord, readBooleanU, readStringU } from '~/lib/records';
import { LOCALE_LABELS } from '~/constants/tenancy';
import { EnumValue } from '~/components/enum-value';

/** Collapsible "Cấu hình" panel: timezone/locale/theme readouts from the tenant jsonb blobs. */
export function TenantConfigSection({ tenant }: { tenant: TenantDetailResponse }) {
  const theme = asRecord(tenant.themeConfig) ?? {};
  const settings = asRecord(tenant.settings) ?? {};
  const logoUrl = readStringU(theme.logoUrl);
  const font = readStringU(theme.font);
  const primaryColor = readStringU(asRecord(theme.colors)?.primary);
  const partnerPromotions = readBooleanU(settings.partnerPromotionsEnabled);

  return (
    <Collapsible className="rounded-lg border bg-card">
      <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 rounded-lg px-6 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
        <span className="flex items-center gap-2 text-base font-semibold">
          <Settings2 className="size-4 text-muted-foreground" />
          Cấu hình
        </span>
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-6 px-6 pb-6">
        <DetailGrid columns={3}>
          <DetailField label="Múi giờ" value={tenant.defaultTimezone} />
          <DetailField
            label="Ngôn ngữ"
            value={<EnumValue map={LOCALE_LABELS} value={tenant.defaultLocale} />}
          />
          <DetailField
            label="Màu chủ đạo"
            value={
              primaryColor ? (
                <span className="inline-flex items-center gap-2">
                  <span
                    className="size-4 rounded-sm border border-border"
                    style={{ backgroundColor: primaryColor }}
                    aria-hidden
                  />
                  <span className="font-mono text-xs">{primaryColor}</span>
                </span>
              ) : undefined
            }
            omitWhenEmpty
          />
          <DetailField label="Font" value={font} omitWhenEmpty />
          <DetailField
            label="Logo"
            span={2}
            value={
              logoUrl ? (
                <a
                  href={logoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all text-primary underline-offset-4 hover:underline"
                >
                  {logoUrl}
                </a>
              ) : undefined
            }
            omitWhenEmpty
          />
        </DetailGrid>

        <DetailSection title="Tuỳ chọn" className="pt-2">
          <DetailGrid columns={3}>
            <DetailField
              label="Partner tự tạo khuyến mãi"
              value={partnerPromotions === undefined ? undefined : partnerPromotions ? 'Bật' : 'Tắt'}
            />
          </DetailGrid>
        </DetailSection>
      </CollapsibleContent>
    </Collapsible>
  );
}
