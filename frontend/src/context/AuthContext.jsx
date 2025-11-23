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
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [csrfToken, setCsrfToken] = useState(null);

  // API URL from environment
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  // Fetch CSRF Token
  useEffect(() => {
    const fetchCsrfToken = async () => {
      try {
        const response = await fetch(`${API_URL}/api/csrf-token`);
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

  // Effect to check if user is already logged in
  useEffect(() => {
    const checkLoggedIn = async () => {
      if (token) {
        try {
          const response = await fetch(`${API_URL}/api/auth/me`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

          if (response.ok) {
            const data = await response.json();
            setCurrentUser(data.user);
          } else {
            // Token invalid or expired
            localStorage.removeItem('token');
            setToken(null);
          }
        } catch (error) {
          console.error('Auth check failed:', error);
          setError('Failed to authenticate user');
        }
      }

      setLoading(false);
    };

    checkLoggedIn();
  }, [token, API_URL]);

  // Login function
  const login = async (email, password) => {
    setLoading(true);
    setError(null);

    try {
      const headers = {
        'Content-Type': 'application/json'
      };
      if (csrfToken) {
        headers['CSRF-Token'] = csrfToken;
      }

      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (response.ok) {
        localStorage.setItem('token', data.token);
        setToken(data.token);
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
      const headers = {
        'Authorization': `Bearer ${token}`
      };
      if (csrfToken) {
        headers['CSRF-Token'] = csrfToken;
      }

      // Call logout endpoint (optional, as JWT is stateless)
      await fetch(`${API_URL}/api/auth/logout`, {
        method: 'POST',
        headers
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Always clear local state regardless of API response
      localStorage.removeItem('token');
      setToken(null);
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
    isAuthenticated: !!currentUser
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
