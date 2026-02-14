import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

const AUTH_KEY = 'app.auth.passcode.sha256';

type AuthContextValue = {
  hydrated: boolean;
  hasPasscode: boolean;
  isAuthenticated: boolean;
  setupPasscode: (passcode: string) => Promise<void>;
  signIn: (passcode: string) => Promise<boolean>;
  verifyPasscode: (passcode: string) => Promise<boolean>;
  changePasscode: (currentPasscode: string, nextPasscode: string) => Promise<boolean>;
  removePasscode: (currentPasscode: string) => Promise<boolean>;
  lockApp: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const hash = async (value: string) => {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [hydrated, setHydrated] = useState(false);
  const [hasPasscode, setHasPasscode] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const hydrate = async () => {
      const stored = await SecureStore.getItemAsync(AUTH_KEY);
      setHasPasscode(!!stored);
      // First-time users (no passcode) can proceed to setup screen.
      setIsAuthenticated(false);
      setHydrated(true);
    };
    hydrate();
  }, []);

  const setupPasscode = async (passcode: string) => {
    const hashed = await hash(passcode);
    await SecureStore.setItemAsync(AUTH_KEY, hashed);
    setHasPasscode(true);
    setIsAuthenticated(true);
  };

  const signIn = async (passcode: string) => {
    const stored = await SecureStore.getItemAsync(AUTH_KEY);
    if (!stored) return false;
    const incoming = await hash(passcode);
    const ok = stored === incoming;
    setIsAuthenticated(ok);
    return ok;
  };

  const verifyPasscode = async (passcode: string) => {
    const stored = await SecureStore.getItemAsync(AUTH_KEY);
    if (!stored) return false;
    const incoming = await hash(passcode);
    return stored === incoming;
  };

  const changePasscode = async (currentPasscode: string, nextPasscode: string) => {
    const ok = await verifyPasscode(currentPasscode);
    if (!ok) return false;
    const hashed = await hash(nextPasscode);
    await SecureStore.setItemAsync(AUTH_KEY, hashed);
    setHasPasscode(true);
    setIsAuthenticated(true);
    return true;
  };

  const removePasscode = async (currentPasscode: string) => {
    const ok = await verifyPasscode(currentPasscode);
    if (!ok) return false;
    await SecureStore.deleteItemAsync(AUTH_KEY);
    setHasPasscode(false);
    setIsAuthenticated(true);
    return true;
  };

  const lockApp = () => {
    setIsAuthenticated(false);
  };

  const value = useMemo(
    () => ({ hydrated, hasPasscode, isAuthenticated, setupPasscode, signIn, verifyPasscode, changePasscode, removePasscode, lockApp }),
    [hydrated, hasPasscode, isAuthenticated]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
};
