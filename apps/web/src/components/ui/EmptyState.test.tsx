import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('renders the message text', () => {
    render(<EmptyState message="No tasks found" />);

    expect(screen.getByText('No tasks found')).toBeInTheDocument();
  });
});
