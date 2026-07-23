import { Button } from '@booking/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@booking/ui/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@booking/ui/components/ui/drawer';
import { X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NsI18n, useTranslation } from '../../lib/i18n';

export function PackageBookingDialogShell({
  open,
  onOpenChange,
  title,
  description,
  body,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  body: ReactNode;
  footer: ReactNode;
}) {
  const isDesktop = useDesktopBookingDialog();
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => titleRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [isDesktop, open]);

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="flex h-[min(90dvh,48rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-146"
        >
          <DialogHeader className="shrink-0 border-b p-5 pr-16">
            <DialogTitle ref={titleRef} tabIndex={-1} className="outline-none">
              {title}
            </DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <PackageBookingCloseButton onClick={() => onOpenChange(false)} />
          {body}
          {footer}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="h-[92dvh] max-h-[92dvh]! overflow-hidden">
        <DrawerHeader className="shrink-0 border-b px-5 pt-5 pb-4 pr-16 text-left">
          <DrawerTitle ref={titleRef} tabIndex={-1} className="outline-none">
            {title}
          </DrawerTitle>
          <DrawerDescription>{description}</DrawerDescription>
        </DrawerHeader>
        <PackageBookingCloseButton onClick={() => onOpenChange(false)} />
        {body}
        {footer}
      </DrawerContent>
    </Drawer>
  );
}

function PackageBookingCloseButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation(NsI18n.Listing);
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="absolute top-3 right-3 size-11"
      aria-label={t('group.closeSchedule')}
      onClick={onClick}
    >
      <X aria-hidden="true" />
    </Button>
  );
}

function useDesktopBookingDialog(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const update = () => setIsDesktop(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return isDesktop;
}
