import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { GoogleLogin, type CredentialResponse } from '@react-oauth/google';
import { useLoginWithGoogleMutation } from '../store/api';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setCredentials, selectIsAuthenticated } from '../store/authSlice';
import { safeRedirectOr } from '../utils/safeRedirect';
import { TctmLogo } from '../components/ui/TctmLogo';

export function LoginPage() {
  const [error, setError] = useState('');
  const [loginWithGoogle, { isLoading }] = useLoginWithGoogleMutation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);

  // Where to send the user after a successful login. Open-redirect protection
  // applied: any non-relative `from` falls back to /active.
  const target = safeRedirectOr(searchParams.get('from'), '/active');

  // If already authenticated, don't show the login button — bounce straight to
  // the intended target. (Covers users navigating to /login via back-button
  // or shared links while already signed in.)
  if (isAuthenticated) {
    return <Navigate to={target} replace />;
  }

  const handleSuccess = async (credentialResponse: CredentialResponse) => {
    setError('');
    if (!credentialResponse.credential) {
      setError('Sign-in failed: no credential returned.');
      return;
    }
    try {
      const result = await loginWithGoogle({ idToken: credentialResponse.credential }).unwrap();
      dispatch(setCredentials(result));
      navigate(target, { replace: true });
    } catch {
      setError('Sign-in failed. This account is not authorized.');
    }
  };

  return (
    <div className="h-full flex items-center justify-center bg-[var(--color-bg)] px-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="flex justify-center">
          <TctmLogo size={48} />
        </div>
        <p className="text-sm text-[var(--color-text-muted)]">
          Sign in with your authorized Google account to continue.
        </p>

        <div className="flex justify-center">
          <GoogleLogin
            onSuccess={handleSuccess}
            onError={() => setError('Sign-in failed. Please try again.')}
            theme="filled_black"
            size="large"
            text="signin_with"
            shape="rectangular"
            useOneTap={false}
          />
        </div>

        {isLoading && <p className="text-sm text-[var(--color-text-muted)]">Verifying...</p>}
        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
      </div>
    </div>
  );
}
