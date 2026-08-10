import { NsI18n, useTranslation } from '@booking/i18n';
import { Button } from '@booking/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@booking/ui/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@booking/ui/components/ui/drawer';
import { Download, EllipsisVertical, ExternalLink, RefreshCw, Share } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useServiceWorker } from '~/features/pwa/hooks/use-service-worker';
import {
  detectInstallDevice,
  type InstallDeviceProfile,
  type ManualInstallMode,
} from '~/features/pwa/lib/install-device';
import { PwaContext } from '~/features/pwa/lib/pwa-context';

const PROMOTION_SESSION_KEY = 'bookingos:pwa-promotion-shown:v2';
const MANUAL_GUIDE_DELAY_MS = 750;
let promotionShownWithoutSessionStorage = false;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

type InstallMode = 'native' | ManualInstallMode;

export function PwaProvider({
  children,
  advertiseInstall,
  installAppName,
}: {
  children: ReactNode;
  advertiseInstall: boolean;
  installAppName?: string;
}) {
  const { t } = useTranslation(NsI18n.Pwa);
  const { applyUpdate, updateAvailable } = useServiceWorker();
  const [device, setDevice] = useState<InstallDeviceProfile | null>(null);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [manualGuideReady, setManualGuideReady] = useState(false);
  const [promotionSuppressed, setPromotionSuppressed] = useState(false);
  const [showInstallSheet, setShowInstallSheet] = useState(false);
  const [showInstallGuide, setShowInstallGuide] = useState<ManualInstallMode | null>(null);

  useEffect(() => {
    const standaloneQuery = window.matchMedia('(display-mode: standalone)');
    const standalone = () =>
      standaloneQuery.matches ||
      Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
    const syncStandalone = () => setIsStandalone(standalone());
    syncStandalone();
    standaloneQuery.addEventListener?.('change', syncStandalone);
    return () => standaloneQuery.removeEventListener?.('change', syncStandalone);
  }, []);

  useEffect(() => {
    setDevice(detectInstallDevice(window.navigator));
    const manualGuideTimer = window.setTimeout(
      () => setManualGuideReady(true),
      MANUAL_GUIDE_DELAY_MS,
    );
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstallPrompt(null);
      setShowInstallSheet(false);
      setShowInstallGuide(null);
      setPromotionSuppressed(true);
      setIsStandalone(true);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.clearTimeout(manualGuideTimer);
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const installMode: InstallMode | null =
    !advertiseInstall || !device?.isMobile || isStandalone || promotionSuppressed
      ? null
      : installPrompt
        ? 'native'
        : manualGuideReady
          ? device.manualMode
          : null;
  const canInstall = installMode !== null;

  useEffect(() => {
    if (!canInstall) {
      setShowInstallSheet(false);
      setShowInstallGuide(null);
      return;
    }
    if (markPromotionShownForSession()) setShowInstallSheet(true);
  }, [canInstall]);

  const install = useCallback(async () => {
    if (!installMode) return;
    setShowInstallSheet(false);

    if (installMode === 'native') {
      const prompt = installPrompt;
      if (!prompt) return;
      try {
        await prompt.prompt();
        await prompt.userChoice;
      } catch {
        // A browser can expire the event between rendering and the user's click.
      } finally {
        setInstallPrompt(null);
        setPromotionSuppressed(true);
      }
      return;
    }

    setShowInstallGuide(installMode);
  }, [installMode, installPrompt]);

  const value = useMemo(() => ({ canInstall, install }), [canInstall, install]);
  const normalizedInstallAppName = installAppName?.trim() || null;
  const installTitle = normalizedInstallAppName
    ? t('install.title', { tenant: normalizedInstallAppName })
    : t('install.titleFallback');
  const installDescription = normalizedInstallAppName
    ? t('install.description', { tenant: normalizedInstallAppName })
    : t('install.descriptionFallback');

  return (
    <PwaContext.Provider value={value}>
      {children}

      <Drawer
        open={showInstallSheet && canInstall}
        onOpenChange={(open) => setShowInstallSheet(open && canInstall)}
      >
        <DrawerContent className="font-studio">
          <DrawerHeader className="mx-auto w-full max-w-lg text-left">
            <div className="mb-2 flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Download aria-hidden="true" />
            </div>
            <DrawerTitle>{installTitle}</DrawerTitle>
            <DrawerDescription>{installDescription}</DrawerDescription>
          </DrawerHeader>
          <DrawerFooter className="mx-auto grid w-full max-w-lg grid-cols-2 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <Button type="button" variant="outline" onClick={() => setShowInstallSheet(false)}>
              {t('install.later')}
            </Button>
            <Button type="button" onClick={() => void install()}>
              <Download aria-hidden="true" />
              {t('install.action')}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {updateAvailable && isStandalone ? (
        <aside
          className="fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-xl items-center gap-3 rounded-xl border bg-background p-3 shadow-xl"
          aria-label={t('update.title')}
        >
          <RefreshCw className="shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{t('update.title')}</p>
            <p className="text-xs text-muted-foreground">{t('update.description')}</p>
          </div>
          <Button type="button" size="sm" onClick={applyUpdate}>
            {t('update.action')}
          </Button>
        </aside>
      ) : null}

      <InstallGuideDialog
        mode={showInstallGuide}
        open={showInstallGuide !== null}
        onOpenChange={(open) => {
          if (!open) setShowInstallGuide(null);
        }}
      />
    </PwaContext.Provider>
  );
}

function InstallGuideDialog({
  mode,
  open,
  onOpenChange,
}: {
  mode: ManualInstallMode | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation(NsI18n.Pwa);
  if (!mode) return null;

  const guide =
    mode === 'ios-safari'
      ? {
          title: t('ios.title'),
          description: t('ios.description'),
          firstStep: t('ios.shareStep'),
          secondStep: t('ios.addStep'),
          firstIcon: <Share className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />,
        }
      : mode === 'android-chrome'
        ? {
            title: t('android.title'),
            description: t('android.description'),
            firstStep: t('android.menuStep'),
            secondStep: t('android.addStep'),
            firstIcon: (
              <EllipsisVertical
                className="mt-0.5 size-5 shrink-0 text-primary"
                aria-hidden="true"
              />
            ),
          }
        : mode === 'ios-browser'
          ? {
              title: t('browser.iosTitle'),
              description: t('browser.iosDescription'),
              firstStep: t('browser.iosOpenStep'),
              secondStep: t('browser.iosAddStep'),
              firstIcon: (
                <ExternalLink className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
              ),
            }
          : {
              title: t('browser.androidTitle'),
              description: t('browser.androidDescription'),
              firstStep: t('browser.androidOpenStep'),
              secondStep: t('browser.androidAddStep'),
              firstIcon: (
                <ExternalLink className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
              ),
            };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{guide.title}</DialogTitle>
          <DialogDescription>{guide.description}</DialogDescription>
        </DialogHeader>
        <ol className="space-y-3 text-sm">
          <li className="flex gap-3">
            {guide.firstIcon}
            <span>{guide.firstStep}</span>
          </li>
          <li className="flex gap-3">
            <Download className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            <span>{guide.secondStep}</span>
          </li>
        </ol>
        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            {t('guide.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function markPromotionShownForSession(): boolean {
  try {
    if (sessionStorage.getItem(PROMOTION_SESSION_KEY) === '1') return false;
    sessionStorage.setItem(PROMOTION_SESSION_KEY, '1');
    return true;
  } catch {
    if (promotionShownWithoutSessionStorage) return false;
    promotionShownWithoutSessionStorage = true;
    return true;
  }
}
