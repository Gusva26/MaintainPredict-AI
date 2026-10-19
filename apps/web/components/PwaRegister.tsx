'use client';
import { useEffect } from 'react';

/**
 * Registra el Service Worker de la PWA (App Técnico).
 * Implementación manual (sin next-pwa) para evitar dependencias frágiles en Next 14.
 */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;
    const onLoad = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    };
    window.addEventListener('load', onLoad);
    return () => window.removeEventListener('load', onLoad);
  }, []);
  return null;
}
