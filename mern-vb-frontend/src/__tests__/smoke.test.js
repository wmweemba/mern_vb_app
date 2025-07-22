import React from 'react';
import { render, screen } from '@testing-library/react';

test('renders a simple element', () => {
  render(<div>Hello World</div>);
  expect(screen.getByText('Hello World')).toBeInTheDocument();
}); 