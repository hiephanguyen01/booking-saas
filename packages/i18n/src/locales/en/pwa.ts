import type { TranslationShape } from '../translation-shape';
import type { viPwa } from '../vi/pwa';

export const enPwa = {
  install: {
    title: 'Install this store app',
    description: 'Launch from your home screen and see a fallback page when offline.',
    headerAction: 'Install app',
    action: 'Install now',
    dismiss: 'Close the install invitation',
  },
  ios: {
    title: 'Add to Home Screen',
    description: 'On iPhone and iPad, install the app from your browser Share menu.',
    shareStep: 'Tap the Share button in your browser toolbar.',
    addStep: 'Choose “Add to Home Screen”, then confirm Add.',
    close: 'Got it',
  },
  update: {
    title: 'An update is ready',
    description: 'Update when you are ready. The page will reload once.',
    action: 'Update',
  },
} satisfies TranslationShape<typeof viPwa>;
