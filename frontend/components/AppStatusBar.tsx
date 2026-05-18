import { usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';

export const AppStatusBar = () => {
  const pathname = usePathname();

  return (
    <StatusBar
      style={
        pathname.startsWith('/scan') ||
        pathname.startsWith('/product-details') ||
        pathname.startsWith('/orders/') ||
        pathname.startsWith('/customer-lookup')
          ? 'light'
          : 'auto'
      }
    />
  );
};
