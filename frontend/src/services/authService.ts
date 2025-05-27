import { api } from './api';

interface LoginCredentials {
  email: string;
  password: string;
}

interface LoginResponse {
  token: string;
  user: {
    id: number;
    email: string;
  };
}

class AuthService {
  private tokenKey = 'token';

  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    const response = await api.post('/auth/login', credentials);
    const data = response.data;
    this.setToken(data.token);
    return data;
  }

  logout(): void {
    localStorage.removeItem(this.tokenKey);
    // Dispatch custom auth change event
    window.dispatchEvent(new CustomEvent('auth-token-changed', {
      detail: { key: this.tokenKey, oldValue: null, newValue: null }
    }));
  }

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  private setToken(token: string): void {
    const oldToken = localStorage.getItem(this.tokenKey);
    localStorage.setItem(this.tokenKey, token);
    // Dispatch custom auth change event
    window.dispatchEvent(new CustomEvent('auth-token-changed', {
      detail: { key: this.tokenKey, oldValue: oldToken, newValue: token }
    }));
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }
}

export const authService = new AuthService();
