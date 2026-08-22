import { NsI18n, useTranslation } from '@booking/i18n';
import { Image } from '@booking/ui/components/media/image';
import { Button } from '@booking/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@booking/ui/components/ui/dialog';
import { Download, EllipsisVertical, ExternalLink, RefreshCw, Share, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useServiceWorker } from '~/features/pwa/hooks/use-service-worker';
import { useShowPwaInstall } from '~/features/pwa/hooks/use-show-pwa-install';
import {
  detectInstallDevice,
  type InstallDeviceProfile,
  type ManualInstallMode,
} from '~/features/pwa/lib/install-device';
import { pwaBrand, type PwaTenantBrandInput } from '~/features/pwa/lib/manifest';
import { PwaContext } from '~/features/pwa/lib/pwa-context';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function PwaProvider({
  children,
  tenant,
}: {
  children: ReactNode;
  tenant: PwaTenantBrandInput | null;
}) {
  const { t } = useTranslation(NsI18n.Pwa);
  const { applyUpdate, updateAvailable } = useServiceWorker();
  const showPwaInstall = useShowPwaInstall();
  const [device, setDevice] = useState<InstallDeviceProfile | null>(null);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [installBannerDismissed, setInstallBannerDismissed] = useState(false);
  const [showInstallGuide, setShowInstallGuide] = useState<ManualInstallMode | null>(null);
  const brand = pwaBrand(tenant);
  const appName = tenant?.name.trim() || brand.shortName;

  useEffect(() => {
    const standaloneQuery = window.matchMedia('(display-mode: standalone)');
    const standalone = () =>
      standaloneQuery.matches ||
      Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
    const syncStandalone = () => setIsStandalone(standalone());
    syncStandalone();
    standaloneQuery.addEventListener?.('change', syncStandalone);
    setDevice(detectInstallDevice(window.navigator));
    return () => standaloneQuery.removeEventListener?.('change', syncStandalone);
  }, []);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstallPrompt(null);
      setInstallBannerDismissed(true);
      setShowInstallGuide(null);
      setIsStandalone(true);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  useEffect(() => {
    if (showPwaInstall) setInstallBannerDismissed(false);
    setShowInstallGuide(null);
  }, [showPwaInstall]);

  const install = useCallback(async () => {
    if (isStandalone) return;
    if (installPrompt) {
      try {
        await installPrompt.prompt();
        await installPrompt.userChoice;
        setInstallBannerDismissed(true);
      } catch {
        // A prompt can expire between the click and browser UI. Keep browsing.
      } finally {
        setInstallPrompt(null);
      }
      return;
    }
    if (device?.manualMode) setShowInstallGuide(device.manualMode);
  }, [device, installPrompt, isStandalone]);

  const dismissInstall = useCallback(() => {
    setInstallBannerDismissed(true);
  }, []);

  const canInstall = Boolean(
    tenant && showPwaInstall && !isStandalone && (installPrompt || device?.manualMode),
  );
  const value = useMemo(() => ({ canInstall, install }), [canInstall, install]);

  return (
    <PwaContext.Provider value={value}>
      {children}

      {!installBannerDismissed && canInstall ? (
        // A deliberately dark band: it opts into `dark` and then styles itself with
        // ordinary semantic tokens, per apps/storefront/CLAUDE.md. Literal
        // white/black utilities would ignore a tenant's brand and fail
        // the theme-token guard.
        <aside
          className="dark fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 mx-auto grid max-w-xl grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-border bg-background/80 p-3 pr-9 text-foreground shadow-2xl backdrop-blur-md lg:hidden"
          aria-label={t('install.title')}
        >
          <Image
            src={brand.appleTouchIconUrl}
            alt=""
            className="size-12 shrink-0 rounded-xl object-cover shadow-sm"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{appName}</p>
            <p className="line-clamp-2 text-xs leading-4 text-muted-foreground">
              {t('install.description')}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            className="h-10 shrink-0 px-3 text-xs"
            onClick={() => void install()}
          >
            {t('install.action')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-0 top-0 size-9 text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={dismissInstall}
            aria-label={t('install.dismiss')}
          >
            <X aria-hidden="true" />
          </Button>
        </aside>
      ) : null}

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
                <ExternalLink
                  className="mt-0.5 size-5 shrink-0 text-primary"
                  aria-hidden="true"
                />
              ),
            }
          : {
              title: t('browser.androidTitle'),
              description: t('browser.androidDescription'),
              firstStep: t('browser.androidOpenStep'),
              secondStep: t('browser.androidAddStep'),
              firstIcon: (
                <ExternalLink
                  className="mt-0.5 size-5 shrink-0 text-primary"
                  aria-hidden="true"
                />
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
