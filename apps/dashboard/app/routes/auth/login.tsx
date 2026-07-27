import { data, redirect } from 'react-router';
import { loginInputSchema, type LoginInput } from '@booking/contracts';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import type { FieldConfig } from '@booking/ui/components/form/types';
import { ArrowRight, CalendarCheck2, Check, ShieldCheck } from 'lucide-react';
import type { Route } from './+types/login';
import { backendLogin, backendSessionInfo } from '~/lib/api.server';
import { getOptionalUser, loadSessionInfo } from '~/lib/auth.server';
import { createUserSession } from '~/lib/session.server';
import { defaultDashboardPath } from '~/lib/workspace';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Đăng nhập · BookingOS Dashboard' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getOptionalUser(request);
  if (user) {
    const info = await loadSessionInfo(request);
    if (info) throw redirect(defaultDashboardPath(info));
  }
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  const parsed = loginInputSchema.safeParse(await request.json());
  if (!parsed.success) {
    return data({ fieldErrors: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const result = await backendLogin(parsed.data);
  if (!result.ok || !result.tokens || !result.user) {
    const message =
      result.code === 'ACCOUNT_LOCKED'
        ? 'Tài khoản tạm thời bị khoá do đăng nhập sai nhiều lần. Vui lòng thử lại sau ít phút.'
        : result.status === 503
          ? 'Không kết nối được máy chủ. Vui lòng thử lại.'
          : 'Email hoặc mật khẩu không đúng.';
    return data({ error: message }, { status: 400 });
  }

  const info = await backendSessionInfo(result.tokens.accessToken);
  const area = info ? defaultDashboardPath(info) : '/';
  return createUserSession(request, { ...result.tokens, userId: result.user.id }, area);
}

const fields: FieldConfig<LoginInput>[] = [
  {
    name: 'email',
    type: 'email',
    label: 'Email',
    placeholder: 'ban@congty.vn',
    autoComplete: 'email',
  },
  {
    name: 'password',
    type: 'password',
    label: 'Mật khẩu',
    autoComplete: 'current-password',
  },
];

export default function LoginPage({ actionData }: Route.ComponentProps) {
  const serverError = actionData && 'error' in actionData ? actionData.error : null;
  const fieldErrors = actionData && 'fieldErrors' in actionData ? actionData.fieldErrors : null;

  return (
    <main className="grid min-h-[100dvh] bg-background lg:grid-cols-[minmax(0,1.08fr)_minmax(440px,0.92fr)]">
      <section className="auth-brand-panel relative hidden overflow-hidden bg-[#10281f] text-[#f4f7f5] lg:flex lg:min-h-[100dvh] lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        <div className="relative flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl border border-white/15 bg-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
            <CalendarCheck2 aria-hidden="true" className="size-5 text-[#83d5a8]" strokeWidth={1.8} />
          </span>
          <div>
            <p className="text-lg font-semibold tracking-[-0.02em]">BookingOS</p>
            <p className="text-xs font-medium text-white/55">Workspace</p>
          </div>
        </div>

        <div className="relative max-w-xl py-16">
          <p className="mb-5 text-sm font-medium text-[#83d5a8]">Vận hành tập trung</p>
          <h1 className="max-w-lg text-4xl font-semibold leading-[1.12] tracking-[-0.045em] xl:text-5xl">
            Mọi hoạt động đặt chỗ, trong một không gian quản trị.
          </h1>
          <p className="mt-6 max-w-md text-base leading-7 text-white/65">
            Theo dõi lịch, đối tác và doanh thu với quy trình rõ ràng cho từng vai trò trong doanh
            nghiệp.
          </p>

          <div className="mt-10 grid max-w-md gap-4 text-sm text-white/78 sm:grid-cols-2">
            <div className="flex items-center gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white/10 text-[#83d5a8]">
                <Check aria-hidden="true" className="size-4" strokeWidth={2} />
              </span>
              Quản lý theo vai trò
            </div>
            <div className="flex items-center gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white/10 text-[#83d5a8]">
                <Check aria-hidden="true" className="size-4" strokeWidth={2} />
              </span>
              Dữ liệu tenant riêng biệt
            </div>
          </div>
        </div>

        <div className="relative flex items-center gap-3 border-t border-white/10 pt-6 text-sm text-white/55">
          <ShieldCheck aria-hidden="true" className="size-5 text-[#83d5a8]" strokeWidth={1.8} />
          <span>Phiên đăng nhập được bảo vệ và quản lý an toàn.</span>
        </div>
      </section>

      <section className="flex min-h-[100dvh] flex-col bg-[#fbfcfb] px-5 py-6 text-[#17211d] dark:bg-[#111714] dark:text-[#edf3ef] sm:px-10 lg:px-12 xl:px-20">
        <div className="flex items-center gap-2.5 lg:hidden">
          <span className="flex size-9 items-center justify-center rounded-lg bg-[#173f30] text-[#a4e0bd]">
            <CalendarCheck2 aria-hidden="true" className="size-[18px]" strokeWidth={1.8} />
          </span>
          <span className="font-semibold tracking-[-0.02em]">BookingOS</span>
        </div>

        <div className="mx-auto flex w-full max-w-[430px] flex-1 items-center py-12 sm:py-16">
          <div className="w-full">
            <div className="mb-9">
              <p className="mb-3 text-sm font-semibold text-[#287553] dark:text-[#82d4a7]">
                Chào mừng trở lại
              </p>
              <h2 className="text-[2rem] font-semibold leading-tight tracking-[-0.04em] sm:text-[2.25rem]">
                Đăng nhập vào workspace
              </h2>
              <p className="mt-3 text-[15px] leading-6 text-[#627069] dark:text-[#a4afa9]">
                Sử dụng tài khoản được cấp để tiếp tục quản lý nền tảng.
              </p>
            </div>

            <GenericForm
              schema={loginInputSchema}
              fields={fields}
              submitLabel="Đăng nhập"
              submitPendingLabel="Đang đăng nhập..."
              submitFullWidth
              serverError={serverError}
              fieldErrors={fieldErrors}
              className="auth-login-form space-y-7 [&_[data-slot=button]]:h-12 [&_[data-slot=button]]:rounded-lg [&_[data-slot=button]]:bg-[#173f30] [&_[data-slot=button]]:text-[15px] [&_[data-slot=button]]:text-white [&_[data-slot=button]]:shadow-[0_10px_24px_rgba(23,63,48,0.16)] [&_[data-slot=button]]:hover:bg-[#20553f] [&_[data-slot=button]]:active:translate-y-px [&_[data-slot=input]]:h-12 [&_[data-slot=input]]:rounded-lg [&_[data-slot=input]]:border-[#ccd5d0] [&_[data-slot=input]]:bg-white [&_[data-slot=input]]:shadow-none [&_[data-slot=input]]:focus-visible:border-[#287553] [&_[data-slot=input]]:focus-visible:ring-[#287553]/20 dark:[&_[data-slot=input]]:border-white/15 dark:[&_[data-slot=input]]:bg-white/[0.04]"
            >
              <span className="flex items-center gap-2 text-xs leading-5 text-[#718078] dark:text-[#8f9d95]">
                <ShieldCheck aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.8} />
                Thông tin đăng nhập được truyền qua kết nối bảo mật.
              </span>
            </GenericForm>
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-[430px] items-center justify-between border-t border-[#dfe5e1] pt-5 text-xs text-[#718078] dark:border-white/10 dark:text-[#8f9d95]">
          <span>BookingOS Dashboard</span>
          <span className="flex items-center gap-1.5">
            Dành cho đội ngũ vận hành
            <ArrowRight aria-hidden="true" className="size-3.5" />
          </span>
        </div>
      </section>
    </main>
  );
}
