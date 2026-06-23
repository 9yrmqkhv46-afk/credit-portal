'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { User } from '@/types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (name: string, email: string, password: string) => Promise<User>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function setCookie(name: string, value: string, days: number = 1) {
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${name}=${value}; expires=${expires}; path=/; SameSite=Lax`;
}

function removeCookie(name: string) {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax`;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

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
      // Ensure cookies are synced for middleware
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

  const login = async (email: string, password: string): Promise<User> => {
    const response = await api.post('/auth/login', { email, password });
    const { token, user: userData } = response.data;
    localStorage.setItem('token', token);
    setCookie('token', token);
    setCookie('role', userData.role);
    setUser(userData);
    return userData;
  };

  const register = async (name: string, email: string, password: string): Promise<User> => {
    const response = await api.post('/auth/register', { name, email, password });
    const { token, user: userData } = response.data;
    localStorage.setItem('token', token);
    setCookie('token', token);
    setCookie('role', userData.role);
    setUser(userData);
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
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
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
