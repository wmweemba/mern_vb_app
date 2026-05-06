import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import SupportRequestDrawer from '../components/support/SupportRequestDrawer';

jest.mock('axios');
jest.mock('../lib/utils', () => ({ API_BASE_URL: 'http://localhost:5000/api' }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

jest.mock('@clerk/clerk-react', () => ({
  useUser: () => ({
    user: {
      fullName: 'Clerk Full Name',
      primaryEmailAddress: { emailAddress: 'clerk@example.com' },
    },
  }),
}));

jest.mock('../store/auth', () => ({
  useAuth: () => ({
    user: { name: 'Auth Member Name' },
  }),
}));

function renderDrawer(open = true) {
  const onClose = jest.fn();
  render(
    <MemoryRouter>
      <SupportRequestDrawer open={open} onClose={onClose} />
    </MemoryRouter>
  );
  return { onClose };
}

function submitForm() {
  const form = document.getElementById('support-request-form');
  fireEvent.submit(form);
}

describe('SupportRequestDrawer', () => {
  it('renders read-only Name and Email pre-filled from auth', () => {
    renderDrawer();
    const nameInputs = screen.getAllByDisplayValue('Auth Member Name');
    expect(nameInputs.length).toBeGreaterThan(0);
    expect(nameInputs[0]).toHaveAttribute('readOnly');

    const emailInputs = screen.getAllByDisplayValue('clerk@example.com');
    expect(emailInputs.length).toBeGreaterThan(0);
    expect(emailInputs[0]).toHaveAttribute('readOnly');
  });

  it('shows inline error when submitting without phone', async () => {
    renderDrawer();
    submitForm();
    await waitFor(() => {
      expect(screen.getAllByText(/Phone number is required/i)[0]).toBeInTheDocument();
    });
  });

  it('shows inline error when submitting with phone but no category', async () => {
    renderDrawer();
    const phoneInputs = screen.getAllByPlaceholderText(/e\.g\. 0979645911/i);
    fireEvent.change(phoneInputs[0], { target: { value: '0979645911' } });
    submitForm();
    await waitFor(() => {
      expect(screen.getAllByText(/Please choose a category/i)[0]).toBeInTheDocument();
    });
  });

  it('shows inline error when description is less than 5 characters', async () => {
    renderDrawer();
    const phoneInputs = screen.getAllByPlaceholderText(/e\.g\. 0979645911/i);
    fireEvent.change(phoneInputs[0], { target: { value: '0979645911' } });
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'question' } });
    const textareas = screen.getAllByPlaceholderText(/Describe the issue/i);
    fireEvent.change(textareas[0], { target: { value: 'Hi' } });
    submitForm();
    await waitFor(() => {
      expect(screen.getAllByText(/at least 5 characters/i)[0]).toBeInTheDocument();
    });
  });

  it('transitions to confirmation view on successful POST and shows ticket ID', async () => {
    axios.post.mockResolvedValue({ data: { success: true, ticketId: 'abc123' } });
    renderDrawer();

    const phoneInputs = screen.getAllByPlaceholderText(/e\.g\. 0979645911/i);
    fireEvent.change(phoneInputs[0], { target: { value: '0979645911' } });
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'billing' } });
    const textareas = screen.getAllByPlaceholderText(/Describe the issue/i);
    fireEvent.change(textareas[0], { target: { value: 'I have a billing question.' } });
    submitForm();

    await waitFor(() => {
      expect(screen.getAllByText(/Request received/i)[0]).toBeInTheDocument();
      expect(screen.getAllByText(/abc123/i)[0]).toBeInTheDocument();
    });
  });

  it('shows error banner on failed POST and stays on form view', async () => {
    axios.post.mockRejectedValue({
      response: { data: { error: 'Something went wrong on the server.' } },
    });
    renderDrawer();

    const phoneInputs = screen.getAllByPlaceholderText(/e\.g\. 0979645911/i);
    fireEvent.change(phoneInputs[0], { target: { value: '0979645911' } });
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'error' } });
    const textareas = screen.getAllByPlaceholderText(/Describe the issue/i);
    fireEvent.change(textareas[0], { target: { value: 'The app is crashing when I open it.' } });
    submitForm();

    await waitFor(() => {
      expect(screen.getAllByText(/Something went wrong on the server/i)[0]).toBeInTheDocument();
    });
    expect(screen.queryByText(/Request received/i)).not.toBeInTheDocument();
  });
});
