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
import { Download, RefreshCw, Share, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { useServiceWorker } from '~/features/pwa/hooks/use-service-worker';
import { useShowPwaInstall } from '~/features/pwa/hooks/use-show-pwa-install';
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
  const location = useLocation();
  const showPwaInstall = useShowPwaInstall();
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [installBannerDismissed, setInstallBannerDismissed] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);
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
    setIsIos(isIosDevice());
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
    setShowIosGuide(false);
  }, [location.key, showPwaInstall]);

  const install = useCallback(async () => {
    if (isStandalone) return;
    if (installPrompt) {
      try {
        await installPrompt.prompt();
        const choice = await installPrompt.userChoice;
        if (choice.outcome === 'accepted') setInstallBannerDismissed(true);
      } catch {
        // A prompt can expire between the click and browser UI. Keep browsing.
      } finally {
        setInstallPrompt(null);
      }
      return;
    }
    if (isIos) setShowIosGuide(true);
  }, [installPrompt, isIos, isStandalone]);

  const dismissInstall = useCallback(() => {
    setInstallBannerDismissed(true);
  }, []);

  const canInstall = Boolean(tenant && showPwaInstall && !isStandalone && (installPrompt || isIos));
  const value = useMemo(() => ({ canInstall, install }), [canInstall, install]);

  return (
    <PwaContext.Provider value={value}>
      {children}

      {!installBannerDismissed && canInstall ? (
        <aside
          className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 mx-auto grid max-w-xl grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-white/15 bg-neutral-950/80 p-3 pr-9 text-white shadow-2xl backdrop-blur-md lg:hidden"
          aria-label={t('install.title')}
        >
          <Image
            src={brand.appleTouchIconUrl}
            alt=""
            className="size-12 shrink-0 rounded-xl object-cover shadow-sm"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{appName}</p>
            <p className="line-clamp-2 text-xs leading-4 text-white/75">
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
            className="absolute right-0 top-0 size-9 text-white/80 hover:bg-white/10 hover:text-white"
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

      <Dialog open={showIosGuide} onOpenChange={setShowIosGuide}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('ios.title')}</DialogTitle>
            <DialogDescription>{t('ios.description')}</DialogDescription>
          </DialogHeader>
          <ol className="space-y-3 text-sm">
            <li className="flex gap-3">
              <Share className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
              <span>{t('ios.shareStep')}</span>
            </li>
            <li className="flex gap-3">
              <Download className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
              <span>{t('ios.addStep')}</span>
            </li>
          </ol>
          <DialogFooter>
            <Button type="button" onClick={() => setShowIosGuide(false)}>
              {t('ios.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PwaContext.Provider>
  );
}

function isIosDevice(): boolean {
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}
