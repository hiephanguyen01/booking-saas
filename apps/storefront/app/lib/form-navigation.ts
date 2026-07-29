/**
 * The slice of React Router's `useNavigation()` that submit-button state depends on.
 *
 * Declared structurally rather than imported so the pure helpers below stay
 * testable against a plain object and usable from any feature.
 */
export interface FormNavigationSnapshot {
  state: 'idle' | 'loading' | 'submitting';
  formMethod?: string;
  formData?: FormData;
}

/** A form submission is in flight — `formMethod` is what distinguishes it from a plain navigation. */
export function isFormNavigationPending(navigation: FormNavigationSnapshot): boolean {
  return navigation.state !== 'idle' && navigation.formMethod != null;
}

/** The in-flight submission is the one carrying `intent`. */
export function isPendingIntent(navigation: FormNavigationSnapshot, intent: string): boolean {
  return isFormNavigationPending(navigation) && navigation.formData?.get('intent') === intent;
}
