'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';

const DEFAULTS = { shopName: 'Wellness Pharmacy', tagline: '', address: '', phone: '', email: '', licenseNo: '', ntn: '', receiptFooter: 'Thank you! Medicines once sold can be returned only with this receipt.' };
const SettingsContext = createContext({ settings: DEFAULTS, refresh: () => {} });

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULTS);
  const refresh = useCallback(() => api('/settings').then((r) => setSettings({ ...DEFAULTS, ...r.data })).catch(() => {}), []);
  useEffect(() => { refresh(); }, [refresh]);
  const value = useMemo(() => ({ settings, refresh }), [settings, refresh]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export const useSettings = () => useContext(SettingsContext);
