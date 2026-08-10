import type { TranslationShape } from '../translation-shape';
import type { viPwa } from '../vi/pwa';

export const enPwa = {
  install: {
    menu: 'Install app',
    title: 'Install this store app',
    description: 'Launch from your home screen and see a fallback page when offline.',
    action: 'Install',
    dismiss: 'Hide the install invitation for 30 days',
  },
  ios: {
    title: 'Add to Home Screen',
    description: 'Safari on iPhone and iPad installs apps from the Share menu.',
    shareStep: 'Tap the Share button in the Safari toolbar.',
    addStep: 'Choose “Add to Home Screen”, then confirm Add.',
    close: 'Got it',
  },
  update: {
    title: 'An update is ready',
    description: 'Update when you are ready. The page will reload once.',
    action: 'Update',
  },
} satisfies TranslationShape<typeof viPwa>;
