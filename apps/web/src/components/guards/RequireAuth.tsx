import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAppSelector } from '../../store/hooks';
import { selectIsAuthenticated } from '../../store/authSlice';

export function RequireAuth() {
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const location = useLocation();

  if (!isAuthenticated) {
    const target = location.pathname + location.search + location.hash;
    return <Navigate to={`/login?from=${encodeURIComponent(target)}`} replace />;
  }

  return <Outlet />;
}
