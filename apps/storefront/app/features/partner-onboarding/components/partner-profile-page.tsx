import { FieldRenderer } from '@booking/ui/components/form/field-renderer';
import { Button } from '@booking/ui/components/ui/button';
import { Field, FieldLabel } from '@booking/ui/components/ui/field';
import { Form } from '@booking/ui/components/ui/form';
import { Spinner } from '@booking/ui/components/ui/spinner';
import type { Route } from '../../../routes/partner-onboarding/+types/profile';
import { FormAlert } from '~/routes/partner-onboarding/shared';
import {
  PARTNER_PROFILE_BANKS,
  PartnerDocumentPair,
  partnerProfileTextField,
} from './partner-profile-fields';
import { usePartnerProfilePageController } from './use-partner-profile-page-controller';

export function PartnerProfilePage({ loaderData, actionData }: Route.ComponentProps) {
  const {
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
  } = usePartnerProfilePageController({ loaderData, actionData });

  return (
    <main className="mx-auto w-full max-w-[1170px] px-4 pb-16 sm:px-6 lg:px-0">
      <section className="bg-card p-6 text-card-foreground shadow-sm sm:p-10">
        <h1 className="mb-6 text-2xl font-semibold uppercase leading-9">
          {t('common:becomePartner.title')}
        </h1>
        <FormAlert>{errorMessage}</FormAlert>
        <Form {...form}>
          <form onSubmit={onSubmit} noValidate aria-busy={submitting}>
            <fieldset disabled={submitting} className="m-0 min-w-0 border-0 p-0">
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-x-10">
                <Field>
                  <FieldLabel htmlFor="partner-email">{t('common:becomePartner.email')}</FieldLabel>
                  {/* Not an Input: a read-only echo of the verified email. It is
                      hand-matched to the Input primitive's geometry (h-11 px-4,
                      text-base md:text-sm) because it has to line up with the real
                      field beside it. */}
                  <output
                    id="partner-email"
                    className="flex h-11 items-center rounded-md border border-input bg-muted px-4 text-base text-muted-foreground md:text-sm"
                  >
                    {loaderData.email}
                  </output>
                </Field>
                <FieldRenderer
                  field={partnerProfileTextField('name', t('common:becomePartner.partnerName'), t)}
                />
              </div>
              <div className="mt-6">
                <FieldRenderer field={partnerTypeField} />
              </div>
              <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-x-10">
                <div className="space-y-4">
                  {partnerType === 'company' ? (
                    <>
                      <FieldRenderer
                        field={partnerProfileTextField(
                          'companyName',
                          t('common:becomePartner.companyName'),
                          t,
                        )}
                      />
                      <FieldRenderer
                        field={partnerProfileTextField(
                          'businessRegistrationNo',
                          t('common:becomePartner.businessRegistrationNo'),
                          t,
                        )}
                      />
                    </>
                  ) : null}
                  <FieldRenderer
                    field={partnerProfileTextField(
                      'representativeName',
                      t('common:becomePartner.representative'),
                      t,
                    )}
                  />
                  <FieldRenderer
                    field={partnerProfileTextField(
                      'identityNumber',
                      t('common:becomePartner.identityNumber'),
                      t,
                    )}
                  />
                  <FieldRenderer
                    field={{
                      name: 'provinceCode',
                      label: t('common:becomePartner.province'),
                      type: 'combobox',
                      required: true,
                      placeholder: t('auth:partner.selectProvince'),
                      searchPlaceholder: t('auth:partner.searchProvince'),
                      options: provinceOptions,
                    }}
                  />
                  <FieldRenderer
                    field={{
                      name: 'wardCode',
                      label: t('auth:partner.wardLabel'),
                      type: 'combobox',
                      required: true,
                      disabled: !provinceCode || wardsLoading,
                      placeholder: wardsLoading
                        ? t('auth:partner.wardLoading')
                        : provinceCode
                          ? t('auth:partner.selectWard')
                          : t('auth:partner.wardNeedsProvince'),
                      searchPlaceholder: t('auth:partner.searchWard'),
                      options: wardOptions,
                    }}
                  />
                  <FieldRenderer
                    field={partnerProfileTextField('address', t('common:becomePartner.address'), t)}
                  />
                  <div className="space-y-4 pt-1 text-base leading-6 text-foreground">
                    <p>{t('auth:partner.privacyNotice', { tenant: loaderData.tenantName })}</p>
                    <FieldRenderer
                      field={{
                        name: 'acceptedTerms',
                        type: 'checkbox',
                        label: t('auth:partner.acceptTerms', { tenant: loaderData.tenantName }),
                        required: true,
                      }}
                    />
                  </div>
                </div>
                <div className="space-y-4">
                  <PartnerDocumentPair company={partnerType === 'company'} t={t} />
                  {partnerType === 'company' ? <PartnerDocumentPair company={false} t={t} /> : null}
                  <FieldRenderer
                    field={partnerProfileTextField('phone', t('common:becomePartner.phone'), t)}
                  />
                  <FieldRenderer
                    field={{
                      name: 'bank',
                      label: t('common:becomePartner.bank'),
                      type: 'combobox',
                      required: true,
                      placeholder: t('auth:partner.selectBank'),
                      searchPlaceholder: t('auth:partner.searchBank'),
                      options: PARTNER_PROFILE_BANKS,
                    }}
                  />
                  <FieldRenderer
                    field={partnerProfileTextField(
                      'bankAccountNumber',
                      t('common:becomePartner.bankAccountNumber'),
                      t,
                    )}
                  />
                  <FieldRenderer
                    field={partnerProfileTextField(
                      'bankAccountHolder',
                      t('common:becomePartner.bankAccountHolder'),
                      t,
                    )}
                  />
                </div>
              </div>
              <div className="mt-10 flex justify-center">
                <Button
                  type="submit"
                  size="control"
                  disabled={submitting}
                  className="w-full max-w-[400px] text-base"
                >
                  {submitting ? <Spinner data-icon="inline-start" /> : null}
                  {t('common:becomePartner.submit')}
                </Button>
              </div>
            </fieldset>
          </form>
        </Form>
      </section>
    </main>
  );
}
