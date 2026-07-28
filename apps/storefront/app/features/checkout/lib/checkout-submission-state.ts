export interface CheckoutNavigationLike {
  state: 'idle' | 'loading' | 'submitting';
  formMethod?: string;
  formData?: FormData;
}

export function isCheckoutNavigation(navigation: CheckoutNavigationLike): boolean {
  return (
    navigation.state !== 'idle' &&
    navigation.formMethod != null &&
    navigation.formData?.get('intent') === 'checkout'
  );
}
