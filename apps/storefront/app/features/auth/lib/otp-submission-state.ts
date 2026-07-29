import { isFormNavigationPending, type FormNavigationSnapshot } from '~/lib/form-navigation';

/** Which of the OTP form's two buttons is in flight. */
export function otpSubmissionIntent(
  navigation: FormNavigationSnapshot,
): 'idle' | 'verify' | 'resend' {
  if (!isFormNavigationPending(navigation)) return 'idle';
  return navigation.formData?.get('intent') === 'resend' ? 'resend' : 'verify';
}
