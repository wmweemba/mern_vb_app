import React from 'react';
import { render, screen, act } from '@testing-library/react';
import Users from '../pages/Users';

jest.mock('axios', () => ({ get: jest.fn(() => Promise.resolve({ data: [] })) }));
jest.mock('../lib/utils', () => ({
  API_BASE_URL: 'http://localhost:4000/api'
}));

describe('Users Page', () => {
  it('renders user management UI', async () => {
    await act(async () => {
      render(<Users />);
    });
    expect(await screen.findByText(/Add New User/i)).toBeInTheDocument();
    expect(await screen.findByPlaceholderText(/Username/i)).toBeInTheDocument();
    const nameInputs = await screen.findAllByPlaceholderText(/Name/i);
    expect(nameInputs.length).toBeGreaterThan(0);
    expect(await screen.findByPlaceholderText(/Email/i)).toBeInTheDocument();
    expect(await screen.findByPlaceholderText(/Phone/i)).toBeInTheDocument();
    expect(await screen.findByRole('combobox')).toBeInTheDocument();
  });
}); 