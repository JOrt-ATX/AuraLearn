import { render, screen } from '@testing-library/react';
import { useTranslations } from 'use-intl';
import { describe, expect, it } from 'vitest';

import { I18nProvider } from '@/i18n/I18nProvider';
import type { MessageKey } from '@/types/i18n';

function Probe({ messageKey }: { messageKey: string }) {
  const t = useTranslations();
  return <p>{t(messageKey as MessageKey)}</p>;
}

describe('I18nProvider', () => {
  it('never renders a technical key when a message is missing (HR21)', () => {
    render(
      <I18nProvider>
        <Probe messageKey="orders.status.in_review" />
      </I18nProvider>,
    );
    expect(screen.getByText('In Review')).toBeInTheDocument();
    expect(screen.queryByText(/orders\.status/)).not.toBeInTheDocument();
  });
});
