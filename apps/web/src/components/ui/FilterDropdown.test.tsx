import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FilterDropdown } from './FilterDropdown';

type Color = 'all' | 'red' | 'blue' | 'green';

const OPTIONS: { value: Color; label: string }[] = [
  { value: 'all', label: 'All colors' },
  { value: 'red', label: 'Red' },
  { value: 'blue', label: 'Blue' },
  { value: 'green', label: 'Green' },
];

function renderDefault(props: Partial<React.ComponentProps<typeof FilterDropdown<Color>>> = {}) {
  const onChange = vi.fn();
  const utils = render(
    <FilterDropdown<Color>
      label="Color"
      value="all"
      defaultValue="all"
      options={OPTIONS}
      onChange={onChange}
      {...props}
    />,
  );
  return { ...utils, onChange };
}

describe('FilterDropdown', () => {
  it('renders the label and placeholder when value equals defaultValue', () => {
    renderDefault();
    expect(screen.getByText('Color:')).toBeInTheDocument();
    expect(screen.getByText('Any')).toBeInTheDocument();
  });

  it('uses custom placeholder when provided', () => {
    renderDefault({ placeholder: 'Choose…' });
    expect(screen.getByText('Choose…')).toBeInTheDocument();
  });

  it('shows the selected option label when value differs from defaultValue', () => {
    renderDefault({ value: 'red' });
    expect(screen.getByText('Red')).toBeInTheDocument();
    expect(screen.queryByText('Any')).not.toBeInTheDocument();
  });

  it('opens the menu on click and lists all options', () => {
    renderDefault();
    fireEvent.click(screen.getByRole('button', { name: /Color:/i }));

    expect(screen.getByText('All colors')).toBeInTheDocument();
    expect(screen.getByText('Red')).toBeInTheDocument();
    expect(screen.getByText('Blue')).toBeInTheDocument();
    expect(screen.getByText('Green')).toBeInTheDocument();
  });

  it('calls onChange with the selected value and closes the menu', () => {
    const { onChange } = renderDefault();
    fireEvent.click(screen.getByRole('button', { name: /Color:/i }));
    fireEvent.click(screen.getByText('Blue'));

    expect(onChange).toHaveBeenCalledWith('blue');
    expect(screen.queryByText('All colors')).not.toBeInTheDocument();
  });

  it('closes on outside click without triggering onChange', () => {
    const { onChange } = renderDefault();
    fireEvent.click(screen.getByRole('button', { name: /Color:/i }));
    expect(screen.getByText('All colors')).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByText('All colors')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('toggles the menu closed when the trigger is clicked again', () => {
    renderDefault();
    const trigger = screen.getByRole('button', { name: /Color:/i });
    fireEvent.click(trigger);
    expect(screen.getByText('All colors')).toBeInTheDocument();

    fireEvent.click(trigger);
    expect(screen.queryByText('All colors')).not.toBeInTheDocument();
  });

  it('applies active styling when value differs from defaultValue', () => {
    const { rerender } = renderDefault();
    const trigger = screen.getByRole('button', { name: /Color:/i });
    expect(trigger.className).not.toMatch(/bg-\[var\(--color-primary\)\]/);

    rerender(
      <FilterDropdown<Color>
        label="Color"
        value="red"
        defaultValue="all"
        options={OPTIONS}
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /Color:/i }).className).toMatch(/bg-\[var\(--color-primary\)\]/);
  });

  it('marks the currently selected option in the open menu', () => {
    renderDefault({ value: 'green' });
    fireEvent.click(screen.getByRole('button', { name: /Color:/i }));

    const items = screen.getAllByRole('button').filter((b) => b.textContent?.match(/^(All colors|Red|Blue|Green)$/));
    const greenItem = items.find((b) => b.textContent === 'Green')!;
    expect(greenItem.className).toMatch(/font-medium/);
  });

  it('renders custom option content via renderOption', () => {
    renderDefault({
      renderOption: (opt) => <span data-testid={`opt-${opt.value}`}>★ {opt.label}</span>,
    });
    fireEvent.click(screen.getByRole('button', { name: /Color:/i }));

    expect(screen.getByTestId('opt-red')).toHaveTextContent('★ Red');
    expect(screen.getByTestId('opt-blue')).toHaveTextContent('★ Blue');
  });
});
