import { configureStore } from '@reduxjs/toolkit';
import { api } from './api';
import { authSlice, logout } from './authSlice';

export const store = configureStore({
  reducer: {
    [api.reducerPath]: api.reducer,
    auth: authSlice.reducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(api.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Multi-tab logout sync: when another tab clears the token in localStorage,
// dispatch logout here too. `storage` only fires in OTHER windows on that
// origin, so this won't loop on our own dispatch.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === 'token' && e.newValue === null) {
      store.dispatch(logout());
    }
  });
}
