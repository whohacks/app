import React from 'react';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { DashboardScreen } from '../screens/DashboardScreen';
import { AlertsScreen } from '../screens/AlertsScreen';
import { JournalScreen } from '../screens/JournalScreen';
import { SettingsScreen } from '../screens/SettingsScreen';

export type RootTabParamList = {
  Dashboard: undefined;
  Alerts: undefined;
  Journal: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();
type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: '#0a0f1a',
    card: '#0f1726',
    border: '#222c3f',
    text: '#e7ecf7',
    primary: '#8b7cf6'
  }
};

export const AppNavigator = () => {
  return (
    <NavigationContainer theme={navTheme}>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerTitleAlign: 'left',
          headerStyle: {
            backgroundColor: '#0f1726'
          },
          headerTintColor: '#e7ecf7',
          headerTitleStyle: {
            fontWeight: '700'
          },
          tabBarStyle: {
            backgroundColor: '#0f1726',
            borderTopColor: '#222c3f',
            height: 62,
            paddingBottom: 6,
            paddingTop: 6
          },
          tabBarActiveTintColor: '#8b7cf6',
          tabBarInactiveTintColor: '#8ea1c1',
          tabBarIcon: ({ color, size }) => {
            const icons: Record<keyof RootTabParamList, IconName> = {
              Dashboard: 'view-dashboard-outline',
              Alerts: 'bell-outline',
              Journal: 'book-open-page-variant-outline',
              Settings: 'cog-outline'
            };

            return <MaterialCommunityIcons name={icons[route.name]} size={size} color={color} />;
          }
        })}
      >
        <Tab.Screen name="Dashboard" component={DashboardScreen} />
        <Tab.Screen name="Alerts" component={AlertsScreen} />
        <Tab.Screen name="Journal" component={JournalScreen} />
        <Tab.Screen name="Settings" component={SettingsScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
};
