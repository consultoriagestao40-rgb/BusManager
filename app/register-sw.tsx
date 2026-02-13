'use client';

import { useEffect } from 'react';

export default function RegisterServiceWorker() {
  useEffect(() => {
    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => console.log('Service Worker registrado:', registration))
        .catch((error) => console.log('Erro ao registrar Service Worker:', error));
    }

    // Lock screen orientation to landscape on mobile devices
    // DISABLED - users can use any orientation they want
    /*
    const lockOrientation = async () => {
      try {
        const screenAny = window.screen as any;
        if (screenAny?.orientation?.lock) {
          await screenAny.orientation.lock('landscape');
          console.log('Orientation locked to landscape');
        }
      } catch (error) {
        console.log('Orientation lock not supported or failed:', error);
      }
    };

    // Only attempt lock on mobile devices
    if (window.innerWidth <= 1024) {
      lockOrientation();
    }
    */
  }, []);

  return null;
}
