import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import LipilaPayCard from '../features/billing/LipilaPayCard';

jest.mock('axios');
jest.mock('../lib/utils', () => ({ API_BASE_URL: 'http://localhost:5000/api' }));

const mockRefreshMembership = jest.fn();

jest.mock('../store/auth', () => ({
  useAuth: () => ({
    user: { role: 'admin', phone: '0979645911' },
    refreshMembership: mockRefreshMembership,
  }),
}));

function renderCard(plan = 'starter') {
  return render(
    <MemoryRouter>
      <LipilaPayCard plan={plan} />
    </MemoryRouter>
  );
}

// Flushes the microtask queue (promise .then chains) without relying on
// testing-library's waitFor/findBy, which poll via setTimeout and don't mix
// well with jest fake timers used elsewhere in this file for the 3s/150s poll.
async function flushPromises() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('LipilaPayCard', () => {
  it('renders nothing when the feature is disabled', async () => {
    axios.get.mockResolvedValue({ data: { data: { enabled: false, attempt: null } } });
    const { container } = renderCard();
    await flushPromises();
    expect(container).toBeEmptyDOMElement();
  });

  it('idle -> Pay -> pending shows server amount and masked number, then success on poll', async () => {
    jest.useFakeTimers();
    axios.get.mockResolvedValueOnce({ data: { data: { enabled: true, attempt: null } } });
    axios.post.mockResolvedValue({
      data: { data: { attemptId: 'att1', status: 'pending', amount: 250, currency: 'ZMW', maskedMsisdn: '•••123', resumed: false } },
    });

    renderCard();
    await flushPromises();

    fireEvent.click(screen.getByRole('button', { name: /pay now/i }));
    await flushPromises();

    expect(screen.getByText(/•••123/)).toBeInTheDocument();
    expect(screen.getByText(/K250/)).toBeInTheDocument();

    axios.get.mockResolvedValue({
      data: { data: { status: 'success', amount: 250, currency: 'ZMW', plan: 'starter', failureKind: null, paidUntil: '2026-12-01' } },
    });

    await act(async () => {
      jest.advanceTimersByTime(3000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText(/Payment received/)).toBeInTheDocument();
    expect(mockRefreshMembership).toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('poll returns failed with failureKind pin -> PIN message + Try again', async () => {
    jest.useFakeTimers();
    axios.get.mockResolvedValueOnce({ data: { data: { enabled: true, attempt: null } } });
    axios.post.mockResolvedValue({
      data: { data: { attemptId: 'att2', status: 'pending', amount: 250, currency: 'ZMW', maskedMsisdn: '•••123', resumed: false } },
    });

    renderCard();
    await flushPromises();
    fireEvent.click(screen.getByRole('button', { name: /pay now/i }));
    await flushPromises();

    axios.get.mockResolvedValue({
      data: { data: { status: 'failed', amount: 250, currency: 'ZMW', plan: 'starter', failureKind: 'pin', paidUntil: null } },
    });

    await act(async () => {
      jest.advanceTimersByTime(3000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText(/PIN was wrong/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    jest.useRealTimers();
  });

  it('150s with no resolution shows the still-waiting message', async () => {
    jest.useFakeTimers();
    axios.get.mockResolvedValueOnce({ data: { data: { enabled: true, attempt: null } } });
    axios.post.mockResolvedValue({
      data: { data: { attemptId: 'att3', status: 'pending', amount: 250, currency: 'ZMW', maskedMsisdn: '•••123', resumed: false } },
    });

    renderCard();
    await flushPromises();
    fireEvent.click(screen.getByRole('button', { name: /pay now/i }));
    await flushPromises();

    axios.get.mockResolvedValue({
      data: { data: { status: 'pending', amount: 250, currency: 'ZMW', plan: 'starter', failureKind: null, paidUntil: null } },
    });

    await act(async () => {
      jest.advanceTimersByTime(153000);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText(/Still waiting for confirmation/i)).toBeInTheDocument();
    jest.useRealTimers();
  });

  it('resumes into waiting state from /latest without calling initiate', async () => {
    axios.get.mockResolvedValue({
      data: {
        data: {
          enabled: true,
          attempt: { attemptId: 'att4', status: 'pending', amount: 400, currency: 'ZMW', maskedMsisdn: '•••999', plan: 'standard', failureKind: null, paidUntil: null },
        },
      },
    });

    renderCard('standard');
    await waitFor(() => expect(screen.getByText(/•••999/)).toBeInTheDocument());
    expect(screen.getByText(/K400/)).toBeInTheDocument();
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('shows the inline sentence for INVALID_MSISDN', async () => {
    axios.get.mockResolvedValueOnce({ data: { data: { enabled: true, attempt: null } } });
    axios.post.mockRejectedValue({ response: { status: 400, data: { error: 'INVALID_MSISDN' } } });

    renderCard();
    await waitFor(() => expect(screen.getByRole('button', { name: /pay now/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /pay now/i }));

    await waitFor(() =>
      expect(screen.getByText(/Enter an MTN, Airtel or Zamtel number/)).toBeInTheDocument()
    );
  });
});
