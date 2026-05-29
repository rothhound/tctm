import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SourceIcon } from './SourceIcon';

describe('SourceIcon', () => {
  it('renders Slack icon', () => {
    render(<SourceIcon source="slack" />);

    const wrapper = screen.getByTitle('slack');
    expect(wrapper).toBeInTheDocument();
    expect(wrapper.querySelector('svg')).toBeInTheDocument();
  });

  it('renders Gmail icon', () => {
    render(<SourceIcon source="gmail" />);

    const wrapper = screen.getByTitle('gmail');
    expect(wrapper).toBeInTheDocument();
    expect(wrapper.querySelector('svg')).toBeInTheDocument();
  });

  it('renders Notion icon', () => {
    render(<SourceIcon source="notion" />);

    const wrapper = screen.getByTitle('notion');
    expect(wrapper).toBeInTheDocument();
    expect(wrapper.querySelector('svg')).toBeInTheDocument();
  });

  it('renders Granola icon', () => {
    render(<SourceIcon source="granola" />);

    const wrapper = screen.getByTitle('granola');
    expect(wrapper).toBeInTheDocument();
    expect(wrapper.querySelector('svg')).toBeInTheDocument();
  });

  it('renders fallback initial for unknown source', () => {
    render(<SourceIcon source="jira" />);

    const wrapper = screen.getByTitle('jira');
    expect(wrapper).toBeInTheDocument();
    expect(wrapper.textContent).toBe('J');
  });

  it('renders "?" for empty/undefined source', () => {
    render(<SourceIcon source="" />);

    const wrapper = screen.getByTitle('');
    expect(wrapper).toBeInTheDocument();
    expect(wrapper.textContent).toBe('?');
  });
});
