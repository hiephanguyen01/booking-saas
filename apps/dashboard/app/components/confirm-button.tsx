import type { ReactNode } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@booking/ui/components/ui/alert-dialog';

export interface ConfirmButtonProps {
  /** The element that opens the dialog — rendered via `AlertDialogTrigger asChild`. */
  trigger: ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  /** Style the confirm action as destructive (red). */
  destructive?: boolean;
  /** Disable the confirm action while a request is in flight. */
  busy: boolean;
  onConfirm: () => void;
}

/**
 * A trigger wired to a confirm/cancel `AlertDialog` — the one "bạn có chắc?"
 * affirmation used across the dashboard's destructive/moderation actions
 * (approve · reject · hide a listing or group). Cancel is always "Huỷ".
 */
export function ConfirmButton({
  trigger,
  title,
  description,
  confirmLabel,
  destructive,
  busy,
  onConfirm,
}: ConfirmButtonProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Huỷ</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? 'destructive' : 'default'}
            disabled={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
