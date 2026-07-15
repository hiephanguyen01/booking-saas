import type { TranslationShape } from '../translation-shape';
import type { viAuth } from '../vi/auth';

export const enAuth = {
  header: { login: 'Log in', register: 'Create account', reset: 'Reset password' },
  login: {
    title: 'Welcome back',
    description: 'Log in to manage your bookings.',
    submit: 'Log in',
    forgot: 'Forgot password?',
    noAccount: 'New here?',
    register: 'Create an account',
  },
  register: {
    title: 'Create your account',
    description: 'Enter your details to get started.',
    submit: 'Continue',
    hasAccount: 'Already have an account?',
    login: 'Log in',
  },
  forgot: {
    title: 'Forgot your password?',
    description: 'Enter your email. If an account exists, we will send a verification code.',
    submit: 'Send verification code',
    back: 'Back to login',
  },
  verify: {
    registrationTitle: 'Verify your email',
    resetTitle: 'Enter verification code',
    description: 'We sent a 6-digit code to {{email}}.',
    code: 'Verification code',
    submit: 'Verify',
    resend: 'Resend code',
    resendIn: 'Resend in {{seconds}}s',
    expired: 'This verification code has expired. Please start again.',
  },
  password: {
    registrationTitle: 'Create a password',
    resetTitle: 'Create a new password',
    description: 'Use 8–128 characters with at least one letter and one number.',
    label: 'Password',
    confirm: 'Confirm password',
    show: 'Show password',
    hide: 'Hide password',
    submitRegistration: 'Complete registration',
    submitReset: 'Change password',
  },
  success: {
    registrationTitle: 'Account created!',
    registrationDescription: 'Your account is ready. Log in to start booking.',
    resetTitle: 'Password changed!',
    resetDescription: 'You can now log in with your new password.',
    login: 'Log in',
  },
  fields: { fullName: 'Full name', email: 'Email', password: 'Password' },
  social: { or: 'Or continue with', google: 'Google', facebook: 'Facebook', soon: 'Coming soon' },
  promo: {
    title: 'A smoother booking experience',
    description: 'Save your details, follow appointments, and manage every booking in one place.',
  },
  errors: {
    generic: 'We could not process your request. Please try again.',
    invalidCredentials: 'Incorrect email or password.',
    emailTaken: 'This email is already registered.',
    invalidOtp: 'The verification code is incorrect.',
    expired: 'Your verification session expired. Please start again.',
    passwordMismatch: 'Passwords do not match.',
    accountLocked:
      'Your account is temporarily locked after too many failed attempts. Try again later.',
  },
} satisfies TranslationShape<typeof viAuth>;
