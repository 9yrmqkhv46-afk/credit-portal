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

export default function AdminLoginPage() {
  const router = useRouter();
  const { login, logout } = useAuth();
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

      if (user.role === 'ADMIN') {
        router.push('/admin');
      } else {
        // Authenticated, but not an administrator. Clear the session and refuse
        // access to the admin portal.
        logout();
        setError('These credentials are not authorized for administrator access.');
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
      <GlassBackground variant="dark" />
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center justify-center rounded-xl bg-white/90 px-4 py-2 shadow-sm" aria-label="TransformBiz home">
            <Logo width={220} />
          </Link>
          <div className="mt-6 inline-flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-slate-900/70 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white ring-1 ring-white/20 backdrop-blur">
              Admin
            </span>
          </div>
          <h2 className="mt-4 text-2xl font-bold text-white">Administrator Sign In</h2>
          <p className="mt-2 text-sm text-slate-300">Authorized personnel only</p>
        </div>

        <div className="glass-dark rounded-2xl overflow-hidden text-white">
          {/* Dark slate accent bar to visually distinguish the admin entrance. */}
          <div className="bg-slate-900/60 px-8 py-3 border-b border-white/10">
            <p className="text-sm font-medium text-slate-100">Restricted access portal</p>
          </div>

          <div className="m-3 rounded-xl bg-white/85 p-7 backdrop-blur-md shadow-inner">
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
                placeholder="admin@transformbiz.com.au"
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
                Sign In as Administrator
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-slate-600">
              Not an admin?{' '}
              <Link href="/login" className="text-brand hover:text-brand-dark font-medium">
                Client sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
