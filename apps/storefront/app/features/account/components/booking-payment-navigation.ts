export interface BookingPaymentNavigationSnapshot {
  state: 'idle' | 'loading' | 'submitting';
  formMethod?: string;
  formData?: FormData;
}

export function isBookingPaymentNavigation(
  navigation: BookingPaymentNavigationSnapshot,
): boolean {
  return (
    navigation.state !== 'idle' &&
    navigation.formMethod != null &&
    navigation.formData?.get('intent') === 'pay'
  );
}
