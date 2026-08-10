import type { TranslationShape } from '../translation-shape';
import type { viPwa } from '../vi/pwa';

export const enPwa = {
  install: {
    title: 'Install {tenant}',
    titleFallback: 'Install this store app',
    description: 'Launch {tenant} from your home screen and see a fallback page when offline.',
    descriptionFallback: 'Launch from your home screen and see a fallback page when offline.',
    headerAction: 'Install app',
    compactAction: 'Install',
    action: 'Install app',
    later: 'Maybe later',
  },
  ios: {
    title: 'Add to Home Screen',
    description: 'Safari on iPhone and iPad installs apps from the Share menu.',
    shareStep: 'Tap the Share button in the Safari toolbar.',
    addStep: 'Choose “Add to Home Screen”, then confirm Add.',
  },
  android: {
    title: 'Install from Chrome',
    description: 'Chrome can add the app to your home screen from its browser menu.',
    menuStep: 'Tap the three-dot menu in the top corner of Chrome.',
    addStep: 'Choose “Install app” or “Add to Home screen”, then confirm.',
  },
  browser: {
    iosTitle: 'Open in Safari to install',
    iosDescription: 'This browser cannot start the app installation flow on iPhone or iPad.',
    iosOpenStep: 'Use Share or the browser menu to open this page in Safari.',
    iosAddStep: 'In Safari, tap Share and choose “Add to Home Screen”.',
    androidTitle: 'Open in Chrome to install',
    androidDescription: 'This browser cannot start the app installation flow on Android.',
    androidOpenStep: 'Use the browser menu to open this page in Chrome.',
    androidAddStep: 'In Chrome, open the menu and choose “Install app” or “Add to Home screen”.',
  },
  guide: {
    close: 'Got it',
  },
  update: {
    title: 'An update is ready',
    description: 'Update when you are ready. The page will reload once.',
    action: 'Update',
  },
} satisfies TranslationShape<typeof viPwa>;
