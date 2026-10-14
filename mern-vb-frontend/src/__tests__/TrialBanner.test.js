import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import dayjs from 'dayjs';
import { MockAuthContext } from './testAuthContext';

jest.mock('../store/auth', () => {
  const React = require('react');
  const { MockAuthContext } = require('./testAuthContext');
  return { useAuth: () => React.useContext(MockAuthContext) };
});

import TrialBanner from '../components/TrialBanner';

function renderBanner(authValue) {
  return render(
    <MockAuthContext.Provider value={authValue}>
      <MemoryRouter>
        <TrialBanner />
      </MemoryRouter>
    </MockAuthContext.Provider>
  );
}

function baseAuth({ trialActive = false, ...userOverrides } = {}) {
  return {
    trialActive,
    isSuperAdmin: false,
    user: {
      role: 'admin',
      isPaid: false,
      paidUntil: null,
      ...userOverrides,
    },
  };
}

test('admin with paidUntil in 5 days shows ends-on text and a Renew now link to /upgrade', () => {
  const paidUntil = dayjs().add(5, 'day').toISOString();
  renderBanner(baseAuth({ role: 'admin', isPaid: true, paidUntil, trialActive: true }));

  expect(screen.getByText(/Your subscription ends on/)).toBeInTheDocument();
  expect(screen.getByText('Renew now')).toBeInTheDocument();
});

test('admin with paidUntil in 10 days renders nothing', () => {
  const paidUntil = dayjs().add(10, 'day').toISOString();
  const { container } = renderBanner(
    baseAuth({ role: 'admin', isPaid: true, paidUntil, trialActive: true })
  );

  expect(container).toBeEmptyDOMElement();
});

test('lapsed paid admin sees the new wording (not "free trial") and a Renew now link', () => {
  const paidUntil = dayjs().subtract(3, 'day').toISOString();
  renderBanner(baseAuth({ role: 'admin', isPaid: true, paidUntil, trialActive: false }));

  expect(screen.getByText(/Your subscription ended on/)).toBeInTheDocument();
  expect(screen.getByText('Renew now')).toBeInTheDocument();
  expect(screen.queryByText(/free trial/i)).not.toBeInTheDocument();
});

test('lapsed paid member sees "Ask your admin or treasurer to renew" with no upgrade link', () => {
  const paidUntil = dayjs().subtract(3, 'day').toISOString();
  renderBanner(baseAuth({ role: 'member', isPaid: true, paidUntil, trialActive: false }));

  expect(screen.getByText(/Your subscription ended on/)).toBeInTheDocument();
  expect(screen.getByText(/Ask your admin or treasurer to renew/)).toBeInTheDocument();
  expect(screen.queryByText('Renew now')).not.toBeInTheDocument();
});

test('expired never-paid trial shows today\'s existing message', () => {
  renderBanner(baseAuth({ role: 'admin', isPaid: false, paidUntil: null, trialActive: false }));

  expect(
    screen.getByText(/Your 15-day free trial has ended/)
  ).toBeInTheDocument();
  expect(screen.getByText('Upgrade Now')).toBeInTheDocument();
});

test('super admin sees nothing', () => {
  const paidUntil = dayjs().subtract(3, 'day').toISOString();
  const { container } = renderBanner({
    trialActive: false,
    isSuperAdmin: true,
    user: { role: 'admin', isPaid: true, paidUntil },
  });

  expect(container).toBeEmptyDOMElement();
});

test('paidUntil year 2099 (no real expiry) renders nothing', () => {
  const paidUntil = dayjs('2099-01-01').toISOString();
  const { container } = renderBanner(
    baseAuth({ role: 'admin', isPaid: true, paidUntil, trialActive: true })
  );

  expect(container).toBeEmptyDOMElement();
});
