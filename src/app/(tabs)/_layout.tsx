import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';

export default function TabsLayout() {
  // A bare fixed `bottom` value ignores the device's own safe-area/gesture-bar
  // inset - on devices with a taller inset than whatever this was tuned
  // against, the floating pill ends up sitting half inside that zone instead
  // of clearing it. Anchor to the real inset plus a fixed visual gap instead.
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.accent,
        tabBarInactiveTintColor: Colors.textDim,
        tabBarShowLabel: false,
        // Each item is flex:1 by default, so tightening horizontal padding
        // centers the icon within its own slot now that there's no label.
        tabBarItemStyle: { paddingTop: 4, paddingHorizontal: 0 },
        // Narrower floating pill. left/right positioning isn't reliably
        // respected by this library's tab bar internals - marginHorizontal is
        // the combination that actually insets it from both screen edges.
        tabBarStyle: {
          position: 'absolute',
          marginHorizontal: 16,
          bottom: insets.bottom + 12,
          height: 66,
          borderRadius: 22,
          backgroundColor: Colors.surface2,
          borderTopWidth: 0,
          elevation: 12,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.35,
          shadowRadius: 30,
          // Each tab button's Android ripple is borderless with no radius cap,
          // so it grows past the small icon and bleeds over the pill's
          // rounded corner (worst on the last tab, right at that corner).
          // Clipping to the pill's own rounded shape contains it. Android
          // only - iOS has no ripple, and clipping here would also cut off
          // this same style's shadowOffset/shadowOpacity/shadowRadius there
          // (elevation, the Android shadow, isn't affected by this).
          overflow: Platform.OS === 'android' ? 'hidden' : 'visible',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Ionicons name="home" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          tabBarIcon: ({ color, size }) => <Ionicons name="search" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="shorts"
        options={{
          title: 'Shorts',
          tabBarIcon: ({ color, size }) => <Ionicons name="film" color={color} size={size} />,
          // Hidden from the tab bar for now - route stays reachable by direct
          // navigation, just not advertised as a tab.
          href: null,
        }}
      />
      <Tabs.Screen
        name="my-list"
        options={{
          title: 'My List',
          tabBarIcon: ({ color, size }) => <Ionicons name="bookmark" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <Ionicons name="person-circle" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
