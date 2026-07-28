import { Button } from '@booking/ui/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@booking/ui/components/ui/dialog';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@booking/ui/components/ui/drawer';
import { X } from 'lucide-react';
import { useRef, type ReactElement, type ReactNode, type RefObject } from 'react';
import { NsI18n, useTranslation } from '@booking/i18n';
import { useBookingDialogShellController } from '~/features/booking-widget/hooks/use-booking-dialog-shell-controller';

type BookingDialogShellBaseProps = {
  title: string;
  description: string;
  body: ReactNode;
  footer: ReactNode;
};

type TriggeredBookingDialogShellProps = BookingDialogShellBaseProps & {
  desktopOpen: boolean;
  mobileOpen: boolean;
  onDesktopOpenChange: (open: boolean) => void;
  onMobileOpenChange: (open: boolean) => void;
  trigger: ReactElement;
  controlled?: never;
};

type ControlledBookingDialogShellProps = BookingDialogShellBaseProps & {
  controlled: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
  };
  desktopOpen?: never;
  mobileOpen?: never;
  onDesktopOpenChange?: never;
  onMobileOpenChange?: never;
  trigger?: never;
};

export function BookingDialogShell(
  props: TriggeredBookingDialogShellProps | ControlledBookingDialogShellProps,
) {
  if (props.controlled) {
    return <ControlledBookingDialogShell {...props} />;
  }

  return <TriggeredBookingDialogShell {...props} />;
}

function TriggeredBookingDialogShell({
  desktopOpen,
  mobileOpen,
  title,
  description,
  trigger,
  body,
  footer,
  onDesktopOpenChange,
  onMobileOpenChange,
}: TriggeredBookingDialogShellProps) {
  const dialogTitleRef = useRef<HTMLHeadingElement>(null);

  return (
    <>
      <div className="hidden lg:block">
        <DesktopBookingDialog
          open={desktopOpen}
          onOpenChange={onDesktopOpenChange}
          title={title}
          description={description}
          trigger={trigger}
          body={body}
          footer={footer}
          titleRef={dialogTitleRef}
          focusTitleOnOpen
        />
      </div>
      <div className="lg:hidden">
        <MobileBookingDrawer
          open={mobileOpen}
          onOpenChange={onMobileOpenChange}
          title={title}
          description={description}
          trigger={trigger}
          body={body}
          footer={footer}
        />
      </div>
    </>
  );
}

function ControlledBookingDialogShell({
  controlled,
  title,
  description,
  body,
  footer,
}: ControlledBookingDialogShellProps) {
  const { closeDialog, isDesktop, titleRef } = useBookingDialogShellController(controlled);
  const sharedProps = {
    open: controlled.open,
    onOpenChange: controlled.onOpenChange,
    title,
    description,
    body,
    footer,
    titleRef,
    onClose: closeDialog,
  };

  return isDesktop ? (
    <DesktopBookingDialog {...sharedProps} />
  ) : (
    <MobileBookingDrawer {...sharedProps} focusTitle />
  );
}

type BookingDialogPresentationProps = BookingDialogShellBaseProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: ReactElement;
  titleRef?: RefObject<HTMLHeadingElement | null>;
  onClose?: () => void;
};

function DesktopBookingDialog({
  open,
  onOpenChange,
  title,
  description,
  trigger,
  body,
  footer,
  titleRef,
  onClose,
  focusTitleOnOpen = false,
}: BookingDialogPresentationProps & {
  focusTitleOnOpen?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent
        showCloseButton={false}
        onOpenAutoFocus={
          focusTitleOnOpen
            ? (event) => {
                event.preventDefault();
                titleRef?.current?.focus();
              }
            : undefined
        }
        className="flex h-[min(90dvh,48rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-146"
      >
        <DialogHeader className="shrink-0 border-b p-5 pr-16">
          <DialogTitle ref={titleRef} tabIndex={-1} className="outline-none">
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <BookingDialogCloseButton kind="dialog" onClose={onClose} />
        {body}
        {footer}
      </DialogContent>
    </Dialog>
  );
}

function MobileBookingDrawer({
  open,
  onOpenChange,
  title,
  description,
  trigger,
  body,
  footer,
  titleRef,
  onClose,
  focusTitle = false,
}: BookingDialogPresentationProps & {
  focusTitle?: boolean;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      {trigger ? <DrawerTrigger asChild>{trigger}</DrawerTrigger> : null}
      <DrawerContent className="h-[92dvh] max-h-[92dvh]! overflow-hidden">
        <DrawerHeader className="shrink-0 border-b px-5 pt-5 pb-4 pr-16 text-left">
          <DrawerTitle
            ref={focusTitle ? titleRef : undefined}
            tabIndex={focusTitle ? -1 : undefined}
            className={focusTitle ? 'outline-none' : undefined}
          >
            {title}
          </DrawerTitle>
          <DrawerDescription>{description}</DrawerDescription>
        </DrawerHeader>
        <BookingDialogCloseButton kind="drawer" onClose={onClose} />
        {body}
        {footer}
      </DrawerContent>
    </Drawer>
  );
}

function BookingDialogCloseButton({
  kind,
  onClose,
}: {
  kind: 'dialog' | 'drawer';
  onClose?: () => void;
}) {
  const { t } = useTranslation(NsI18n.Listing);
  const button = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="absolute top-3 right-3 size-11"
      aria-label={t('group.closeSchedule')}
      onClick={onClose}
    >
      <X aria-hidden="true" />
    </Button>
  );

  if (onClose) return button;
  return kind === 'dialog' ? (
    <DialogClose asChild>{button}</DialogClose>
  ) : (
    <DrawerClose asChild>{button}</DrawerClose>
  );
}
