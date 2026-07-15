import { Form, useActionData } from 'react-router';
import { completePartnerPassword, requirePartnerPhase, type PartnerOnboardingActionData } from '../../lib/partner-onboarding.server';
import { AuthSplit, FormAlert, FormHeading, PasswordField, PrimaryButton } from './shared';
import type { Route } from './+types/password';

export const meta = () => [{ title: 'Thiết lập mật khẩu · Booking Studio' }, { name: 'robots', content: 'noindex,nofollow' }];
export const loader = ({ request, params }: Route.LoaderArgs) => requirePartnerPhase(request, 'partner_registration_password', params.locale);
export const action = ({ request, params }: Route.ActionArgs) => completePartnerPassword(request, params.locale);

export default function PartnerPassword() {
  const actionData = useActionData<PartnerOnboardingActionData>();
  return (
    <AuthSplit tall>
      <FormHeading title="Thiết lập mật khẩu" />
      <Form method="post" className="space-y-4" noValidate>
        <FormAlert>{actionData?.error ? 'Không thể tạo tài khoản. Vui lòng thử lại.' : undefined}</FormAlert>
        <PasswordField name="password" label="Mật khẩu" error={actionData?.fieldErrors?.password?.[0]} autoFocus />
        <PasswordField name="confirmPassword" label="Nhập lại mật khẩu" error={actionData?.fieldErrors?.confirmPassword?.[0]} />
        <ul className="space-y-2 pt-1 text-sm font-medium leading-5 text-[#667085]">
          <li>Ít nhất 8 ký tự</li><li>Ít nhất một ký tự viết hoa</li><li>Ít nhất một chữ số</li><li>Ít nhất một ký tự đặc biệt</li>
        </ul>
        <div className="pt-5"><PrimaryButton>Thiết lập mật khẩu</PrimaryButton></div>
      </Form>
    </AuthSplit>
  );
}
