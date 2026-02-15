import 'react-native-gesture-handler';
import React from 'react';
import { ActivityIndicator, StatusBar, View } from 'react-native';
import { MD3DarkTheme, PaperProvider } from 'react-native-paper';
import { AppNavigator } from './src/navigation/AppNavigator';
import { AppProvider, useAppContext } from './src/context/AppContext';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { AuthScreen } from './src/screens/AuthScreen';

const Bootstrap = () => {
  const { state } = useAppContext();
  const auth = useAuth();
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
  roundness: 20,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#7C3AED',
    secondary: '#3dd9c5',
    background: '#0A0E14',
    surface: '#111827',
    surfaceVariant: '#1B2333',
    onSurface: '#E2E8F0',
    onSurfaceVariant: '#64748B',
    outline: '#1E293B',
    error: '#ff5d73'
  }
};

export default function App() {
  return (
    <PaperProvider theme={premiumDarkTheme}>
      <StatusBar hidden />
      <AuthProvider>
        <AppProvider>
          <Bootstrap />
        </AppProvider>
      </AuthProvider>
    </PaperProvider>
  );
}
