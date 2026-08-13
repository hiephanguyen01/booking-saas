import { data, redirect } from 'react-router';
import { loginInputSchema, type LoginInput, type SessionInfoResponse } from '@booking/contracts';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import type { FieldConfig } from '@booking/ui/components/form/types';
import { ArrowRight, CalendarCheck2, Check, ShieldCheck } from 'lucide-react';
import type { Route } from './+types/login';
import { backendLogin, backendSessionInfo } from '~/lib/api.server';
import { getOptionalUser, loadSessionInfo } from '~/lib/auth.server';
import { getCurrentDashboardHost } from '~/lib/request-auth.server';
import { safeRedirectPath } from '~/lib/safe-redirect';
import { createUserSession } from '~/lib/session.server';
import { defaultDashboardPath } from '~/lib/workspace';
import { dashboardPaths } from '~/constants/paths';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Đăng nhập · BookingOS Dashboard' }];
}

/**
 * `?redirectTo=` is how a guard elsewhere (e.g. `requireInvitationRecipient`
 * on `/invitations/:token`) sends an anonymous visitor here and gets them
 * back afterwards, instead of stranding them on their default area — which
 * for that screen's whole audience (someone with no membership yet) is the
 * "chưa được gán vào khu vực nào" notice on `/`. `safeRedirectPath` rejects
 * anything but a same-origin path; a value that resolves to an auth route
 * itself is also rejected, so a stale/crafted link can't loop `/auth/login`
 * back into itself.
 */
function loginRedirectTarget(
  request: Request,
  info: SessionInfoResponse,
  host: ReturnType<typeof getCurrentDashboardHost>,
): string {
  const requested = safeRedirectPath(new URL(request.url).searchParams.get('redirectTo'), '');
  return requested && !requested.startsWith('/auth/') ? requested : defaultDashboardPath(info, host);
}

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getOptionalUser(request);
  if (user) {
    const info = await loadSessionInfo(request);
    if (info) throw redirect(loginRedirectTarget(request, info, getCurrentDashboardHost()));
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
  const area = info ? loginRedirectTarget(request, info, getCurrentDashboardHost()) : dashboardPaths.home;
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
      <section className="auth-brand-panel relative hidden overflow-hidden bg-background text-foreground lg:flex lg:min-h-[100dvh] lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        <div className="relative flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl border border-border bg-auth-chip">
            <CalendarCheck2 aria-hidden="true" className="size-5 text-primary" strokeWidth={1.8} />
          </span>
          <div>
            <p className="text-lg font-semibold tracking-[-0.02em]">BookingOS</p>
            <p className="text-xs font-medium text-muted-foreground">Workspace</p>
          </div>
        </div>

        <div className="relative max-w-xl py-16">
          <p className="mb-5 text-sm font-medium text-primary">Vận hành tập trung</p>
          <h1 className="max-w-lg text-4xl font-semibold leading-[1.12] tracking-[-0.045em] xl:text-5xl">
            Mọi hoạt động đặt chỗ, trong một không gian quản trị.
          </h1>
          <p className="mt-6 max-w-md text-base leading-7 text-muted-foreground">
            Theo dõi lịch, đối tác và doanh thu với quy trình rõ ràng cho từng vai trò trong doanh
            nghiệp.
          </p>

          <div className="mt-10 grid max-w-md gap-4 text-sm text-muted-foreground sm:grid-cols-2">
            <div className="flex items-center gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-auth-chip text-primary">
                <Check aria-hidden="true" className="size-4" strokeWidth={2} />
              </span>
              Quản lý theo vai trò
            </div>
            <div className="flex items-center gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-auth-chip text-primary">
                <Check aria-hidden="true" className="size-4" strokeWidth={2} />
              </span>
              Dữ liệu tenant riêng biệt
            </div>
          </div>
        </div>

        <div className="relative flex items-center gap-3 border-t border-border pt-6 text-sm text-muted-foreground">
          <ShieldCheck aria-hidden="true" className="size-5 text-primary" strokeWidth={1.8} />
          <span>Phiên đăng nhập được bảo vệ và quản lý an toàn.</span>
        </div>
      </section>

      <section className="auth-form-panel flex min-h-[100dvh] flex-col bg-background px-5 py-6 text-foreground sm:px-10 lg:px-12 xl:px-20">
        <div className="flex items-center gap-2.5 lg:hidden">
          <span className="flex size-9 items-center justify-center rounded-lg bg-auth-chip text-auth-chip-foreground">
            <CalendarCheck2 aria-hidden="true" className="size-[18px]" strokeWidth={1.8} />
          </span>
          <span className="font-semibold tracking-[-0.02em]">BookingOS</span>
        </div>

        <div className="mx-auto flex w-full max-w-[430px] flex-1 items-center py-12 sm:py-16">
          <div className="w-full">
            <div className="mb-9">
              <p className="mb-3 text-sm font-semibold text-auth-accent">Chào mừng trở lại</p>
              <h2 className="text-[2rem] font-semibold leading-tight tracking-[-0.04em] sm:text-[2.25rem]">
                Đăng nhập vào workspace
              </h2>
              <p className="mt-3 text-[15px] leading-6 text-muted-foreground">
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
              className="auth-login-form space-y-7 [&_[data-slot=button]]:h-12 [&_[data-slot=button]]:rounded-lg [&_[data-slot=button]]:bg-primary [&_[data-slot=button]]:text-[15px] [&_[data-slot=button]]:text-primary-foreground [&_[data-slot=button]]:hover:bg-primary/90 [&_[data-slot=button]]:active:translate-y-px [&_[data-slot=input]]:h-12 [&_[data-slot=input]]:rounded-lg [&_[data-slot=input]]:border-input [&_[data-slot=input]]:bg-card [&_[data-slot=input]]:shadow-none [&_[data-slot=input]]:focus-visible:border-ring [&_[data-slot=input]]:focus-visible:ring-ring/20"
            >
              <span className="flex items-center gap-2 text-xs leading-5 text-muted-foreground">
                <ShieldCheck aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.8} />
                Thông tin đăng nhập được truyền qua kết nối bảo mật.
              </span>
            </GenericForm>
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-[430px] items-center justify-between border-t border-border pt-5 text-xs text-muted-foreground">
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
