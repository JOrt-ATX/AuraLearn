import { create } from 'zustand';

import { detectLocale, type Locale } from '@/i18n';

/**
 * UI-only state. Server data lives in React Query, never here (javascript.mdc), and nothing is
 * persisted in the browser (HR1): the language is detected on load and, from phase 2, loaded
 * from the user's profile.
 */
interface UiState {
  locale: Locale;
  commandPaletteOpen: boolean;
  setLocale: (locale: Locale) => void;
  setCommandPaletteOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>()((set) => ({
  locale: detectLocale(navigator.languages),
  commandPaletteOpen: false,
  setLocale: (locale) => {
    set({ locale });
  },
  setCommandPaletteOpen: (open) => {
    set({ commandPaletteOpen: open });
  },
}));
