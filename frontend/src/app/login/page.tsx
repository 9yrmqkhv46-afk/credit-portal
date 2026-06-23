'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { Logo } from '@/components/ui/Logo';
import { GlassBackground } from '@/components/ui/GlassBackground';
import { AxiosError } from 'axios';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }

    setLoading(true);
    try {
      const user = await login(email, password);
      // AuthContext already sets the token+role cookies (with SameSite=Lax and
      // Secure on HTTPS). No need to set them again here.

      if (user.role === 'ADMIN') {
        router.push('/admin');
      } else {
        router.push('/dashboard');
      }
    } catch (err) {
      const axiosError = err as AxiosError<{ error?: string }>;
      setError(axiosError.response?.data?.error || 'Invalid email or password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4">
      <GlassBackground variant="light" />
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center justify-center rounded-xl bg-white/70 px-4 py-2 shadow-sm backdrop-blur" aria-label="TransformBiz home">
            <Logo width={220} />
          </Link>
          <h2 className="mt-6 text-2xl font-bold text-slate-900">Sign in to your account</h2>
          <p className="mt-2 text-sm text-slate-600">
            Or{' '}
            <Link href="/register" className="text-brand hover:text-brand-dark font-medium">
              create a new account
            </Link>
          </p>
        </div>

        <div className="glass rounded-2xl p-8">
          {error && (
            <Alert variant="error" className="mb-4">
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
            />
            <Button type="submit" loading={loading} className="w-full">
              Sign In
            </Button>
          </form>
          <p className="mt-4 text-center text-xs text-slate-500">
            Admin and client accounts use the same sign-in.
          </p>
        </div>

        <p className="mt-6 text-center text-sm text-slate-600">
          Administrator?{' '}
          <Link href="/admin-login" className="text-brand hover:text-brand-dark font-medium">
            Sign in here
          </Link>
        </p>
      </div>
    </div>
  );
}
