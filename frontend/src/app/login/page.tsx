'use client';

import React from 'react';
import { AuthForm } from '@/components/ui/AuthForm';

export default function LoginPage() {
  return <AuthForm defaultRole="CLIENT" />;
}
