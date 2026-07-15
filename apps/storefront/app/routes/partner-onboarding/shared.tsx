import { AlertCircle, Eye, EyeOff, Mail } from 'lucide-react';
import type { Locale } from '@booking/i18n';
import { useState, type ReactNode } from 'react';
import { Link, useNavigation } from 'react-router';
import { storefrontPaths } from '../../lib/locale-paths';

export function PromoPanel() {
  return (
    <section className="flex w-full max-w-[486px] flex-col">
      <h1 className="text-[34px] font-semibold leading-[1.55] tracking-[-0.025em] text-[#161616] sm:text-[40px] sm:leading-[1.4]">
        Tăng Doanh Thu và
        <br />
        Hiệu Quả Truyền Thông
      </h1>
      <p className="mt-3 max-w-[448px] text-sm font-medium leading-6 text-[#667085]">
        Trở thành đối tác của BOOKING STUDIO khiến việc kinh doanh của bạn dễ dàng hơn bao giờ hết.
        Hãy cùng nhau bắt đầu nhé!
      </p>
      <img
        src="/images/partner-onboarding/growth-illustration.svg"
        alt="Biểu đồ tăng trưởng của đối tác Booking Studio"
        className="mx-auto mt-10 w-full"
      />
    </section>
  );
}

export function AuthSplit({ children, tall = false }: { children: ReactNode; tall?: boolean }) {
  return (
    <main className="mx-auto grid w-full max-w-292.5 grid-cols-1 gap-10 px-5 pb-16 lg:grid-cols-[486px_566px] lg:justify-between lg:px-0 lg:pt-10">
      <div className="hidden lg:block">
        <PromoPanel />
      </div>
      <section
        className={`w-full self-center bg-white px-6 py-10 shadow-[0_4px_7.5px_rgba(0,0,0,0.07)] sm:px-10 ${tall ? 'min-h-[548px]' : ''}`}
      >
        {children}
      </section>
    </main>
  );
}

export function FormHeading({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <div className="mb-10">
      <h2 className="text-2xl font-semibold leading-9 text-[#161616]">{title}</h2>
      {description ? (
        <div className="mt-6 text-base font-medium leading-6 text-[#667085]">{description}</div>
      ) : null}
    </div>
  );
}

export function FieldError({ children }: { children?: ReactNode }) {
  return children ? (
    <p role="alert" className="mt-2 flex items-center gap-1.5 text-sm text-[#f43f3f]">
      <AlertCircle className="size-4 shrink-0" />
      {children}
    </p>
  ) : null;
}

export function EmailField({ defaultValue, error }: { defaultValue?: string; error?: string }) {
  return (
    <label className="block text-sm font-medium text-[#344054]">
      Vui lòng đăng ký tài khoản email
      <span className="relative mt-2 block">
        <Mail className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-[#667085]" />
        <input
          name="email"
          type="email"
          defaultValue={defaultValue}
          autoComplete="email"
          autoFocus
          aria-invalid={Boolean(error)}
          className="h-14 w-full rounded-sm border border-[#d0d5dd] bg-white pl-12 pr-4 text-base font-medium outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 aria-invalid:border-[#f43f3f]"
          placeholder="abc@email.com"
        />
      </span>
      <FieldError>{error}</FieldError>
    </label>
  );
}

export function PasswordField({
  name,
  label,
  error,
  autoFocus,
}: {
  name: string;
  label: string;
  error?: string;
  autoFocus?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="block text-sm font-medium text-[#344054]">
      {label}
      <span className="relative mt-2 block">
        <input
          name={name}
          type={visible ? 'text' : 'password'}
          autoComplete="new-password"
          autoFocus={autoFocus}
          aria-invalid={Boolean(error)}
          className="h-14 w-full rounded-sm border border-[#d0d5dd] px-4 pr-12 text-base font-medium outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 aria-invalid:border-[#f43f3f]"
          placeholder="••••••••"
        />
        <button
          type="button"
          onClick={() => setVisible((value) => !value)}
          className="absolute right-3 top-1/2 grid size-8 -translate-y-1/2 place-items-center text-[#667085]"
          aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
        >
          {visible ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
        </button>
      </span>
      <FieldError>{error}</FieldError>
    </label>
  );
}

export function PrimaryButton({ children }: { children: ReactNode }) {
  const navigation = useNavigation();
  return (
    <button
      type="submit"
      disabled={navigation.state === 'submitting'}
      className="flex h-14 w-full items-center justify-center rounded-sm bg-primary px-6 text-base font-semibold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
    >
      {navigation.state === 'submitting' ? 'Đang xử lý…' : children}
    </button>
  );
}

export function LoginPrompt({ locale }: { locale: Locale }) {
  return (
    <p className="mt-10 text-center text-sm font-medium text-[#667085]">
      Bạn đã có tài khoản?{' '}
      <Link
        to={storefrontPaths.login(locale, storefrontPaths.becomePartner(locale))}
        className="font-semibold text-primary hover:underline"
      >
        Đăng nhập
      </Link>
    </p>
  );
}

export function FormAlert({ children }: { children?: ReactNode }) {
  return children ? (
    <div
      role="alert"
      className="mb-5 flex gap-2 rounded-sm border border-[#f43f3f]/30 bg-[#fff4f4] px-4 py-3 text-sm text-[#c93434]"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      {children}
    </div>
  ) : null;
}
