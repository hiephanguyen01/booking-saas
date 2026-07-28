import { type AffiliateRegistrationInput } from '@booking/contracts';
import type { FieldConfig } from '@booking/ui/components/form/types';
import { useMemo } from 'react';
import { useRouteLoaderData } from 'react-router';
import {
  NsI18n,
  useTranslation,
  type ScopedI18n,
  type ScopedTranslationKey,
} from '../../../lib/i18n';
import type { loader as rootLoader } from '../../../root';

const APPLY_ERRORS = {
  emailTakenWrongPassword: 'common:becomePartner.errors.emailTakenWrongPassword',
  TENANT_INACTIVE: 'auth:affiliate.errors.tenantInactive',
} as const satisfies Record<string, ScopedTranslationKey<[NsI18n.Auth, NsI18n.Common]>>;

function createFields(
  t: ScopedI18n<[NsI18n.Auth, NsI18n.Common]>['t'],
): FieldConfig<AffiliateRegistrationInput>[] {
  return [
    {
      name: 'fullName',
      type: 'text',
      label: t('common:becomePartner.fullName'),
      autoComplete: 'name',
      colSpan: 2,
    },
    { name: 'email', type: 'email', label: t('common:becomePartner.email'), autoComplete: 'email' },
    { name: 'phone', type: 'text', label: t('common:becomePartner.phone'), autoComplete: 'tel' },
    {
      name: 'password',
      type: 'password',
      label: t('common:becomePartner.password'),
      autoComplete: 'new-password',
      colSpan: 2,
    },
    { name: 'bankName', type: 'text', label: t('auth:affiliate.bankOptional') },
    { name: 'accountNo', type: 'text', label: t('auth:affiliate.accountNoOptional') },
    {
      name: 'accountHolder',
      type: 'text',
      label: t('auth:affiliate.accountHolderOptional'),
      colSpan: 2,
    },
  ];
}

export function useAffiliateApplicationPageController({
  loaderData,
  actionData,
}: {
  loaderData: {
    tenantName: string;
    dashboardUrl: string;
    tenantLogoUrl: string | null;
  };
  actionData?: {
    ok?: boolean;
    error?: string | null;
    fieldErrors?: Partial<Record<keyof AffiliateRegistrationInput, string[]>> | null;
  };
}) {
  const rootData = useRouteLoaderData<typeof rootLoader>('root');
  const { t } = useTranslation([NsI18n.Auth, NsI18n.Common]);
  const formFields = useMemo(() => createFields(t), [t]);
  const errorCode = actionData?.error;

  return {
    dashboardLoginHref: `${loaderData.dashboardUrl}/auth/login`,
    fieldErrors: actionData?.fieldErrors ?? null,
    formFields,
    logoUrl:
      loaderData.tenantLogoUrl ??
      (rootData?.kind === 'tenant' ? rootData.tenant.themeConfig.logoUrl : null) ??
      null,
    serverError: errorCode
      ? t(
          APPLY_ERRORS[errorCode as keyof typeof APPLY_ERRORS] ??
            'common:becomePartner.errors.generic',
        )
      : null,
    success: Boolean(actionData?.ok),
    t,
    tenantName: loaderData.tenantName,
  };
}
