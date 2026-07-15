import { Form, useActionData, useOutletContext } from 'react-router';
import {
  startPartnerRegistration,
  type PartnerOnboardingActionData,
} from '../lib/partner-onboarding.server';
import type { StorefrontContext } from '../root';
import type { Route } from './+types/become-partner';
import {
  AuthSplit,
  EmailField,
  FormAlert,
  FormHeading,
  LoginPrompt,
  PrimaryButton,
} from './partner-onboarding/shared';

export const meta = () => [
  { title: 'Đăng ký đối tác · Booking Studio' },
  { name: 'robots', content: 'noindex,nofollow' },
];

export const action = ({ request, params }: Route.ActionArgs) =>
  startPartnerRegistration(request, params.locale);

export default function PartnerRegistrationStart() {
  const { locale, currentUser } = useOutletContext<StorefrontContext>();
  const actionData = useActionData<PartnerOnboardingActionData>();
  const emailError = actionData?.fieldErrors?.email?.[0];
  const duplicate = actionData?.error === 'EMAIL_TAKEN';
  return (
    <AuthSplit>
      <FormHeading
        title={currentUser ? 'Tiếp tục đăng ký đối tác' : 'Đăng ký'}
        description={
          currentUser ? (
            <>
              Bạn đang đăng nhập bằng{' '}
              <strong className="font-semibold text-[#344054]">{currentUser.email}</strong>
            </>
          ) : undefined
        }
      />
      <Form method="post" className="flex flex-col gap-10" noValidate>
        <FormAlert>
          {duplicate
            ? 'Email này đã được sử dụng. Vui lòng đăng nhập tài khoản.'
            : actionData?.error
              ? 'Không thể gửi email xác thực. Vui lòng thử lại.'
              : undefined}
        </FormAlert>
        {currentUser ? null : (
          <EmailField
            error={
              emailError ??
              (duplicate ? 'Email này đã được sử dụng. Vui lòng đăng nhập tài khoản' : undefined)
            }
          />
        )}
        <PrimaryButton>{currentUser ? 'Tiếp tục' : 'Đăng ký'}</PrimaryButton>
      </Form>
      {currentUser ? null : <LoginPrompt locale={locale} />}
    </AuthSplit>
  );
}
