'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { homeFor } from '@/lib/access';

// The address "/" sends each person to their own home screen (or to sign in).
export default function Home() {
  const { user, loading, can } = useAuth();
  const router = useRouter();
  useEffect(() => { if (!loading) router.replace(user ? homeFor(can) : '/login'); }, [loading, user, can, router]);
  return null;
}
