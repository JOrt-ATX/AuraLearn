import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';

import { MESSAGES, SUPPORTED_LOCALES } from '@/i18n';
import { useUiStore } from '@/stores/uiStore';
import { jsonResponse, mockFetch, renderApp, setMobileViewport } from '@/test/render';
import { App } from '@/App';
import { render } from '@testing-library/react';

const ready = (): Response => jsonResponse({ status: 'ok' });
const unavailable = (): Response =>
  jsonResponse({ error: { code: 'service_unavailable', message: 'x' } }, 503);

describe.each(SUPPORTED_LOCALES)('home page in %s', (locale) => {
  it('shows the translated title, status and breadcrumb', async () => {
    mockFetch(ready);
    renderApp('/', locale);
    const messages = MESSAGES[locale];

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(messages.home.title);
    expect(await screen.findByText(messages.home.status.ready)).toBeInTheDocument();
    const trail = screen.getByRole('navigation', { name: messages.nav.breadcrumb });
    expect(within(trail).getByText(messages.nav.home)).toHaveAttribute('aria-current', 'page');
    expect(document.documentElement.lang).toBe(locale);
  });

  it('has no detectable accessibility violations', async () => {
    mockFetch(ready);
    const { container } = renderApp('/', locale);
    await screen.findByText(MESSAGES[locale].home.status.ready);
    // jsdom has no layout engine: colour contrast is covered by tokens.test.ts instead.
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});

describe('service status', () => {
  it('shows a localized message and lets the user retry when the API fails', async () => {
    let calls = 0;
    mockFetch(() => (++calls === 1 ? unavailable() : ready()));
    renderApp('/', 'es');

    expect(await screen.findByText(MESSAGES.es.home.status.unavailable)).toBeInTheDocument();
    expect(screen.queryByText(/service_unavailable/)).not.toBeInTheDocument(); // HR21

    await userEvent.click(screen.getByRole('button', { name: MESSAGES.es.common.retry }));
    expect(await screen.findByText(MESSAGES.es.home.status.ready)).toBeInTheDocument();
  });
});

describe('app shell', () => {
  it('mounts the complete application with its providers', async () => {
    mockFetch(ready);
    render(<App />);
    expect(await screen.findByText(MESSAGES.en.home.status.ready)).toBeInTheDocument();
  });

  it('treats a malformed readiness payload as unavailable', async () => {
    mockFetch(() => jsonResponse({ status: 'nope' }));
    renderApp();
    expect(await screen.findByText(MESSAGES.en.home.status.unavailable)).toBeInTheDocument();
  });

  it('opens the navigation as a localized drawer on small screens', async () => {
    setMobileViewport();
    mockFetch(ready);
    renderApp('/', 'es');
    await userEvent.click(screen.getByRole('button', { name: MESSAGES.es.nav.toggleSidebar }));
    const drawer = await screen.findByRole('dialog', { name: MESSAGES.es.nav.main });
    expect(within(drawer).getByRole('link', { name: MESSAGES.es.nav.home })).toBeInTheDocument();
  });
});

describe('navigation', () => {
  it('shows a localized not-found page with a way back', async () => {
    mockFetch(ready);
    renderApp('/does/not/exist', 'fr');
    expect(
      await screen.findByRole('heading', { name: MESSAGES.fr.notFound.title }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: MESSAGES.fr.notFound.backHome })).toHaveAttribute(
      'href',
      '/',
    );
  });

  it('collapses and expands the sidebar', async () => {
    mockFetch(ready);
    renderApp();
    const sidebar = document.querySelector('[data-slot="sidebar"][data-state]');
    expect(sidebar).toHaveAttribute('data-state', 'expanded');

    await userEvent.click(
      screen.getAllByRole('button', { name: MESSAGES.en.nav.toggleSidebar })[0]!,
    );
    expect(sidebar).toHaveAttribute('data-state', 'collapsed');
  });

  it('does not write the sidebar state to the browser (HR1)', async () => {
    mockFetch(ready);
    renderApp();
    await userEvent.click(
      screen.getAllByRole('button', { name: MESSAGES.en.nav.toggleSidebar })[0]!,
    );
    expect(document.cookie).toBe('');
    expect(window.localStorage.length).toBe(0);
  });
});

describe('command palette', () => {
  it('opens with Ctrl+K, navigates and switches language', async () => {
    mockFetch(ready);
    renderApp('/does/not/exist');
    const user = userEvent.setup();

    await user.keyboard('{Control>}k{/Control}');
    expect(
      await screen.findByPlaceholderText(MESSAGES.en.commandPalette.placeholder),
    ).toBeVisible();

    await user.click(screen.getByRole('option', { name: MESSAGES.en.languages.fr }));
    await waitFor(() => {
      expect(useUiStore.getState().locale).toBe('fr');
    });
    expect(
      screen.queryByPlaceholderText(MESSAGES.en.commandPalette.placeholder),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: MESSAGES.fr.notFound.title }),
    ).toBeInTheDocument();
  });

  it('can be opened from the header button', async () => {
    mockFetch(ready);
    renderApp();
    await userEvent.click(
      screen.getByRole('button', { name: MESSAGES.en.layout.openCommandPalette }),
    );
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});

describe('language selector', () => {
  it('switches the interface language', async () => {
    mockFetch(ready);
    renderApp();
    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: MESSAGES.en.layout.language }));
    await user.click(await screen.findByRole('option', { name: MESSAGES.es.languages.es }));
    expect(await screen.findByText(MESSAGES.es.home.title)).toBeInTheDocument();
  });
});
