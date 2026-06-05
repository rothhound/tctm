import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { SettingsPage } from './SettingsPage';
import { api } from '../store/api';
import { authSlice } from '../store/authSlice';

function makeStore() {
  return configureStore({
    reducer: { [api.reducerPath]: api.reducer, auth: authSlice.reducer },
    middleware: (gDM) => gDM().concat(api.middleware),
  });
}

function renderPage() {
  return render(
    <Provider store={makeStore()}>
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    </Provider>,
  );
}

describe('SettingsPage', () => {
  it('renders the "Settings" heading', () => {
    renderPage();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('sets the page title', () => {
    renderPage();
    expect(document.title).toBe('TCTM | Settings');
  });

  it('renders all navigation links', () => {
    renderPage();
    expect(screen.getByText('Contacts & Entities')).toBeInTheDocument();
    expect(screen.getByText('Prompt Versions')).toBeInTheDocument();
    expect(screen.getByText('Metrics')).toBeInTheDocument();
    expect(screen.getByText('Audit Log')).toBeInTheDocument();
  });

  it('renders descriptions for each section', () => {
    renderPage();
    expect(screen.getByText('People, companies, funds, deals')).toBeInTheDocument();
    expect(screen.getByText('View, activate, and rollback LLM prompts')).toBeInTheDocument();
    expect(screen.getByText('Signal volume, LLM costs, extraction ratio')).toBeInTheDocument();
    expect(screen.getByText('Every LLM call with cost and latency')).toBeInTheDocument();
  });

  it('renders the sign out button', () => {
    renderPage();
    expect(screen.getByText('Sign out')).toBeInTheDocument();
  });
});
