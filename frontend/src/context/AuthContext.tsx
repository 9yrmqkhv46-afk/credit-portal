'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { User } from '@/types';

/** Login may complete, or require a second factor (emailed OTP). */
export type LoginResult = { user: User } | { otpRequired: true; devCode?: string };

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string, otp?: string) => Promise<LoginResult>;
  adminLogin: (password: string) => Promise<User>;
  register: (name: string, email: string, password: string, otp?: string) => Promise<User>;
  requestOtp: (email: string, purpose: 'REGISTER' | 'LOGIN') => Promise<{ devCode?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function setCookie(name: string, value: string, days: number = 1) {
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
  const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
  const secureFlag = isHttps ? '; Secure' : '';
  document.cookie = `${name}=${value}; expires=${expires}; path=/; SameSite=Lax${secureFlag}`;
}

function removeCookie(name: string) {
  const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
  const secureFlag = isHttps ? '; Secure' : '';
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax${secureFlag}`;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const persist = useCallback((token: string, userData: User) => {
    localStorage.setItem('token', token);
    setCookie('token', token);
    setCookie('role', userData.role);
    setUser(userData);
  }, []);

  const fetchUser = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setLoading(false);
        return;
      }
      const response = await api.get('/auth/me');
      const userData = response.data.user || response.data;
      setUser(userData);
      setCookie('token', token);
      setCookie('role', userData.role);
    } catch {
      localStorage.removeItem('token');
      removeCookie('token');
      removeCookie('role');
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const login = async (email: string, password: string, otp?: string): Promise<LoginResult> => {
    const response = await api.post('/auth/login', { email, password, otp });
    if (response.data?.otpRequired) {
      return { otpRequired: true, devCode: response.data.devCode };
    }
    const { token, user: userData } = response.data;
    persist(token, userData);
    return { user: userData };
  };

  const adminLogin = async (password: string): Promise<User> => {
    const response = await api.post('/auth/admin-login', { password });
    const { token, user: userData } = response.data;
    persist(token, userData);
    return userData;
  };

  const requestOtp = async (email: string, purpose: 'REGISTER' | 'LOGIN'): Promise<{ devCode?: string }> => {
    const response = await api.post('/auth/otp/request', { email, purpose });
    return { devCode: response.data?.devCode };
  };

  const register = async (name: string, email: string, password: string, otp?: string): Promise<User> => {
    const response = await api.post('/auth/register', { name, email, password, otp });
    const { token, user: userData } = response.data;
    persist(token, userData);
    return userData;
  };

  const logout = () => {
    localStorage.removeItem('token');
    removeCookie('token');
    removeCookie('role');
    setUser(null);
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, adminLogin, register, requestOtp, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
