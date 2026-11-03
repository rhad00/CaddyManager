import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { describeError } from '../utils/api';
import { APP_VERSION } from '../utils/version';
import { BrandMark } from '../components/layout/icons';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const inputClass =
  'mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500';
const primaryButton =
  'flex w-full justify-center rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50';

/** The request path the product manages, drawn as the route line the menu uses */
const RouteTrace = () => (
  <ol className="relative ml-1 space-y-7 border-l border-trace/30 pl-7 font-mono text-sm">
    {[
      ['https://app.example.com', 'a visitor asks for a domain'],
      ['caddy', 'TLS, rules and headers apply'],
      ['http://10.0.0.5:8080', 'the upstream answers'],
    ].map(([where, what]) => (
      <li key={where} className="relative">
        <span aria-hidden="true" className="absolute top-1.5 -left-[2.2rem] h-2.5 w-2.5 rounded-full bg-trace ring-4 ring-trace/20" />
        <span className="text-white">{where}</span>
        <span className="mt-0.5 block font-sans text-xs text-slate-400">{what}</span>
      </li>
    ))}
  </ol>
);

/** Frame of the sign-in screens: the route on the left from wide screens up, the form beside it */
const AuthFrame = ({ title, subtitle, children }) => (
  <div className="grid min-h-screen lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
    <aside className="hidden flex-col justify-between bg-ink p-12 lg:flex" aria-hidden="true">
      <div className="flex items-center gap-3">
        <BrandMark className="h-9 w-9" />
        <span className="text-lg font-semibold text-white">CaddyManager</span>
      </div>
      <RouteTrace />
      <span className="font-mono text-xs text-slate-500">{APP_VERSION}</span>
    </aside>

    <main className="flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3 lg:hidden">
          <BrandMark className="h-9 w-9" />
          <span className="text-lg font-semibold text-gray-900">CaddyManager</span>
          <span className="font-mono text-xs text-gray-500">{APP_VERSION}</span>
        </div>
        <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
        <p className="mt-1 text-sm text-gray-600">{subtitle}</p>
        {children}
      </div>
    </main>
  </div>
);

const ErrorNote = ({ children }) => (
  <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
    {children}
  </div>
);

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
        setErrorMessage(result.message || 'Sign-in failed. Check your email and password.');
      }
    } catch (err) {
      setErrorMessage(describeError(err, 'sign in'));
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
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        setCurrentUser(data.user);
        navigate('/');
      } else {
        setErrorMessage(
          data.message ||
            (res.status >= 500
              ? 'The server could not check the code. Try again in a moment; if it keeps failing, look at the backend log.'
              : 'That code was not accepted. Codes last 30 seconds: wait for the next one, or use a backup code.'),
        );
      }
    } catch (err) {
      setErrorMessage(describeError(err, 'check the code'));
    } finally {
      setIsLoading(false);
    }
  };

  // ── 2FA step ──────────────────────────────────────────────────────────────
  if (totpSession) {
    return (
      <AuthFrame title="Two-factor authentication" subtitle="Enter the 6-digit code from your authenticator app, or a backup code.">
        <form className="mt-8 space-y-6" onSubmit={handleTotpSubmit}>
          {errorMessage && <ErrorNote>{errorMessage}</ErrorNote>}
          <div>
            <label htmlFor="totp" className="block text-sm font-medium text-gray-700">
              Authentication code
            </label>
            <input
              id="totp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value)}
              required
              autoFocus
              maxLength={8}
              className={`${inputClass} text-center font-mono text-xl tracking-widest`}
            />
          </div>
          <button type="submit" disabled={isLoading} className={primaryButton}>
            {isLoading ? 'Verifying…' : 'Verify'}
          </button>
          <button
            type="button"
            onClick={() => {
              setTotpSession(null);
              setErrorMessage('');
            }}
            className="w-full text-center text-sm text-gray-600 hover:text-gray-900"
          >
            Back to sign in
          </button>
        </form>
      </AuthFrame>
    );
  }

  // ── Password step ─────────────────────────────────────────────────────────
  return (
    <AuthFrame title="Sign in" subtitle="Manage your Caddy proxies, certificates and DNS.">
      <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
        {(errorMessage || error) && <ErrorNote>{errorMessage || error}</ErrorNote>}

        <div className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <button type="submit" disabled={isLoading} className={primaryButton}>
          {isLoading ? 'Signing in…' : 'Sign in'}
        </button>

        <div className="text-center">
          <Link to="/password-reset" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
            Forgot your password?
          </Link>
        </div>
      </form>
    </AuthFrame>
  );
};

export default Login;
