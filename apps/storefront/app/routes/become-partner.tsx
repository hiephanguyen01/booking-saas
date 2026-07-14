import {
  partnerRegistrationSchema,
  type PartnerRegistrationInput,
} from '@booking/shared';
import { AlertCircle, Check, CheckCircle2, Eye, EyeOff, Upload } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { data, Link, useFetcher, useRouteLoaderData } from 'react-router';
import { useT } from '../lib/i18n';
import { applyAsPartner, registerOrLogin, type PartnerApplyPayload } from '../lib/partner.server';
import { resolveTenant } from '../lib/tenant.server';
import type { loader as rootLoader } from '../root';
import type { Route } from './+types/become-partner';

export function meta() {
  return [{ title: 'Đăng ký trở thành đối tác' }, { name: 'robots', content: 'noindex' }];
}

/** Tells root.tsx to hide the SiteHeader and SiteFooter on this page. */
export const handle = { standalone: true };

export async function loader({ request }: Route.LoaderArgs) {
  const tenant = await resolveTenant(request);
  return {
    tenantName: tenant.name,
    tenantLogoUrl: tenant.logoUrl ?? null,
    dashboardUrl: process.env.DASHBOARD_URL ?? 'http://localhost:5174',
  };
}

/** Split the newline-separated license URLs into a clean list. */
function parseLicenseDocs(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function action({ request }: Route.ActionArgs) {
  const tenant = await resolveTenant(request);

  const parsed = partnerRegistrationSchema.safeParse(await request.json());
  if (!parsed.success) {
    return data({ fieldErrors: parsed.error.flatten().fieldErrors, error: null, ok: false }, { status: 400 });
  }
  const v = parsed.data;

  const businessInfo: Record<string, unknown> = {};
  if (v.partnerType === 'company') {
    if (v.legalName?.trim()) businessInfo.legalName = v.legalName.trim();
    businessInfo.taxId = v.taxId!.trim();
    businessInfo.businessRegistrationNo = v.businessRegistrationNo!.trim();
  } else if (v.licenseNo?.trim()) {
    businessInfo.licenseNo = v.licenseNo.trim();
  }
  const licenseDocs = parseLicenseDocs(v.licenseDocs);
  if (licenseDocs.length > 0) businessInfo.licenseDocs = licenseDocs;

  const auth = await registerOrLogin({
    email: v.email.trim(),
    password: v.password,
    fullName: v.fullName.trim(),
    ...(v.phone?.trim() ? { phone: v.phone.trim() } : {}),
  });
  if (!auth.ok) return data({ fieldErrors: null, error: auth.code, ok: false }, { status: 400 });

  const apply: PartnerApplyPayload = {
    tenantId: tenant.id,
    name: v.name.trim(),
    slug: v.slug,
    partnerType: v.partnerType,
    ...(v.description?.trim() ? { description: v.description.trim() } : {}),
    ...(Object.keys(businessInfo).length > 0 ? { businessInfo } : {}),
  };
  const applied = await applyAsPartner(auth.token, apply);
  if (!applied.ok) return data({ fieldErrors: null, error: applied.code, ok: false }, { status: 400 });

  return { fieldErrors: null, error: null, ok: true as const };
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function FieldLabel({ htmlFor, children, required }: { htmlFor: string; children: React.ReactNode; required?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-gray-700">
      {required && <span className="mr-0.5 text-red-500">*</span>}
      {children}
    </label>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
      <AlertCircle className="size-3 shrink-0" />
      {message}
    </p>
  );
}

function TextInput({
  id,
  type = 'text',
  placeholder,
  value,
  onChange,
  error,
  autoComplete,
  disabled,
}: {
  id: string;
  type?: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  autoComplete?: string;
  disabled?: boolean;
}) {
  const [showPwd, setShowPwd] = useState(false);
  const inputType = type === 'password' ? (showPwd ? 'text' : 'password') : type;

  return (
    <div className="relative">
      <input
        id={id}
        type={inputType}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        disabled={disabled}
        className={[
          'h-14 w-full rounded-lg border bg-white px-4 text-sm text-gray-900 outline-none transition-all',
          'placeholder:text-gray-400',
          'focus:border-primary focus:ring-2 focus:ring-primary/20',
          error ? 'border-red-400 focus:border-red-500 focus:ring-red-200' : 'border-gray-300',
          type === 'password' ? 'pr-11' : '',
          disabled ? 'cursor-not-allowed opacity-50' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      />
      {type === 'password' && (
        <button
          type="button"
          onClick={() => setShowPwd((p) => !p)}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
          tabIndex={-1}
          aria-label={showPwd ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
        >
          {showPwd ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      )}
    </div>
  );
}

function TextArea({
  id,
  value,
  onChange,
  placeholder,
  rows = 3,
  error,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  error?: string;
}) {
  return (
    <textarea
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className={[
        'w-full resize-none rounded-lg border bg-white px-4 py-3 text-sm text-gray-900 outline-none transition-all',
        'placeholder:text-gray-400',
        'focus:border-primary focus:ring-2 focus:ring-primary/20',
        error ? 'border-red-400 focus:border-red-500 focus:ring-red-200' : 'border-gray-300',
      ].join(' ')}
    />
  );
}

// function NativeSelect({
//   id,
//   value,
//   onChange,
//   options,
//   placeholder,
//   error,
// }: {
//   id: string;
//   value: string;
//   onChange: (v: string) => void;
//   options: { label: string; value: string }[];
//   placeholder?: string;
//   error?: string;
// }) {
//   return (
//     <select
//       id={id}
//       value={value}
//       onChange={(e) => onChange(e.target.value)}
//       className={[
//         'h-14 w-full cursor-pointer appearance-none rounded-lg border bg-white px-4 text-sm outline-none transition-all',
//         'focus:border-primary focus:ring-2 focus:ring-primary/20',
//         value ? 'text-gray-900' : 'text-gray-400',
//         error ? 'border-red-400 focus:border-red-500 focus:ring-red-200' : 'border-gray-300',
//       ].join(' ')}
//       style={{
//         backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
//         backgroundRepeat: 'no-repeat',
//         backgroundPosition: 'right 12px center',
//       }}
//     >
//       {placeholder && <option value="" disabled>{placeholder}</option>}
//       {options.map((o) => (
//         <option key={o.value} value={o.value}>{o.label}</option>
//       ))}
//     </select>
//   );
// }

function UploadBox({ label, required }: { label: string; required?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const handleFile = useCallback((file: File | undefined) => {
    if (file) setFilename(file.name);
  }, []);

  return (
    <div className="flex flex-col gap-1.5">
      <span className="block text-xs font-medium text-gray-600">
        {required && <span className="mr-0.5 text-red-500">*</span>}
        {label}
      </span>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFile(e.dataTransfer.files[0]);
        }}
        className={[
          'flex h-36 w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed transition-all',
          dragging
            ? 'border-primary bg-primary/5'
            : filename
            ? 'border-green-400 bg-green-50'
            : 'border-gray-200 bg-gray-50 hover:border-primary/40 hover:bg-primary/5',
        ].join(' ')}
      >
        {filename ? (
          <>
            <Check className="size-6 text-green-500" />
            <span className="max-w-[90%] truncate text-xs text-gray-600">{filename}</span>
          </>
        ) : (
          <>
            <Upload className="size-6 text-gray-400" />
            <span className="text-xs text-gray-500">Tải lên</span>
          </>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.pdf"
        className="sr-only"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const DEFAULTS: PartnerRegistrationInput = {
  fullName: '',
  email: '',
  password: '',
  phone: '',
  name: '',
  slug: '',
  partnerType: 'individual',
  description: '',
  legalName: '',
  taxId: '',
  businessRegistrationNo: '',
  licenseNo: '',
  licenseDocs: '',
};

export default function BecomePartner({ loaderData, actionData }: Route.ComponentProps) {
  const { tenantName, tenantLogoUrl, dashboardUrl } = loaderData;
  const { t } = useT();
  const fetcher = useFetcher<typeof action>();

  const [form, setForm] = useState<PartnerRegistrationInput>(DEFAULTS);
  const [agreed, setAgreed] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const isCompany = form.partnerType === 'company';
  const isSubmitting = fetcher.state !== 'idle';
  const isSuccess = fetcher.data?.ok === true || actionData?.ok === true;

  const fieldErrors = fetcher.data?.fieldErrors ?? actionData?.fieldErrors ?? null;
  const serverError = (() => {
    const code = fetcher.data?.error ?? actionData?.error;
    return code ? (t )(`becomePartner.errors.${code}`) : null;
  })();

  const rootData = useRouteLoaderData<typeof rootLoader>('root');
  const logoUrl = tenantLogoUrl ?? (rootData?.tenant?.logoUrl ?? null);

  function set<K extends keyof PartnerRegistrationInput>(key: K, value: PartnerRegistrationInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function autoSlug(name: string) {
    const slug = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    set('slug', slug);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!agreed) { setSubmitted(true); return; }
    setSubmitted(true);
    fetcher.submit(form, { method: 'post', encType: 'application/json' });
  }

  // ── Nav ──────────────────────────────────────────────────────────────────
  const Nav = (
    <nav className="flex h-[72px] items-center justify-between border-b border-gray-100 px-6 lg:px-10">
      <Link to="/" className="flex items-center">
        {logoUrl ? (
          <img src={logoUrl} alt={tenantName} className="h-9 w-auto max-w-40 object-contain" />
        ) : (
          <span className="text-lg font-bold tracking-tight text-primary">{tenantName}</span>
        )}
      </Link>
      <Link
        to="/"
        className="flex h-10 items-center rounded-lg border border-gray-200 px-5 text-sm font-medium text-gray-700 transition-all hover:border-primary hover:text-primary"
      >
        Đăng nhập
      </Link>
    </nav>
  );

  // ── Success state ─────────────────────────────────────────────────────────
  if (isSuccess) {
    return (
      <div className="min-h-dvh bg-white">
        {Nav}
        <main className="flex min-h-[calc(100dvh-72px)] items-center justify-center px-6 py-20">
          <div className="w-full max-w-[570px] rounded-2xl border border-gray-100 bg-white p-10 text-center shadow-sm">
            <div className="mx-auto mb-6 flex size-[104px] items-center justify-center rounded-full bg-green-50">
              <CheckCircle2 className="size-14 text-green-500" strokeWidth={1.5} />
            </div>
            <h1 className="mb-3 text-2xl font-bold uppercase tracking-widest text-gray-900">
              Hoàn tất đăng ký tài khoản
            </h1>
            <p className="mb-8 text-sm leading-relaxed text-gray-500">
              Hợp đồng đối tác và thông tin tài khoản của bạn đã được gửi tới địa chỉ email đăng ký.
            </p>
            <a
              href={`${dashboardUrl}/auth/login`}
              className="inline-flex h-14 w-full items-center justify-center rounded-lg bg-primary px-8 text-sm font-semibold text-primary-foreground transition-all hover:opacity-90 active:scale-[0.98]"
            >
              Đến trang quản trị
            </a>
          </div>
        </main>
      </div>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-dvh bg-white">
      {Nav}

      <main className="mx-auto max-w-[1170px] px-6 py-10 lg:px-10">
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="p-8 lg:p-10">
            {/* Page title */}
            <h1 className="mb-8 text-2xl font-bold uppercase tracking-widest text-gray-900">
              Đăng ký trở thành đối tác
            </h1>

            <fetcher.Form onSubmit={handleSubmit} noValidate>
              {/* ── Row 1: Full name + Phone ── */}
              <div className="mb-6 grid gap-6 md:grid-cols-2">
                <div>
                  <FieldLabel htmlFor="fullName" required>Họ và tên đại diện</FieldLabel>
                  <TextInput
                    id="fullName"
                    value={form.fullName}
                    onChange={(v) => set('fullName', v)}
                    placeholder="Nguyễn Văn A"
                    autoComplete="name"
                    error={fieldErrors?.fullName?.[0]}
                  />
                  <FieldError message={fieldErrors?.fullName?.[0]} />
                </div>
                <div>
                  <FieldLabel htmlFor="phone">Số điện thoại</FieldLabel>
                  <TextInput
                    id="phone"
                    value={form.phone ?? ''}
                    onChange={(v) => set('phone', v)}
                    placeholder="0912 345 678"
                    autoComplete="tel"
                    error={fieldErrors?.phone?.[0]}
                  />
                  <FieldError message={fieldErrors?.phone?.[0]} />
                </div>
              </div>

              {/* ── Partner type toggle ── */}
              <div className="mb-8">
                <p className="mb-3 text-sm font-medium text-gray-700">Loại đối tác</p>
                <div className="flex gap-4">
                  {[
                    { value: 'individual', label: 'Cá nhân' },
                    { value: 'company', label: 'Doanh nghiệp' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => set('partnerType', opt.value as 'individual' | 'company')}
                      className={[
                        'flex h-14 min-w-[240px] items-center justify-center rounded-lg border text-sm font-semibold transition-all',
                        form.partnerType === opt.value
                          ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-primary/40 hover:text-primary',
                      ].join(' ')}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Two-column section ── */}
              <div className="grid gap-x-8 gap-y-5 lg:grid-cols-2">
                {/* ── Left column ── */}
                <div className="flex flex-col gap-5">
                  <div>
                    <FieldLabel htmlFor="name" required>Tên studio / đối tác</FieldLabel>
                    <TextInput
                      id="name"
                      value={form.name}
                      onChange={(v) => {
                        set('name', v);
                        if (!form.slug) autoSlug(v);
                      }}
                      placeholder="Tên hiển thị công khai"
                      error={fieldErrors?.name?.[0]}
                    />
                    <FieldError message={fieldErrors?.name?.[0]} />
                  </div>

                  <div>
                    <FieldLabel htmlFor="email" required>Email đăng nhập</FieldLabel>
                    <TextInput
                      id="email"
                      type="email"
                      value={form.email}
                      onChange={(v) => set('email', v)}
                      placeholder="email@example.com"
                      autoComplete="email"
                      error={fieldErrors?.email?.[0]}
                    />
                    <FieldError message={fieldErrors?.email?.[0]} />
                  </div>

                  <div>
                    <FieldLabel htmlFor="password" required>Mật khẩu</FieldLabel>
                    <TextInput
                      id="password"
                      type="password"
                      value={form.password}
                      onChange={(v) => set('password', v)}
                      placeholder="Tối thiểu 8 ký tự"
                      autoComplete="new-password"
                      error={fieldErrors?.password?.[0]}
                    />
                    <FieldError message={fieldErrors?.password?.[0]} />
                  </div>

                  <div>
                    <FieldLabel htmlFor="slug" required>Đường dẫn (slug)</FieldLabel>
                    <TextInput
                      id="slug"
                      value={form.slug}
                      onChange={(v) => set('slug', v)}
                      placeholder="ten-studio"
                      error={fieldErrors?.slug?.[0]}
                    />
                    <p className="mt-1 text-xs text-gray-400">Chữ thường, số và dấu gạch ngang.</p>
                    <FieldError message={fieldErrors?.slug?.[0]} />
                  </div>

                  <div>
                    <FieldLabel htmlFor="description">Giới thiệu</FieldLabel>
                    <TextArea
                      id="description"
                      value={form.description ?? ''}
                      onChange={(v) => set('description', v)}
                      placeholder="Mô tả ngắn về studio của bạn..."
                      rows={3}
                      error={fieldErrors?.description?.[0]}
                    />
                    <FieldError message={fieldErrors?.description?.[0]} />
                  </div>

                  {/* Company-only fields */}
                  {isCompany && (
                    <>
                      <div>
                        <FieldLabel htmlFor="legalName">Tên pháp lý</FieldLabel>
                        <TextInput
                          id="legalName"
                          value={form.legalName ?? ''}
                          onChange={(v) => set('legalName', v)}
                          placeholder="Tên công ty theo giấy phép"
                          error={fieldErrors?.legalName?.[0]}
                        />
                        <FieldError message={fieldErrors?.legalName?.[0]} />
                      </div>
                      <div>
                        <FieldLabel htmlFor="taxId" required>Mã số thuế</FieldLabel>
                        <TextInput
                          id="taxId"
                          value={form.taxId ?? ''}
                          onChange={(v) => set('taxId', v)}
                          placeholder="0123456789"
                          error={fieldErrors?.taxId?.[0]}
                        />
                        <FieldError message={fieldErrors?.taxId?.[0]} />
                      </div>
                      <div>
                        <FieldLabel htmlFor="businessRegistrationNo" required>Số giấy phép kinh doanh</FieldLabel>
                        <TextInput
                          id="businessRegistrationNo"
                          value={form.businessRegistrationNo ?? ''}
                          onChange={(v) => set('businessRegistrationNo', v)}
                          placeholder="0123456789"
                          error={fieldErrors?.businessRegistrationNo?.[0]}
                        />
                        <FieldError message={fieldErrors?.businessRegistrationNo?.[0]} />
                      </div>
                    </>
                  )}

                  {/* Individual-only: license no */}
                  {!isCompany && (
                    <div>
                      <FieldLabel htmlFor="licenseNo">Số giấy phép / chứng chỉ</FieldLabel>
                      <TextInput
                        id="licenseNo"
                        value={form.licenseNo ?? ''}
                        onChange={(v) => set('licenseNo', v)}
                        placeholder="Tuỳ chọn"
                        error={fieldErrors?.licenseNo?.[0]}
                      />
                      <FieldError message={fieldErrors?.licenseNo?.[0]} />
                    </div>
                  )}

                  {/* Privacy notice */}
                  <div className="mt-2">
                    <p className="text-xs leading-relaxed text-gray-400">
                      Bằng việc nhấn vào nút đăng ký, anh/chị đồng ý rằng Booking Studio có thể thu thập, sử dụng và
                      tiết lộ thông tin do anh/chị cung cấp, thay mặt cho công ty đăng ký. Theo Phụ lục 1: NGUYÊN TẮC
                      QUYỀN RIÊNG TƯ DỮ LIỆU VÀ NHẮN TIN trong Hợp đồng đối tác.
                    </p>
                    <label className="mt-3 flex cursor-pointer items-start gap-3">
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={agreed}
                        onClick={() => setAgreed((a) => !a)}
                        className={[
                          'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border-2 transition-all',
                          agreed
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-gray-300 bg-white hover:border-primary/50',
                          submitted && !agreed ? 'border-red-400' : '',
                        ].join(' ')}
                      >
                        {agreed && <Check className="size-3" strokeWidth={3} />}
                      </button>
                      <span className="text-sm text-gray-600">
                        Tôi đồng ý với Hợp đồng đối tác của Booking Studio
                      </span>
                    </label>
                    {submitted && !agreed && (
                      <p className="mt-1 text-xs text-red-500">Vui lòng đồng ý với điều khoản để tiếp tục.</p>
                    )}
                  </div>
                </div>

                {/* ── Right column ── */}
                <div className="flex flex-col gap-5">
                  {isCompany ? (
                    <>
                      <div>
                        <p className="mb-3 text-sm font-medium text-gray-700">Giấy phép kinh doanh (GPKD)</p>
                        <div className="grid grid-cols-2 gap-4">
                          <UploadBox label="Mặt trước GPKD" required />
                          <UploadBox label="Mặt sau GPKD" required />
                        </div>
                      </div>
                      <div>
                        <p className="mb-3 text-sm font-medium text-gray-700">CMND/CCCD người đại diện</p>
                        <div className="grid grid-cols-2 gap-4">
                          <UploadBox label="Mặt trước CMND/CCCD" />
                          <UploadBox label="Mặt sau CMND/CCCD" />
                        </div>
                      </div>
                    </>
                  ) : (
                    <div>
                      <p className="mb-3 text-sm font-medium text-gray-700">CMND/CCCD</p>
                      <div className="grid grid-cols-2 gap-4">
                        <UploadBox label="Mặt trước CMND/CCCD" required />
                        <UploadBox label="Mặt sau CMND/CCCD" required />
                      </div>
                    </div>
                  )}

                  {/* License document URL */}
                  <div>
                    <FieldLabel htmlFor="licenseDocs">Đường dẫn giấy phép</FieldLabel>
                    <TextArea
                      id="licenseDocs"
                      value={form.licenseDocs ?? ''}
                      onChange={(v) => set('licenseDocs', v)}
                      placeholder="https://drive.google.com/..."
                      rows={3}
                      error={fieldErrors?.licenseDocs?.[0]}
                    />
                    <p className="mt-1 text-xs text-gray-400">Mỗi dòng một đường dẫn (http:// hoặc https://).</p>
                    <FieldError message={fieldErrors?.licenseDocs?.[0]} />
                  </div>

                  {/* Province select */}
                  <div>
                    <FieldLabel htmlFor="province">Tỉnh / thành phố</FieldLabel>
                    <select
                      id="province"
                      defaultValue=""
                      className="h-14 w-full cursor-pointer appearance-none rounded-lg border border-gray-300 bg-white px-4 text-sm text-gray-400 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                      style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'right 12px center',
                      }}
                    >
                      <option value="" disabled>Chọn tỉnh / thành phố</option>
                      <option>TP Hồ Chí Minh</option>
                      <option>Hà Nội</option>
                      <option>Đà Nẵng</option>
                      <option>Cần Thơ</option>
                    </select>
                  </div>

                  {/* District select */}
                  <div>
                    <FieldLabel htmlFor="district">Quận / huyện</FieldLabel>
                    <select
                      id="district"
                      defaultValue=""
                      className="h-14 w-full cursor-pointer appearance-none rounded-lg border border-gray-300 bg-white px-4 text-sm text-gray-400 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                      style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'right 12px center',
                      }}
                    >
                      <option value="" disabled>Chọn quận / huyện</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* ── Server error ── */}
              {serverError && (
                <div className="mt-6 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  <AlertCircle className="size-4 shrink-0" />
                  {serverError}
                </div>
              )}

              {/* ── Submit ── */}
              <div className="mt-8 flex justify-center">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex h-14 w-full max-w-[400px] items-center justify-center rounded-lg bg-primary px-8 text-sm font-semibold text-primary-foreground transition-all hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting ? 'Đang gửi…' : 'Đăng ký'}
                </button>
              </div>
            </fetcher.Form>
          </div>
        </div>
      </main>
    </div>
  );
}
