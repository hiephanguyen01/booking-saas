import { CheckCircle2 } from 'lucide-react';

/**
 * Shared geometry for both profile cards, so the two forms keep the same input
 * height, label weight and submit-button size after the split.
 */
export const ProfileFormClassName =
  'mt-6 [&>div:last-child]:mt-10 [&>div:last-child]:justify-center [&_[data-slot=form-item]]:gap-2 [&_[data-slot=form-label]]:text-sm [&_[data-slot=form-label]]:font-medium [&_[data-slot=form-label]]:leading-5 [&_[data-slot=input]]:h-11 [&_[data-slot=input]]:rounded-sm [&_[data-slot=input]]:px-4 [&_[data-slot=input]]:font-medium [&_[data-slot=input]:disabled]:bg-muted [&_[data-slot=input]:disabled]:opacity-100 [&_[type=submit]]:h-12 [&_[type=submit]]:w-[min(240px,100%)] [&_[type=submit]]:rounded-sm [&_[type=submit]]:px-5 [&_[type=submit]]:text-base';

/** A value the customer can read but not edit (customer reference, email). */
export function ProfileReadOnlyField({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium leading-5 text-foreground/80">{label}</span>
      <span className="flex h-11 items-center rounded-sm border border-input bg-muted px-4 text-sm font-medium text-muted-foreground">
        {value}
      </span>
      {hint ? <span className="text-xs leading-4 text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

export function ProfileSuccessNotice({ text }: { text: string }) {
  return (
    <div
      role="status"
      className="mt-6 flex items-center gap-2 rounded-sm border border-success/15 bg-success/15 px-4 py-3 text-sm text-success"
    >
      <CheckCircle2 className="size-4" />
      {text}
    </div>
  );
}
