/* eslint-disable react-refresh/only-export-components */
import { createContext, useState, useEffect, useContext } from 'react';

// Create the authentication context
const AuthContext = createContext();

// Custom hook to use the auth context
export const useAuth = () => {
  return useContext(AuthContext);
};

// Auth provider component
export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [csrfToken, setCsrfToken] = useState(null);

  // API URL from environment
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

  // Fetch CSRF Token
  useEffect(() => {
    const fetchCsrfToken = async () => {
      try {
        const response = await fetch(`${API_URL}/csrf-token`, {
          credentials: 'include'
        });
        if (response.ok) {
          const data = await response.json();
          setCsrfToken(data.csrfToken);
        }
      } catch (error) {
        console.error('Failed to fetch CSRF token:', error);
      }
    };
    fetchCsrfToken();
  }, [API_URL]);

  // Effect to check if user is already logged in via httpOnly cookie
  useEffect(() => {
    const checkLoggedIn = async () => {
      try {
        const response = await fetch(`${API_URL}/auth/me`, {
          credentials: 'include',
        });

        if (response.ok) {
          const data = await response.json();
          setCurrentUser(data.user);
        }
      } catch (error) {
        console.error('Auth check failed:', error);
      }

      setLoading(false);
    };

    checkLoggedIn();
  }, [API_URL]);

  // Login function
  const login = async (email, password) => {
    setLoading(true);
    setError(null);

    try {
      const headers = {
        'Content-Type': 'application/json'
      };
      if (csrfToken) {
        headers['x-csrf-token'] = csrfToken;
      }

      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (response.ok) {
        // 2FA required — return challenge ticket to Login page
        if (data.require_2fa) {
          return { success: true, require_2fa: true, totp_session: data.totp_session };
        }
        setCurrentUser(data.user);
        return { success: true };
      } else {
        setError(data.message || 'Login failed');
        return { success: false, message: data.message };
      }
    } catch (error) {
      console.error('Login error:', error);
      setError('Login failed. Please try again.');
      return { success: false, message: 'Login failed. Please try again.' };
    } finally {
      setLoading(false);
    }
  };

  // Logout function
  const logout = async () => {
    try {
      const headers = {};
      if (csrfToken) {
        headers['x-csrf-token'] = csrfToken;
      }

      // Call logout endpoint to clear httpOnly cookie
      await fetch(`${API_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Always clear local state regardless of API response
      setCurrentUser(null);
    }
  };

  // Context value
  const value = {
    currentUser,
    token,
    csrfToken,
    loading,
    error,
    login,
    logout,
    setToken,
    setCurrentUser,
    isAuthenticated: !!currentUser
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
