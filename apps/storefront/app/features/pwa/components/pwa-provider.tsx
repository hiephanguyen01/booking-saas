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
import { Download, RefreshCw, Share, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useServiceWorker } from '~/features/pwa/hooks/use-service-worker';
import { PwaContext } from '~/features/pwa/lib/pwa-context';

const INSTALL_STATE_KEY = 'bookingos:pwa-install:v1';
const VISIT_SESSION_KEY = 'bookingos:pwa-visit-counted:v1';
const DISMISS_MS = 30 * 24 * 60 * 60 * 1000;
let countedWithoutSessionStorage = false;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface InstallState {
  visits: number;
  dismissedUntil: number;
}

export function PwaProvider({
  children,
  advertiseInstall,
}: {
  children: ReactNode;
  advertiseInstall: boolean;
}) {
  const { t } = useTranslation(NsI18n.Pwa);
  const { applyUpdate, updateAvailable } = useServiceWorker();
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);

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
      setShowInstallBanner(false);
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
    if (!advertiseInstall || isStandalone || (!installPrompt && !isIos)) {
      setShowInstallBanner(false);
      return;
    }
    const state = recordVisit();
    setShowInstallBanner(Boolean(state && state.visits >= 2 && state.dismissedUntil <= Date.now()));
  }, [advertiseInstall, installPrompt, isIos, isStandalone]);

  const install = useCallback(async () => {
    if (isStandalone) return;
    if (installPrompt) {
      try {
        await installPrompt.prompt();
        const choice = await installPrompt.userChoice;
        if (choice.outcome === 'accepted') setShowInstallBanner(false);
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
    setShowInstallBanner(false);
    writeInstallState({ ...readInstallState(), dismissedUntil: Date.now() + DISMISS_MS });
  }, []);

  const canInstall = advertiseInstall && !isStandalone && Boolean(installPrompt || isIos);
  const value = useMemo(() => ({ canInstall, install }), [canInstall, install]);

  return (
    <PwaContext.Provider value={value}>
      {children}

      {showInstallBanner && canInstall ? (
        <aside
          className="fixed inset-x-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-xl items-center gap-3 rounded-xl border bg-background p-3 shadow-xl md:bottom-4"
          aria-label={t('install.title')}
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Download aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{t('install.title')}</p>
            <p className="text-xs text-muted-foreground">{t('install.description')}</p>
          </div>
          <Button type="button" size="sm" onClick={() => void install()}>
            {t('install.action')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
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

function recordVisit(): InstallState | null {
  try {
    let counted = countedWithoutSessionStorage;
    try {
      counted = sessionStorage.getItem(VISIT_SESSION_KEY) === '1';
      if (!counted) sessionStorage.setItem(VISIT_SESSION_KEY, '1');
    } catch {
      countedWithoutSessionStorage = true;
    }
    const current = readInstallState();
    if (counted) return current;
    const next = { ...current, visits: current.visits + 1 };
    localStorage.setItem(INSTALL_STATE_KEY, JSON.stringify(next));
    return next;
  } catch {
    return null;
  }
}

function readInstallState(): InstallState {
  try {
    const value = JSON.parse(
      localStorage.getItem(INSTALL_STATE_KEY) ?? '{}',
    ) as Partial<InstallState>;
    return {
      visits: Number.isFinite(value.visits) ? Math.max(0, Number(value.visits)) : 0,
      dismissedUntil: Number.isFinite(value.dismissedUntil) ? Number(value.dismissedUntil) : 0,
    };
  } catch {
    return { visits: 0, dismissedUntil: 0 };
  }
}

function writeInstallState(state: InstallState) {
  try {
    localStorage.setItem(INSTALL_STATE_KEY, JSON.stringify(state));
  } catch {
    // Storage can be disabled; dismissal remains effective for this page state.
  }
}
