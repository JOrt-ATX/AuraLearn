import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

import { detectLocale } from '@/i18n';
import { useUiStore } from '@/stores/uiStore';

// jsdom lacks the layout/pointer APIs that Radix and cmdk rely on.
class ResizeObserverStub {
  observe(): void {
    /* jsdom has no layout engine */
  }
  unobserve(): void {
    /* jsdom has no layout engine */
  }
  disconnect(): void {
    /* jsdom has no layout engine */
  }
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

const desktopMatchMedia = (query: string): MediaQueryList =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }) as MediaQueryList;

Object.defineProperty(window, 'matchMedia', { writable: true, value: desktopMatchMedia });

Element.prototype.scrollIntoView = vi.fn();
Element.prototype.hasPointerCapture = vi.fn(() => false);
Element.prototype.setPointerCapture = vi.fn();
Element.prototype.releasePointerCapture = vi.fn();

afterEach(() => {
  cleanup();
  window.matchMedia = desktopMatchMedia;
  vi.unstubAllGlobals();
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  useUiStore.setState({ locale: detectLocale(['en']), commandPaletteOpen: false });
});
