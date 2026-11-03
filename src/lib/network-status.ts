import { useState, useEffect } from 'react';

export type NetworkStatus = 'online' | 'offline' | 'slow';

export interface NetworkInfo {
  status: NetworkStatus;
  isOnline: boolean;
  isSlow: boolean;
  lastChanged: Date | null;
}

export function useNetworkStatus(): NetworkInfo {
  const [status, setStatus] = useState<NetworkStatus>(() =>
    navigator.onLine ? 'online' : 'offline'
  );
  const [lastChanged, setLastChanged] = useState<Date | null>(null);

  useEffect(() => {
    const update = () => {
      setStatus(navigator.onLine ? 'online' : 'offline');
      setLastChanged(new Date());
    };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return {
    status,
    isOnline: status === 'online' || status === 'slow',
    isSlow: status === 'slow',
    lastChanged,
  };
}
