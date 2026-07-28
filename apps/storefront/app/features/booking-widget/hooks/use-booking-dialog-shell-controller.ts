import { useEffect, useRef, useState } from 'react';

export function useBookingDialogShellController({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isDesktop = useDesktopBookingDialog();
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => titleRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [isDesktop, open]);

  return {
    closeDialog: () => onOpenChange(false),
    isDesktop,
    titleRef,
  };
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
