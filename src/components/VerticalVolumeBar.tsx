import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { Pressable, StyleSheet, View } from 'react-native';

import { Colors } from '@/constants/theme';

// Shared by the Shorts feed and the main player - a Reels/Shorts-style
// vertical volume bar (drag up for louder), positioned on the left edge to
// sit under the thumb that would otherwise reach for the device's physical
// volume rocker (also left-edge on virtually every phone).
export function VerticalVolumeBar({
  volume,
  muted,
  onChange,
  onToggleMute,
  onDragStart,
  onDragEnd,
}: {
  volume: number;
  muted: boolean;
  onChange: (next: number) => void;
  onToggleMute: () => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) {
  return (
    <View style={styles.wrap} onTouchStart={onDragStart} onTouchEnd={onDragEnd} onTouchCancel={onDragEnd}>
      <Pressable onPress={onToggleMute} style={styles.iconBtn} hitSlop={10}>
        <Ionicons
          name={muted || volume === 0 ? 'volume-mute' : volume < 0.5 ? 'volume-low' : 'volume-high'}
          size={18}
          color={Colors.text}
        />
      </Pressable>
      <View style={styles.sliderWrap}>
        <Slider
          style={styles.slider}
          minimumValue={0}
          maximumValue={1}
          value={muted ? 0 : volume}
          minimumTrackTintColor={Colors.accent}
          maximumTrackTintColor="rgba(255,255,255,0.3)"
          thumbTintColor={Colors.accent}
          onValueChange={onChange}
          onSlidingStart={onDragStart}
          onSlidingComplete={(v) => {
            onChange(v);
            onDragEnd?.();
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    backgroundColor: Colors.overlay,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 4,
    gap: 4,
  },
  iconBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  // Slider is laid out horizontally then rotated -90deg to read as vertical -
  // see shorts.tsx history for why (dragging up increases volume this way).
  sliderWrap: { width: 28, height: 110, alignItems: 'center', justifyContent: 'center' },
  slider: { width: 110, height: 28, transform: [{ rotate: '-90deg' }] },
});
