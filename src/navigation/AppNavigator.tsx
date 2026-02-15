import React from 'react';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { DashboardScreen } from '../screens/DashboardScreen';
import { JournalScreen } from '../screens/JournalScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { AnalyticsScreen } from '../screens/AnalyticsScreen';
import { CalendarScreen } from '../screens/CalendarScreen';
import { CalendarDayScreen } from '../screens/CalendarDayScreen';

export type RootTabParamList = {
  Dashboard: undefined;
  Analytics: undefined;
  Calendar: undefined;
  Journal: undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  Tabs: undefined;
  CalendarDay: { date: string };
};

const Tab = createBottomTabNavigator<RootTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();
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

const Tabs = () => (
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
        backgroundColor: '#0a0e14',
        borderTopColor: '#1a2332',
        borderTopWidth: 1,
        height: 72,
        paddingBottom: 10,
        paddingTop: 8
      },
      tabBarLabelStyle: {
        fontSize: 11,
        fontWeight: '600'
      },
      tabBarActiveTintColor: '#8b7cf6',
      tabBarInactiveTintColor: '#64748B',
      tabBarIcon: ({ color }) => {
        const icons: Record<keyof RootTabParamList, IconName> = {
          Dashboard: 'view-dashboard-outline',
          Journal: 'book-open-page-variant-outline',
          Analytics: 'chart-bar',
          Calendar: 'calendar-month-outline',
          Settings: 'cog-outline'
        };

        return <MaterialCommunityIcons name={icons[route.name]} size={24} color={color} />;
      }
    })}
  >
    <Tab.Screen name="Dashboard" component={DashboardScreen} />
    <Tab.Screen name="Journal" component={JournalScreen} />
    <Tab.Screen name="Analytics" component={AnalyticsScreen} />
    <Tab.Screen name="Calendar" component={CalendarScreen} />
    <Tab.Screen name="Settings" component={SettingsScreen} />
  </Tab.Navigator>
);

export const AppNavigator = () => {
  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: '#0f1726' },
          headerTintColor: '#e7ecf7',
          headerTitleStyle: { fontWeight: '700' },
          headerTitleAlign: 'left'
        }}
      >
        <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
        <Stack.Screen name="CalendarDay" component={CalendarDayScreen} options={{ title: 'Trades' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};
