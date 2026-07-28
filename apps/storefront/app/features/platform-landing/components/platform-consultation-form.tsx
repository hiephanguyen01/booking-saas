import { AlertCircle, CheckCircle2, LoaderCircle } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { NsI18n, useTranslation } from '@booking/i18n';

export interface ConsultationLead {
  name: string;
  phone: string;
  business: string;
  service: string;
}

type SubmitResult = { ok: true } | { ok: false; message?: string };
type SubmitLead = (lead: ConsultationLead) => Promise<SubmitResult>;
type FormStatus = 'idle' | 'submitting' | 'success' | 'error' | 'unavailable';
type FieldName = keyof ConsultationLead;
type FieldErrors = Partial<Record<FieldName, string>>;

const VIETNAMESE_PHONE = /^(?:\+?84|0)(?:\d[ .-]?){8,10}\d$/;

export function PlatformConsultationForm({ submitLead }: { submitLead?: SubmitLead }) {
  const { t } = useTranslation(NsI18n.Platform);
  const formId = useId();
  const [status, setStatus] = useState<FormStatus>('idle');
  const [errors, setErrors] = useState<FieldErrors>({});
  const refs = {
    name: useRef<HTMLInputElement>(null),
    phone: useRef<HTMLInputElement>(null),
    business: useRef<HTMLInputElement>(null),
    service: useRef<HTMLSelectElement>(null),
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const lead: ConsultationLead = {
      name: String(formData.get('name') ?? '').trim(),
      phone: String(formData.get('phone') ?? '').trim(),
      business: String(formData.get('business') ?? '').trim(),
      service: String(formData.get('service') ?? '').trim(),
    };
    const nextErrors = validateLead(lead, {
      name: t('consultation.nameError'),
      phone: t('consultation.phoneError'),
      business: t('consultation.businessError'),
      service: t('consultation.serviceError'),
    });

    setErrors(nextErrors);
    setStatus('idle');

    const firstInvalid = (Object.keys(nextErrors) as FieldName[])[0];
    if (firstInvalid) {
      refs[firstInvalid].current?.focus();
      return;
    }

    if (!submitLead) {
      setStatus('unavailable');
      return;
    }

    setStatus('submitting');
    try {
      const result = await submitLead(lead);
      setStatus(result.ok ? 'success' : 'error');
      if (result.ok) event.currentTarget.reset();
    } catch {
      setStatus('error');
    }
  };

  return (
    <form className="grid gap-5" noValidate onSubmit={handleSubmit}>
      <div className="grid gap-5">
        <FormField
          id={`${formId}-name`}
          name="name"
          label={t('consultation.nameLabel')}
          placeholder={t('consultation.namePlaceholder')}
          error={errors.name}
          inputRef={refs.name}
          autoComplete="name"
        />
        <FormField
          id={`${formId}-phone`}
          name="phone"
          label={t('consultation.phoneLabel')}
          placeholder={t('consultation.phonePlaceholder')}
          error={errors.phone}
          inputRef={refs.phone}
          autoComplete="tel"
          inputMode="tel"
        />
        <FormField
          id={`${formId}-business`}
          name="business"
          label={t('consultation.businessLabel')}
          placeholder={t('consultation.businessPlaceholder')}
          error={errors.business}
          inputRef={refs.business}
          autoComplete="organization"
        />
        <div className="grid content-start gap-2">
          <label htmlFor={`${formId}-service`} className="text-sm font-semibold text-[#f4f5f7]">
            {t('consultation.serviceLabel')}{' '}
            <span className="text-xs font-medium text-[#ffb020]">
              ({t('consultation.required')})
            </span>
          </label>
          <select
            ref={refs.service}
            id={`${formId}-service`}
            name="service"
            defaultValue=""
            aria-invalid={errors.service ? true : undefined}
            aria-describedby={errors.service ? `${formId}-service-error` : undefined}
            className="platform-form-control"
          >
            <option value="" disabled>
              {t('consultation.servicePlaceholder')}
            </option>
            <option value="studio">{t('consultation.options.studio')}</option>
            <option value="sport">{t('consultation.options.sport')}</option>
            <option value="class">{t('consultation.options.class')}</option>
            <option value="appointment">{t('consultation.options.appointment')}</option>
            <option value="stay">{t('consultation.options.stay')}</option>
            <option value="inventory">{t('consultation.options.inventory')}</option>
            <option value="other">{t('consultation.options.other')}</option>
          </select>
          {errors.service ? (
            <p id={`${formId}-service-error`} className="platform-field-error">
              <AlertCircle className="size-4" aria-hidden="true" />
              {errors.service}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 border-t border-[#232a34] pt-5">
        <p className="text-xs leading-5 text-[#9aa0a9]">{t('consultation.privacyNote')}</p>
        <button
          type="submit"
          disabled={status === 'submitting'}
          className="platform-primary-button w-full disabled:cursor-wait disabled:opacity-70"
        >
          {status === 'submitting' ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : null}
          {status === 'submitting' ? t('consultation.submitting') : t('consultation.submit')}
        </button>
      </div>

      <FormStatusMessage status={status} />
    </form>
  );
}

function FormField({
  id,
  name,
  label,
  placeholder,
  error,
  inputRef,
  autoComplete,
  inputMode,
}: {
  id: string;
  name: FieldName;
  label: string;
  placeholder: string;
  error?: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  autoComplete: React.HTMLInputAutoCompleteAttribute;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
}) {
  const { t } = useTranslation(NsI18n.Platform);

  return (
    <div className="grid content-start gap-2">
      <label htmlFor={id} className="text-sm font-semibold text-[#f4f5f7]">
        {label}{' '}
        <span className="text-xs font-medium text-[#ffb020]">({t('consultation.required')})</span>
      </label>
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="text"
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="platform-form-control"
      />
      {error ? (
        <p id={`${id}-error`} className="platform-field-error">
          <AlertCircle className="size-4" aria-hidden="true" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

function FormStatusMessage({ status }: { status: FormStatus }) {
  const { t } = useTranslation(NsI18n.Platform);
  if (status === 'idle' || status === 'submitting') return null;

  const success = status === 'success';
  const unavailable = status === 'unavailable';
  const title = success
    ? t('consultation.successTitle')
    : unavailable
      ? t('consultation.unavailableTitle')
      : t('consultation.errorTitle');
  const description = success
    ? t('consultation.successDescription')
    : unavailable
      ? t('consultation.unavailableDescription')
      : t('consultation.errorDescription');

  return (
    <div
      role={success ? 'status' : 'alert'}
      aria-live={success ? 'polite' : 'assertive'}
      className={`flex gap-3 rounded-xl border p-4 text-sm leading-6 ${
        success
          ? 'border-[#1e4029] bg-[#0e2015] text-[#bfe9cc]'
          : unavailable
            ? 'border-[#4a3a12] bg-[#221a0a] text-[#e6d9be]'
            : 'border-[#4a2020] bg-[#2a1414] text-[#f0c9c4]'
      }`}
    >
      {success ? (
        <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      ) : (
        <AlertCircle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      )}
      <div>
        <p className="font-bold">{title}</p>
        <p className="mt-0.5">{description}</p>
      </div>
    </div>
  );
}

function validateLead(lead: ConsultationLead, messages: Record<FieldName, string>): FieldErrors {
  const errors: FieldErrors = {};
  if (lead.name.length < 2) errors.name = messages.name;
  if (!VIETNAMESE_PHONE.test(lead.phone.replace(/[()]/g, ''))) errors.phone = messages.phone;
  if (lead.business.length < 2) errors.business = messages.business;
  if (!lead.service) errors.service = messages.service;
  return errors;
}
