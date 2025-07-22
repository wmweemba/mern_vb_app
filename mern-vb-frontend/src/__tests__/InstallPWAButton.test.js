import React from 'react';
import { render, screen, act } from '@testing-library/react';
import InstallPWAButton from '../components/ui/InstallPWAButton';

describe('InstallPWAButton', () => {
  it('shows install banner when beforeinstallprompt is fired', async () => {
    render(<InstallPWAButton />);
    await act(async () => {
      window.dispatchEvent(new Event('beforeinstallprompt'));
    });
    expect(await screen.findByText(/Install this app for a better experience!/i)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Install/i })).toBeInTheDocument();
  });
}); 