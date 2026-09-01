import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSequence, withTiming, Easing } from 'react-native-reanimated';

import { Colors } from '@/constants/theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
// Approximates where the "My List" tab sits in the floating bottom nav (4th
// of 5 evenly-spaced icons) - close enough for a "this is where it went"
// motion cue without needing to measure across navigators.
const TARGET_X = SCREEN_WIDTH * 0.62;
const TARGET_Y = SCREEN_HEIGHT - 56;

export function FlyToListIcon({ startX, startY, runId }: { startX: number; startY: number; runId: number }) {
  const progress = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (runId === 0) return;
    progress.value = 0;
    opacity.value = 1;
    progress.value = withTiming(1, { duration: 650, easing: Easing.out(Easing.cubic) });
    opacity.value = withSequence(withTiming(1, { duration: 400 }), withTiming(0, { duration: 250 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  const style = useAnimatedStyle(() => {
    const x = startX + (TARGET_X - startX) * progress.value;
    // Arc upward slightly before dropping to the target, like tossing
    // something into a cart rather than sliding it flat.
    const arc = -80 * Math.sin(progress.value * Math.PI);
    const y = startY + (TARGET_Y - startY) * progress.value + arc;
    const scale = 1 - 0.5 * progress.value;
    return {
      opacity: opacity.value,
      transform: [{ translateX: x }, { translateY: y }, { scale }],
    };
  });

  if (runId === 0) return null;

  return (
    <Animated.View pointerEvents="none" style={[styles.icon, style]}>
      <Ionicons name="bookmark" size={22} color={Colors.accent} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  icon: { position: 'absolute', top: 0, left: 0, zIndex: 999 },
});
