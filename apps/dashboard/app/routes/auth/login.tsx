import { data, redirect } from 'react-router';
import { loginInputSchema, type LoginInput } from '@booking/contracts';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import type { FieldConfig } from '@booking/ui/components/form/types';
import type { Route } from './+types/login';
import { backendLogin, backendSessionInfo } from '~/lib/api.server';
import { defaultAreaFor, getOptionalUser, loadSessionInfo } from '~/lib/auth.server';
import { createUserSession } from '~/lib/session.server';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Đăng nhập · Bookify Dashboard' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getOptionalUser(request);
  if (user) {
    const info = await loadSessionInfo(request);
    if (info) throw redirect(defaultAreaFor(info));
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
  const area = info ? defaultAreaFor(info) : '/';
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
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm space-y-6 rounded-xl border bg-card p-8 shadow-sm">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Bookify Dashboard</h1>
          <p className="text-sm text-muted-foreground">Đăng nhập để quản lý nền tảng của bạn</p>
        </div>
        <GenericForm
          schema={loginInputSchema}
          fields={fields}
          submitLabel="Đăng nhập"
          serverError={serverError}
          fieldErrors={fieldErrors}
        />
      </div>
    </div>
  );
}
