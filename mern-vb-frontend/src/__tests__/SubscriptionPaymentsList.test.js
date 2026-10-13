import React from 'react';
import { render, screen, act } from '@testing-library/react';
import axios from 'axios';
import SubscriptionPaymentsList from '../features/admin/SubscriptionPaymentsList';

jest.mock('axios');
jest.mock('../lib/utils', () => ({ API_BASE_URL: 'http://localhost:5000/api' }));

async function flushPromises() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('SubscriptionPaymentsList', () => {
  it('renders a success row and a failed row with failureReason and TEST AMOUNT badge', async () => {
    axios.get.mockResolvedValue({
      data: {
        data: [
          {
            id: 'p1',
            createdAt: '2026-10-10T08:00:00.000Z',
            completedAt: '2026-10-10T08:01:00.000Z',
            plan: 'standard',
            amount: 250,
            currency: 'ZMW',
            status: 'success',
            failureReason: null,
            maskedMsisdn: '•••123',
            providerExternalId: 'REF123',
            isTestAmount: false,
            amountMismatch: false,
            wasLateSuccess: false,
            initiatedByName: 'Jane Treasurer',
            paidUntilAfter: '2026-11-10T00:00:00.000Z',
          },
          {
            id: 'p2',
            createdAt: '2026-10-09T08:00:00.000Z',
            completedAt: null,
            plan: 'starter',
            amount: 1,
            currency: 'ZMW',
            status: 'failed',
            failureReason: 'Wrong PIN entered by subscriber',
            maskedMsisdn: '•••999',
            providerExternalId: null,
            isTestAmount: true,
            amountMismatch: false,
            wasLateSuccess: false,
            initiatedByName: 'Jane Treasurer',
            paidUntilAfter: null,
          },
        ],
      },
    });

    render(<SubscriptionPaymentsList groupId="g1" />);
    await flushPromises();

    expect(screen.getByText('Standard')).toBeInTheDocument();
    expect(screen.getByText('K250')).toBeInTheDocument();
    expect(screen.getByText(/•••123/)).toBeInTheDocument();

    expect(screen.getByText('Wrong PIN entered by subscriber')).toBeInTheDocument();
    expect(screen.getByText('Test amount')).toBeInTheDocument();
    expect(screen.getByText(/•••999/)).toBeInTheDocument();
  });

  it('shows the empty state when there are no payments', async () => {
    axios.get.mockResolvedValue({ data: { data: [] } });

    render(<SubscriptionPaymentsList groupId="g1" />);
    await flushPromises();

    expect(screen.getByText('No automated payments yet.')).toBeInTheDocument();
  });

  it('shows an error state when the request fails', async () => {
    axios.get.mockRejectedValue(new Error('network'));

    render(<SubscriptionPaymentsList groupId="g1" />);
    await flushPromises();

    expect(screen.getByText('Failed to load payments.')).toBeInTheDocument();
  });
});
