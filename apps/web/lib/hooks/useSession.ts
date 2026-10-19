'use client';
import useSWR from 'swr';
import { fetcher } from '@/lib/api/client';
import type { Role } from '@/lib/api/types';

export type Session = { id: number; email: string; name: string; role: Role };

export function useSession() {
  const { data, error, isLoading, mutate } = useSWR<{ data: Session }>('/api/auth/me', fetcher, {
    shouldRetryOnError: false,
    revalidateOnFocus: false,
  });
  return { session: data?.data ?? null, error, isLoading, mutate };
}
