import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReportModal } from './ReportModal';
import { REPORT_REASON_LABELS } from '@tctm/shared';

function renderModal(overrides: Partial<React.ComponentProps<typeof ReportModal>> = {}) {
  const props = {
    onSubmit: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  const result = render(<ReportModal {...props} />);
  return { ...result, ...props };
}

describe('ReportModal', () => {
  it('renders all report reason options', () => {
    renderModal();
    for (const label of Object.values(REPORT_REASON_LABELS)) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('calls onSubmit with selected reason', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderModal();

    await user.click(screen.getByText('Duplicate of another task'));
    await user.click(screen.getByText('Report'));

    expect(onSubmit).toHaveBeenCalledWith('duplicate');
  });

  it('calls onClose when cancel clicked', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();

    await user.click(screen.getByText('Cancel'));

    expect(onClose).toHaveBeenCalled();
  });

  it('shows text input for "other" reason', async () => {
    const user = userEvent.setup();
    renderModal();

    // Textarea should not exist before selecting "other"
    expect(screen.queryByPlaceholderText('Describe the issue...')).not.toBeInTheDocument();

    await user.click(screen.getByText('Other'));

    expect(screen.getByPlaceholderText('Describe the issue...')).toBeInTheDocument();
  });

  it('submit button disabled when no reason selected', () => {
    renderModal();
    const reportBtn = screen.getByText('Report');
    expect(reportBtn).toBeDisabled();
  });

  it('submit button disabled when "other" selected but text is empty', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByText('Other'));

    const reportBtn = screen.getByText('Report');
    expect(reportBtn).toBeDisabled();
  });

  it('submit button enabled when "other" selected and text is provided', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByText('Other'));
    await user.type(screen.getByPlaceholderText('Describe the issue...'), 'Bad extraction');

    const reportBtn = screen.getByText('Report');
    expect(reportBtn).not.toBeDisabled();
  });

  it('calls onSubmit with "other: <text>" when other reason is submitted', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderModal();

    await user.click(screen.getByText('Other'));
    await user.type(screen.getByPlaceholderText('Describe the issue...'), 'Totally wrong');
    await user.click(screen.getByText('Report'));

    expect(onSubmit).toHaveBeenCalledWith('other: Totally wrong');
  });

  it('calls onClose when backdrop overlay is clicked', async () => {
    const user = userEvent.setup();
    const { onClose, container } = renderModal();

    // The backdrop is the first child - a div with bg-black/20
    const backdrop = container.querySelector('.bg-black\\/20') as HTMLElement;
    await user.click(backdrop);

    expect(onClose).toHaveBeenCalled();
  });
});
