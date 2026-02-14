import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { MD3DarkTheme, PaperProvider } from 'react-native-paper';
import { AppNavigator } from './src/navigation/AppNavigator';
import { AppProvider, useAppContext } from './src/context/AppContext';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { requestNotificationPermission } from './src/services/notificationService';
import { useAlertMonitor } from './src/hooks/useAlertMonitor';
import { unregisterBackgroundAlertTask } from './src/services/backgroundAlertTask';
import { AuthScreen } from './src/screens/AuthScreen';

const Bootstrap = () => {
  const { state } = useAppContext();
  const auth = useAuth();
  useAlertMonitor();

  useEffect(() => {
    const bootstrap = async () => {
      await requestNotificationPermission();
      await unregisterBackgroundAlertTask();
    };

    bootstrap();
  }, []);

  if (!state.hydrated || !auth.hydrated) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!auth.isAuthenticated) {
    return <AuthScreen />;
  }

  return <AppNavigator />;
};

const premiumDarkTheme = {
  ...MD3DarkTheme,
  roundness: 18,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#8b7cf6',
    secondary: '#3dd9c5',
    background: '#0a0f1a',
    surface: '#111827',
    surfaceVariant: '#1b2333',
    onSurface: '#e7ecf7',
    onSurfaceVariant: '#9db0d0',
    outline: '#2a3448',
    error: '#ff5d73'
  }
};

export default function App() {
  return (
    <PaperProvider theme={premiumDarkTheme}>
      <AuthProvider>
        <AppProvider>
          <Bootstrap />
        </AppProvider>
      </AuthProvider>
    </PaperProvider>
  );
}
