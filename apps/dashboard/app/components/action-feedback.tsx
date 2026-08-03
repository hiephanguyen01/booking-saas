import type { ReactNode } from 'react';
import { CircleAlert, CircleCheck } from 'lucide-react';
import { Alert, AlertDescription } from '@booking/ui/components/ui/alert';

/**
 * Form-level error surface for a failed action. Renders nothing while there is
 * no error, so call sites can pass `actionData?.error` straight through.
 */
export function ErrorBanner({ error }: { error: ReactNode | null | undefined }) {
  if (!error) return null;
  return (
    <Alert variant="destructive">
      <CircleAlert className="size-4" />
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  );
}

/** Success confirmation after a mutation. Renders nothing when message is falsy. */
export function SuccessBanner({ message }: { message: ReactNode | null | undefined }) {
  if (!message) return null;
  return (
    <Alert>
      {/* Success semantics keep the literal emerald pair (design-rule exception). */}
      <CircleCheck className="size-4 text-success" />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
