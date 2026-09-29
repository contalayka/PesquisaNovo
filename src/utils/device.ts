import { useState, useEffect } from 'react';

export type DeviceType = 'mobile' | 'tablet' | 'desktop';

export interface DeviceInfo {
  deviceType: DeviceType;
  isAndroid: boolean;
  isIOS: boolean;
  isMobile: boolean; // width < 768 or mobile UA
  isTablet: boolean; // 768 <= width < 1024 and not phone UA
  isDesktop: boolean; // width >= 1024
  isTouch: boolean;
  width: number;
  height: number;
  deviceLabel: string;
}

export function detectDevice(): DeviceInfo {
  if (typeof window === 'undefined') {
    return {
      deviceType: 'desktop',
      isAndroid: false,
      isIOS: false,
      isMobile: false,
      isTablet: false,
      isDesktop: true,
      isTouch: false,
      width: 1280,
      height: 800,
      deviceLabel: 'Computador',
    };
  }

  const ua = navigator.userAgent || '';
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isMobileUA = /Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const isTabletUA = /iPad|Android(?!.*Mobile)/i.test(ua);

  const width = window.innerWidth;
  const height = window.innerHeight;
  const isTouch = 'ontouchstart' in window || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);

  let deviceType: DeviceType = 'desktop';
  if (width < 768 || (isMobileUA && width < 1024)) {
    deviceType = 'mobile';
  } else if (width >= 768 && width < 1024) {
    deviceType = 'tablet';
  } else {
    deviceType = 'desktop';
  }

  let deviceLabel = 'Computador';
  if (isAndroid) {
    deviceLabel = deviceType === 'tablet' ? 'Tablet Android' : 'Android';
  } else if (isIOS) {
    deviceLabel = deviceType === 'tablet' ? 'iPad' : 'iPhone';
  } else if (deviceType === 'mobile') {
    deviceLabel = 'Celular';
  } else if (deviceType === 'tablet') {
    deviceLabel = 'Tablet';
  }

  return {
    deviceType,
    isAndroid,
    isIOS,
    isMobile: deviceType === 'mobile',
    isTablet: deviceType === 'tablet',
    isDesktop: deviceType === 'desktop',
    isTouch: Boolean(isTouch),
    width,
    height,
    deviceLabel,
  };
}

export function useDevice(): DeviceInfo {
  const [device, setDevice] = useState<DeviceInfo>(() => detectDevice());

  useEffect(() => {
    const update = () => {
      setDevice(detectDevice());
    };

    window.addEventListener('resize', update, { passive: true });
    window.addEventListener('orientationchange', update, { passive: true });

    // Initial check
    update();

    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  return device;
}
