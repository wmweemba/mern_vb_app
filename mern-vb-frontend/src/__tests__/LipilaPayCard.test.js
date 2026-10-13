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

// F2 fix-up: /billing/lipila/latest is fetched by UpgradePage now, not by
// this card — every render here passes `enabled`/`checkedLatest`/
// `resumedAttempt` directly, the way UpgradePage does.
function renderCard({ plan = 'starter', enabled = true, checkedLatest = true, resumedAttempt = null } = {}) {
  return render(
    <MemoryRouter>
      <LipilaPayCard plan={plan} enabled={enabled} checkedLatest={checkedLatest} resumedAttempt={resumedAttempt} />
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
  it('renders nothing when the feature is disabled', () => {
    const { container } = renderCard({ enabled: false });
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing until the parent has checked /latest', () => {
    const { container } = renderCard({ checkedLatest: false });
    expect(container).toBeEmptyDOMElement();
  });

  it('idle -> Pay -> pending shows server amount and masked number, then success on poll', async () => {
    jest.useFakeTimers();
    axios.post.mockResolvedValue({
      data: { data: { attemptId: 'att1', status: 'pending', amount: 250, currency: 'ZMW', maskedMsisdn: '•••123', resumed: false } },
    });

    renderCard();

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
    axios.post.mockResolvedValue({
      data: { data: { attemptId: 'att2', status: 'pending', amount: 250, currency: 'ZMW', maskedMsisdn: '•••123', resumed: false } },
    });

    renderCard();
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
    axios.post.mockResolvedValue({
      data: { data: { attemptId: 'att3', status: 'pending', amount: 250, currency: 'ZMW', maskedMsisdn: '•••123', resumed: false } },
    });

    renderCard();
    fireEvent.click(screen.getByRole('button', { name: /pay now/i }));
    await flushPromises();

    axios.get.mockResolvedValue({
      data: { data: { status: 'pending', amount: 250, currency: 'ZMW', plan: 'starter', failureKind: null, paidUntil: null } },
    });

    await act(async () => {
      jest.advanceTimersByTime(150000);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText(/Still waiting for confirmation/i)).toBeInTheDocument();
    jest.useRealTimers();
  });

  it('resumes into waiting state from resumedAttempt without calling initiate', async () => {
    renderCard({
      plan: 'standard',
      resumedAttempt: {
        attemptId: 'att4',
        status: 'pending',
        amount: 400,
        currency: 'ZMW',
        maskedMsisdn: '•••999',
        plan: 'standard',
        failureKind: null,
        paidUntil: null,
      },
    });

    expect(screen.getByText(/•••999/)).toBeInTheDocument();
    expect(screen.getByText(/K400/)).toBeInTheDocument();
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('a resumed success uses the attempt\'s own plan, not the plan prop, and refreshes membership once', () => {
    renderCard({
      plan: 'starter', // deliberately different from the resumed attempt's own plan
      resumedAttempt: {
        attemptId: 'att5',
        status: 'success',
        amount: 300,
        plan: 'standard',
        paidUntil: '2026-12-01',
      },
    });

    expect(screen.getByText(/Payment received\. Your group is on Standard/)).toBeInTheDocument();
    expect(mockRefreshMembership).toHaveBeenCalledTimes(1);
  });

  it('shows the inline sentence for INVALID_MSISDN', async () => {
    axios.post.mockRejectedValue({ response: { status: 400, data: { error: 'INVALID_MSISDN' } } });

    renderCard();
    fireEvent.click(screen.getByRole('button', { name: /pay now/i }));

    await waitFor(() =>
      expect(screen.getByText(/Enter an MTN, Airtel or Zamtel number/)).toBeInTheDocument()
    );
  });

  it('does not overlap polls when a response is slow (chained setTimeout, not setInterval)', async () => {
    jest.useFakeTimers();
    let resolvePoll;
    axios.get.mockImplementation(() => new Promise(resolve => { resolvePoll = resolve; }));

    renderCard({
      resumedAttempt: { attemptId: 'attSlow', status: 'pending', amount: 250, maskedMsisdn: '•••123', plan: 'starter' },
    });

    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    expect(axios.get).toHaveBeenCalledTimes(1);

    // Still only one outstanding request after 10 more seconds — no second
    // poll is scheduled until the first one settles.
    await act(async () => {
      jest.advanceTimersByTime(10000);
    });
    expect(axios.get).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolvePoll({ data: { data: { status: 'pending', amount: 250, plan: 'starter' } } });
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    expect(axios.get).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });

  it('Try again clicked after the 150s limit ignores a stale in-flight response that later resolves to success', async () => {
    jest.useFakeTimers();
    let resolvePoll;
    axios.get.mockImplementation(() => new Promise(resolve => { resolvePoll = resolve; }));

    renderCard({
      resumedAttempt: { attemptId: 'attStale', status: 'pending', amount: 250, maskedMsisdn: '•••123', plan: 'starter' },
    });

    // First poll fires and is left unresolved (simulating a very slow request).
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    expect(axios.get).toHaveBeenCalledTimes(1);

    // The 150s overall limit elapses independently, while that request is
    // still in flight.
    await act(async () => {
      jest.advanceTimersByTime(150000);
    });
    expect(screen.getByText(/Still waiting for confirmation/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(screen.getByRole('button', { name: /^pay now$/i })).toBeInTheDocument();

    // The stale in-flight request now resolves with success — it must be
    // ignored, since the card has already moved back to idle.
    await act(async () => {
      resolvePoll({ data: { data: { status: 'success', amount: 250, plan: 'starter', paidUntil: '2026-12-01' } } });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.queryByText(/Payment received/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^pay now$/i })).toBeInTheDocument();
    jest.useRealTimers();
  });
});
