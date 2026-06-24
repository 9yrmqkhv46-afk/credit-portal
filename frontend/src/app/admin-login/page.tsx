'use client';

import React from 'react';
import { AuthForm } from '@/components/ui/AuthForm';

export default function AdminLoginPage() {
  // Same animated scene as /login, with the Admin role tab pre-selected.
  return <AuthForm defaultRole="ADMIN" />;
}
