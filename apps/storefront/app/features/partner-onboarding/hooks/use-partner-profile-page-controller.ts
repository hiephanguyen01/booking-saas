import {
  partnerOnboardingProfileSchema,
  type AdministrativeWard,
  type PartnerOnboardingProfileInput,
} from '@booking/contracts';
import type { FieldConfig } from '@booking/ui/components/form/types';
import { useSubmissionGuard } from '@booking/ui/hooks/use-submission-guard';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useRef } from 'react';
import { useForm, useWatch, type Path } from 'react-hook-form';
import { useFetcher, useNavigation, useSubmit } from 'react-router';
import { NsI18n, useTranslation } from '@booking/i18n';
import type {
  loadPartnerProfileRoute,
  submitPartnerProfileRoute,
} from '~/features/partner-onboarding/server/partner-profile-route.server';
import type { ServerDataFrom } from '~/lib/react-router-data';
import {
  PARTNER_PROFILE_APPLY_ERRORS,
  PARTNER_PROFILE_DEFAULTS,
} from '~/features/partner-onboarding/components/partner-profile-fields';

export interface PartnerProfilePageControllerArgs {
  loaderData: ServerDataFrom<typeof loadPartnerProfileRoute>;
  actionData?: ServerDataFrom<typeof submitPartnerProfileRoute>;
}

export function usePartnerProfilePageController({
  loaderData,
  actionData,
}: PartnerProfilePageControllerArgs) {
  const navigation = useNavigation();
  const submit = useSubmit();
  const { busy: submitting, run } = useSubmissionGuard(navigation.state);
  const { t } = useTranslation([NsI18n.Auth, NsI18n.Common, NsI18n.Legal]);
  const wardsFetcher = useFetcher<{
    provinceCode: string;
    wards: AdministrativeWard[];
  }>();
  const form = useForm<PartnerOnboardingProfileInput>({
    resolver: (values, context, options) =>
      zodResolver(partnerOnboardingProfileSchema)(
        {
          ...values,
          acceptedVersionIds: loaderData.legalConsent.versionIds,
          acceptedLocale: loaderData.legalConsent.acceptedLocale,
        },
        context,
        options,
      ),
    defaultValues: {
      ...PARTNER_PROFILE_DEFAULTS,
      acceptedVersionIds: loaderData.legalConsent.versionIds,
      acceptedLocale: loaderData.legalConsent.acceptedLocale,
    },
    mode: 'onSubmit',
    reValidateMode: 'onBlur',
    shouldUnregister: true,
  });
  const partnerType = useWatch({
    control: form.control,
    name: 'partnerType',
    defaultValue: 'company',
  });
  const provinceCode = useWatch({
    control: form.control,
    name: 'provinceCode',
    defaultValue: '',
  });
  const previousProvinceCode = useRef(provinceCode);
  const loadWards = wardsFetcher.load;

  useEffect(() => {
    if (previousProvinceCode.current !== provinceCode) {
      form.setValue('wardCode', '', { shouldDirty: true, shouldValidate: false });
      previousProvinceCode.current = provinceCode;
    }
    if (provinceCode) {
      void loadWards(
        `/administrative-divisions/wards?provinceCode=${encodeURIComponent(provinceCode)}`,
      );
    }
  }, [form, loadWards, provinceCode]);

  useEffect(() => {
    if (!actionData?.fieldErrors) return;
    for (const [name, messages] of Object.entries(actionData.fieldErrors)) {
      if (messages?.[0]) {
        form.setError(name as Path<PartnerOnboardingProfileInput>, {
          type: 'server',
          message: messages[0],
        });
      }
    }
  }, [actionData?.fieldErrors, form]);

  const errorCode = actionData?.error;
  const errorMessage = errorCode
    ? t(
        PARTNER_PROFILE_APPLY_ERRORS[errorCode as keyof typeof PARTNER_PROFILE_APPLY_ERRORS] ??
          'common:becomePartner.errors.generic',
      )
    : undefined;

  const partnerTypeField = useMemo<FieldConfig<PartnerOnboardingProfileInput>>(
    () => ({
      name: 'partnerType',
      label: t('common:becomePartner.partnerType'),
      type: 'radio',
      variant: 'segmented',
      required: true,
      options: [
        { label: t('common:becomePartner.typeCompany'), value: 'company' },
        { label: t('common:becomePartner.typeIndividual'), value: 'individual' },
      ],
    }),
    [t],
  );

  const provinceOptions = loaderData.provinces.map((province) => ({
    label: province.name,
    value: province.code,
  }));
  const wardsData = wardsFetcher.data;
  const wards = wardsData?.provinceCode === provinceCode ? wardsData.wards : [];
  const wardOptions = wards.map((ward) => ({ label: ward.name, value: ward.code }));
  const wardsLoading = wardsFetcher.state !== 'idle';
  const onSubmit = form.handleSubmit((values) => {
    // Re-assert the immutable loader values at the network boundary as well as
    // in the resolver above; browser form state must never choose legal versions.
    const payload: PartnerOnboardingProfileInput = {
      ...values,
      acceptedVersionIds: loaderData.legalConsent.versionIds,
      acceptedLocale: loaderData.legalConsent.acceptedLocale,
    };
    run(() => submit(payload as never, { method: 'post', encType: 'application/json' }));
  });

  return {
    errorMessage,
    form,
    onSubmit,
    partnerType,
    partnerTypeField,
    provinceCode,
    provinceOptions,
    submitting,
    t,
    wardOptions,
    wardsLoading,
  };
}
