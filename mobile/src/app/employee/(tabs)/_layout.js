import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/js-tabs';
import { useTheme } from '../../../theme';

const tab = (title, icon) => ({
  title,
  tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? icon : `${icon}-outline`} size={size} color={color} />,
});

export default function EmployeeTabs() {
  const t = useTheme();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: t.brand,
        tabBarInactiveTintColor: t.muted,
        tabBarStyle: { backgroundColor: t.surface, borderTopColor: t.border },
        headerStyle: { backgroundColor: t.surface },
        headerTintColor: t.text,
      }}
    >
      <Tabs.Screen name="home" options={tab('Home', 'home')} />
      <Tabs.Screen name="visits" options={tab('Visits', 'location')} />
      <Tabs.Screen name="sales" options={tab('Sales', 'cart')} />
      <Tabs.Screen name="hr" options={tab('HR', 'calendar')} />
      <Tabs.Screen name="more" options={tab('More', 'grid')} />
    </Tabs>
  );
}
