export interface FormNavigationSnapshot {
  state: 'idle' | 'loading' | 'submitting';
  formMethod?: string;
  formData?: FormData;
}

export function isFormNavigationPending(navigation: FormNavigationSnapshot): boolean {
  return navigation.state !== 'idle' && navigation.formMethod != null;
}

export function otpSubmissionIntent(
  navigation: FormNavigationSnapshot,
): 'idle' | 'verify' | 'resend' {
  if (!isFormNavigationPending(navigation)) return 'idle';
  return navigation.formData?.get('intent') === 'resend' ? 'resend' : 'verify';
}
