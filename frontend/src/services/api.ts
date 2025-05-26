import axios from 'axios';

// In production, Nginx handles proxying /api requests to the backend service
const API_URL = '/api/v1';

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

import { authService } from './authService';

// Add auth token to requests if available
api.interceptors.request.use(config => {
  const token = authService.getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle response errors
api.interceptors.response.use(
  response => response,
  async error => {
    if (error.response?.status === 401) {
      authService.logout();
    }
    return Promise.reject(error);
  },
);

export interface ApiError {
  status: string;
  message: string;
  validationErrors?: Array<{ field: string; message: string }>;
}

// Convert axios error to our API error type
export const extractError = (error: unknown): ApiError => {
  if (axios.isAxiosError(error) && error.response?.data) {
    return error.response.data as ApiError;
  }
  return {
    status: 'error',
    message: error instanceof Error ? error.message : 'An unknown error occurred',
  };
};
