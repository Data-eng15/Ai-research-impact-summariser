import { render, screen } from '@testing-library/react';
import React from 'react';
import LandingPage from '../LandingPage';

test('renders app successfully', () => {
  render(<LandingPage onLogin={() => {}} />);
  expect(screen.getByText(/Impact Lab/i)).toBeInTheDocument();
});
