import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePageTitle } from './usePageTitle';

describe('usePageTitle', () => {
  beforeEach(() => {
    document.title = 'TCTM';
  });

  it('sets document.title to "TCTM | {section}"', () => {
    renderHook(() => usePageTitle('Inbox'));

    expect(document.title).toBe('TCTM | Inbox');
  });

  it('resets document.title to "TCTM" on unmount', () => {
    const { unmount } = renderHook(() => usePageTitle('Settings'));

    expect(document.title).toBe('TCTM | Settings');

    unmount();

    expect(document.title).toBe('TCTM');
  });
});
