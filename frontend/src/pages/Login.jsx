import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // 2FA state
  const [totpSession, setTotpSession] = useState(null);
  const [totpCode, setTotpCode] = useState('');

  const { login, csrfToken, setCurrentUser, error } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage('');
    try {
      const result = await login(email, password);
      if (result.require_2fa) {
        setTotpSession(result.totp_session);
      } else if (result.success) {
        navigate('/');
      } else {
        setErrorMessage(result.message || 'Login failed');
      }
    } catch {
      setErrorMessage('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTotpSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage('');
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (csrfToken) headers['x-csrf-token'] = csrfToken;
      const res = await fetch(`${API_URL}/auth/2fa/challenge`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ totp_session: totpSession, code: totpCode }),
      });
      const data = await res.json();
      if (data.success) {
        setCurrentUser(data.user);
        navigate('/');
      } else {
        setErrorMessage(data.message || '2FA verification failed');
      }
    } catch {
      setErrorMessage('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  // ── 2FA step ──────────────────────────────────────────────────────────────
  if (totpSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <div className="w-full max-w-md p-8 space-y-8 bg-white rounded-lg shadow-md">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900">CaddyManager</h1>
            <p className="mt-2 text-gray-600">Two-factor authentication</p>
          </div>
          <form className="mt-8 space-y-6" onSubmit={handleTotpSubmit}>
            {errorMessage && (
              <div className="p-3 text-sm text-red-800 bg-red-100 rounded-md">{errorMessage}</div>
            )}
            <div>
              <label htmlFor="totp" className="block text-sm font-medium text-gray-700">
                Authentication code
              </label>
              <p className="text-xs text-gray-500 mt-0.5">Enter the 6-digit code from your authenticator app, or a backup code.</p>
              <input id="totp" type="text" inputMode="numeric" autoComplete="one-time-code"
                value={totpCode} onChange={e => setTotpCode(e.target.value)} required autoFocus
                maxLength={8}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-center text-xl tracking-widest"
              />
            </div>
            <button type="submit" disabled={isLoading}
              className="w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 disabled:opacity-50">
              {isLoading ? 'Verifying…' : 'Verify'}
            </button>
            <button type="button" onClick={() => { setTotpSession(null); setErrorMessage(''); }}
              className="w-full text-center text-sm text-gray-500 hover:text-gray-700">
              ← Back to login
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Password step ─────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <div className="w-full max-w-md p-8 space-y-8 bg-white rounded-lg shadow-md">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">CaddyManager</h1>
          <p className="mt-2 text-gray-600">Sign in to your account</p>
        </div>
        
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {(errorMessage || error) && (
            <div className="p-3 text-sm text-red-800 bg-red-100 rounded-md">
              {errorMessage || error}
            </div>
          )}
          
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email address
              </label>
              <input id="email" name="email" type="email" autoComplete="email" required
                value={email} onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <input id="password" name="password" type="password" autoComplete="current-password" required
                value={password} onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <button type="submit" disabled={isLoading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50">
              {isLoading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>

          <div className="text-center">
            <Link to="/password-reset" className="font-medium text-indigo-600 hover:text-indigo-500 text-sm">
              Forgot your password?
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;

