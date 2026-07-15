export interface AuthActionData {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  resent?: boolean;
  resendAfterSec?: number;
}
