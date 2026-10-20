'use client';

import { useEffect } from 'react';
import { isNativeApp } from '@/lib/native-push';

/**
 * Registers public/sw.js on every website load, not just when someone turns
 * notifications on, so Chrome on Android offers "Install app". The Android
 * app (Capacitor) uses native push and skips it.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (isNativeApp() || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(e => console.warn('[sw] register failed', e));
  }, []);
  return null;
}
