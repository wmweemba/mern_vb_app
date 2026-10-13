import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import UpgradePage from '../pages/UpgradePage';

jest.mock('axios');
jest.mock('../lib/utils', () => ({ API_BASE_URL: 'http://localhost:5000/api' }));
jest.mock('@clerk/clerk-react', () => ({
  useUser: () => ({ user: { fullName: 'Test User', primaryEmailAddress: { emailAddress: 't@example.com' } } }),
}));

const mockUseAuth = jest.fn();
jest.mock('../store/auth', () => ({
  useAuth: () => mockUseAuth(),
}));

const PLANS_RESPONSE = {
  starter: { name: 'Starter', price: 200, currency: 'ZMW', memberLimit: 20 },
  standard: { name: 'Standard', price: 300, currency: 'ZMW', memberLimit: 40 },
};

function mockAxiosGet({ history = { data: [] }, latest = { data: { enabled: false, attempt: null } } } = {}) {
  axios.get.mockImplementation(url => {
    if (url.endsWith('/billing/plans')) {
      return Promise.resolve({ data: PLANS_RESPONSE });
    }
    if (url.endsWith('/billing/lipila/history')) {
      return Promise.resolve({ data: history });
    }
    if (url.endsWith('/billing/lipila/latest')) {
      return Promise.resolve({ data: latest });
    }
    return Promise.resolve({ data: {} });
  });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <UpgradePage />
    </MemoryRouter>
  );
}

async function flushPromises() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('UpgradePage (U12 guards + history)', () => {
  it('member role sees the ask-your-admin sentence, no pay card, and /latest is never called', async () => {
    mockUseAuth.mockReturnValue({ user: { role: 'member', memberCount: 10 } });
    mockAxiosGet();

    renderPage();
    await flushPromises();

    expect(
      screen.getByText(/Ask your group admin or treasurer to renew the subscription\./)
    ).toBeInTheDocument();

    // Select a plan — even then, a member never sees the Lipila pay card.
    fireEvent.click(screen.getAllByRole('button', { name: /subscribe/i })[0]);
    await flushPromises();

    expect(screen.queryByText(/Pay now with mobile money/)).not.toBeInTheDocument();
    expect(
      axios.get.mock.calls.some(([url]) => url.endsWith('/billing/lipila/latest'))
    ).toBe(false);
  });

  it('21 members disables Starter with the sentence and leaves Standard selectable', async () => {
    mockUseAuth.mockReturnValue({ user: { role: 'admin', memberCount: 21 } });
    mockAxiosGet();

    renderPage();
    await flushPromises();

    expect(
      screen.getByText('Your group has 21 members. Starter covers up to 20.')
    ).toBeInTheDocument();

    const subscribeButtons = screen.getAllByRole('button', { name: /subscribe/i });
    expect(subscribeButtons[0]).toBeDisabled(); // Starter
    expect(subscribeButtons[1]).not.toBeDisabled(); // Standard
  });

  it('41 members disables both plans and shows contact-us', async () => {
    mockUseAuth.mockReturnValue({ user: { role: 'admin', memberCount: 41 } });
    mockAxiosGet();

    renderPage();
    await flushPromises();

    expect(screen.getByText(/Contact us to subscribe/)).toBeInTheDocument();
    const subscribeButtons = screen.getAllByRole('button', { name: /subscribe/i });
    subscribeButtons.forEach(btn => expect(btn).toBeDisabled());
  });

  it('a no-expiry paid group never shows the Lipila pay card', async () => {
    mockUseAuth.mockReturnValue({
      user: { role: 'admin', memberCount: 5, isPaid: true, paidUntil: null },
    });
    mockAxiosGet({ latest: { data: { enabled: true, attempt: null } } });

    renderPage();
    await flushPromises();

    fireEvent.click(screen.getAllByRole('button', { name: /subscribe/i })[0]);
    await flushPromises();

    expect(screen.queryByText(/Pay now with mobile money/)).not.toBeInTheDocument();
    expect(
      axios.get.mock.calls.some(([url]) => url.endsWith('/billing/lipila/latest'))
    ).toBe(false);
  });

  it('renders payment history rows with masked numbers for admin/treasurer', async () => {
    mockUseAuth.mockReturnValue({ user: { role: 'treasurer', memberCount: 5 } });
    mockAxiosGet({
      history: {
        data: [
          {
            date: '2026-10-01',
            plan: 'starter',
            amount: 200,
            currency: 'ZMW',
            maskedMsisdn: '•••123',
            providerExternalId: 'LIP-001',
            initiatedByName: 'Jane Treasurer',
            paidUntilAfter: '2026-11-01',
          },
          {
            date: '2026-09-01',
            plan: 'standard',
            amount: 300,
            currency: 'ZMW',
            maskedMsisdn: '•••456',
            providerExternalId: 'LIP-002',
            initiatedByName: 'Jane Treasurer',
            paidUntilAfter: '2026-10-01',
          },
        ],
      },
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('Payment history')).toBeInTheDocument());

    expect(screen.getByText(/•••123/)).toBeInTheDocument();
    expect(screen.getByText(/•••456/)).toBeInTheDocument();
    expect(screen.getByText(/K200/)).toBeInTheDocument();
    expect(screen.getByText(/K300/)).toBeInTheDocument();
  });
});
