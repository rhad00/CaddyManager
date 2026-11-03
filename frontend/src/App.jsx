import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import PasswordResetRequest from './pages/PasswordResetRequest';
import PasswordResetForm from './pages/PasswordResetForm';
import ToastProvider from './components/ToastProvider';
import ErrorBoundary from './components/ErrorBoundary';
import AppShell from './components/layout/AppShell';
import { PAGES } from './routes';
import { HOME_PATH, pagesOf } from './navigation';
import { APP_TITLE } from './utils/version';

// Protected route component
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-gray-500">Loading…</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }

  return children;
};

const App = () => {
  // Every page (login and password reset included) names the app and the version it runs
  useEffect(() => {
    document.title = APP_TITLE;
  }, []);

  return (
    <ErrorBoundary>
      <AuthProvider>
        <ToastProvider />
        <Router>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/password-reset" element={<PasswordResetRequest />} />
            <Route path="/password-reset/confirm" element={<PasswordResetForm />} />
            <Route
              element={
                <ProtectedRoute>
                  <AppShell />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to={HOME_PATH} replace />} />
              {pagesOf().map((page) => (
                <Route key={page.id} path={`${page.path}/*`} element={PAGES[page.path]} />
              ))}
              {/* Where Users lived before the menu had submenus */}
              <Route path="/users" element={<Navigate to="/settings/users" replace />} />
            </Route>
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </Router>
      </AuthProvider>
    </ErrorBoundary>
  );
};

export default App;
