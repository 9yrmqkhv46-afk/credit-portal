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

// Mirrors the backend policy in backend/src/routes/auth.ts.
const STRONG_PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,}$/;
const STRONG_PASSWORD_MESSAGE =
  'Password must be at least 10 characters and include uppercase, lowercase, number, and special character.';

export default function RegisterPage() {
  const router = useRouter();
  const { register, requestOtp } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [otpStage, setOtpStage] = useState(false);
  const [devHint, setDevHint] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name || !email || !password || !confirmPassword) {
      setError('Please fill in all fields.');
      return;
    }
    if (!STRONG_PASSWORD_REGEX.test(password)) {
      setError(STRONG_PASSWORD_MESSAGE);
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      // Step 1: request an email verification code.
      if (!otpStage) {
        const { devCode } = await requestOtp(email, 'REGISTER');
        setOtpStage(true);
        setDevHint(devCode ? `Dev code (no mail server): ${devCode}` : '');
        setLoading(false);
        return;
      }
      // Step 2: create the account with the code.
      if (!otp) { setError('Enter the 6-digit code sent to your email.'); setLoading(false); return; }
      await register(name, email, password, otp);
      router.push('/dashboard');
    } catch (err) {
      const axiosError = err as AxiosError<{ error?: string }>;
      setError(axiosError.response?.data?.error || 'Registration failed. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 py-10">
      <GlassBackground variant="light" />
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center justify-center rounded-xl bg-white/10 px-4 py-2 shadow-sm backdrop-blur" aria-label="TransformBiz home">
            <Logo width={220} />
          </Link>
          <h2 className="mt-6 text-2xl font-bold text-primary">Create your account</h2>
          <p className="mt-2 text-sm text-secondary">
            Already have an account?{' '}
            <Link href="/login" className="text-brand hover:text-brand-dark font-medium">
              Sign in
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
              label="Full name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="John Doe"
              required
            />
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
              placeholder="Min 10 chars with upper, lower, number, symbol"
              required
            />
            <Input
              label="Confirm password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm your password"
              required
            />
            {otpStage && (
              <div>
                <Input
                  label="Email verification code"
                  type="text"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="6-digit code"
                  required
                />
                <p className="mt-1.5 text-xs text-secondary">We sent a code to {email}. It expires in 10 minutes.{devHint ? ` ${devHint}` : ''}</p>
              </div>
            )}
            <Button type="submit" loading={loading} className="w-full">
              {otpStage ? 'Verify email & create account' : 'Send verification code'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
