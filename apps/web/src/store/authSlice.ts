import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface AuthState {
  token: string | null;
  expiresAt: string | null;
}

const initialState: AuthState = {
  token: localStorage.getItem('token'),
  expiresAt: localStorage.getItem('expiresAt'),
};

export const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setCredentials(state, action: PayloadAction<{ token: string; expiresAt: string }>) {
      state.token = action.payload.token;
      state.expiresAt = action.payload.expiresAt;
      localStorage.setItem('token', action.payload.token);
      localStorage.setItem('expiresAt', action.payload.expiresAt);
    },
    logout(state) {
      state.token = null;
      state.expiresAt = null;
      localStorage.removeItem('token');
      localStorage.removeItem('expiresAt');
    },
  },
});

export const { setCredentials, logout } = authSlice.actions;
