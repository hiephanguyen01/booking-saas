import * as React from 'react';
import { Button } from '@booking/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@booking/ui/components/ui/dialog';
import { Label } from '@booking/ui/components/ui/label';
import { Textarea } from '@booking/ui/components/ui/textarea';

/**
 * Confirmation dialog with an optional free-text reason (reject / no-show /
 * cancel…). Purely presentational: submitting calls `onSubmit(reason)` — the
 * caller owns the fetcher/action wiring — and closes the dialog. The textarea is
 * uncontrolled and remounts with the dialog, so a dismissed reason never leaks
 * into the next open.
 */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  tone = 'default',
  placeholder,
  onSubmit,
  busy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  submitLabel: string;
  /** `destructive` styles the submit button red (reject / cancel / no-show). */
  tone?: 'default' | 'destructive';
  placeholder?: string;
  /** Receives the reason as typed (may be empty — the reason is optional). */
  onSubmit: (reason: string) => void;
  busy: boolean;
}): React.JSX.Element {
  const reasonId = React.useId();
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const reason = String(new FormData(event.currentTarget).get('reason') ?? '');
    onOpenChange(false);
    onSubmit(reason);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={reasonId}>Lý do (tuỳ chọn)</Label>
            <Textarea id={reasonId} name="reason" rows={3} maxLength={500} placeholder={placeholder} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Đóng
            </Button>
            <Button type="submit" variant={tone} disabled={busy}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
