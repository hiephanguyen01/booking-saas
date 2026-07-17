import { cn } from '@booking/ui/lib/utils';

/** The one anchor treatment for contact links (matches EntityRef's classes). */
const LINK_CLASSES =
  'rounded-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

function Dash() {
  return <span className="text-sm text-muted-foreground">—</span>;
}

/**
 * A dialable phone number. `masked` numbers (partner-facing PII masking) render
 * as plain text — a masked value is not a real number to call.
 */
export function PhoneLink({
  phone,
  masked = false,
}: {
  phone: string | null | undefined;
  masked?: boolean;
}) {
  if (!phone) return <Dash />;
  if (masked) return <span className="text-sm tabular-nums">{phone}</span>;
  return (
    <a href={`tel:${phone}`} className={cn(LINK_CLASSES, 'text-sm tabular-nums')}>
      {phone}
    </a>
  );
}

/** A mailto link with the shared anchor treatment; em-dash when absent. */
export function EmailLink({ email }: { email: string | null | undefined }) {
  if (!email) return <Dash />;
  return (
    <a href={`mailto:${email}`} className={cn(LINK_CLASSES, 'break-all text-sm')}>
      {email}
    </a>
  );
}
