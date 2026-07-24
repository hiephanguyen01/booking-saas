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
import { useRef, type ReactElement, type ReactNode } from 'react';
import { NsI18n, useTranslation } from '../../../lib/i18n';

export function RoomBookingDialogShell({
  desktopOpen,
  mobileOpen,
  title,
  description,
  trigger,
  body,
  footer,
  onDesktopOpenChange,
  onMobileOpenChange,
}: {
  desktopOpen: boolean;
  mobileOpen: boolean;
  onDesktopOpenChange: (open: boolean) => void;
  onMobileOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  trigger: ReactElement;
  body: ReactNode;
  footer: ReactNode;
}) {
  const dialogTitleRef = useRef<HTMLHeadingElement>(null);
  const { t } = useTranslation(NsI18n.Listing);

  return (
    <>
      <div className="hidden lg:block">
        <Dialog open={desktopOpen} onOpenChange={onDesktopOpenChange}>
          <DialogTrigger asChild>{trigger}</DialogTrigger>
          <DialogContent
            showCloseButton={false}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              dialogTitleRef.current?.focus();
            }}
            className="flex h-[min(90dvh,48rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-146"
          >
            <DialogHeader className="shrink-0 border-b p-5 pr-16">
              <DialogTitle ref={dialogTitleRef} tabIndex={-1} className="outline-none">
                {title}
              </DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </DialogHeader>
            <DialogClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute top-3 right-3 size-11"
                aria-label={t('group.closeSchedule')}
              >
                <X aria-hidden="true" />
              </Button>
            </DialogClose>
            {body}
            {footer}
          </DialogContent>
        </Dialog>
      </div>
      <div className="lg:hidden">
        <Drawer open={mobileOpen} onOpenChange={onMobileOpenChange}>
          <DrawerTrigger asChild>{trigger}</DrawerTrigger>
          <DrawerContent className="h-[92dvh] max-h-[92dvh]! overflow-hidden">
            <DrawerHeader className="shrink-0 border-b px-5 pt-5 pb-4 pr-16 text-left">
              <DrawerTitle>{title}</DrawerTitle>
              <DrawerDescription>{description}</DrawerDescription>
            </DrawerHeader>
            <DrawerClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute top-3 right-3 size-11"
                aria-label={t('group.closeSchedule')}
              >
                <X aria-hidden="true" />
              </Button>
            </DrawerClose>
            {body}
            {footer}
          </DrawerContent>
        </Drawer>
      </div>
    </>
  );
}
