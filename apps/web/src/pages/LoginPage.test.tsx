import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { LoginPage } from './LoginPage';
import { api } from '../store/api';
import { authSlice } from '../store/authSlice';

function makeStore() {
  return configureStore({
    reducer: {
      [api.reducerPath]: api.reducer,
      auth: authSlice.reducer,
    },
    middleware: (gDM) => gDM().concat(api.middleware),
  });
}

function renderLoginPage() {
  return render(
    <Provider store={makeStore()}>
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    </Provider>,
  );
}

describe('LoginPage', () => {
  it('renders password input and sign in button', () => {
    renderLoginPage();

    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument();
    expect(screen.getByText('Sign in')).toBeInTheDocument();
  });

  it('disables sign in button when password is empty', () => {
    renderLoginPage();

    const button = screen.getByText('Sign in');
    expect(button).toBeDisabled();
  });

  it('enables sign in button when password is typed', async () => {
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByPlaceholderText('Password'), 'test-password');
    expect(screen.getByText('Sign in')).not.toBeDisabled();
  });

  it('renders the app title', () => {
    renderLoginPage();

    expect(screen.getByText('Assistant')).toBeInTheDocument();
  });
});
