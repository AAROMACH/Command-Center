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
    // update(): pick up a changed sw.js on every load, not only when Chrome
    // gets round to it — otherwise phones keep showing old notifications.
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
      .then(reg => reg.update())
      .catch(e => console.warn('[sw] register failed', e));
  }, []);
  return null;
}
