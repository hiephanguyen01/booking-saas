export interface BookingAccessNavigationLike {
  state: 'idle' | 'loading' | 'submitting';
  formMethod?: string;
  formData?: FormData;
}

export function isBookingAccessNavigation(navigation: BookingAccessNavigationLike): boolean {
  return (
    navigation.state !== 'idle' &&
    navigation.formMethod != null &&
    navigation.formData?.get('intent') === 'verify-access'
  );
}
