import { useMemo, useState, type CSSProperties } from 'react';
import { FlatList, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';
import { PrimaryButton } from './PrimaryButton';

const MIN_YEAR = 1900;
// A plausible signup age, used only to pick where the Year column starts
// scrolled to when no date is set yet - avoids opening at "this year" and
// forcing a long scroll for every new user (the whole point of this picker).
const DEFAULT_AGE = 25;
const ITEM_HEIGHT = 44;
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const today = () => new Date();

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function formatDisplay(date: Date) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${date.getFullYear()}`;
}

// "YYYY-MM-DD" - the SQL DATE format USERS.py inserts as-is. Built from local
// date parts (not toISOString(), which converts to UTC and can shift the
// date by a day depending on the device's timezone).
export function toIsoDob(date: Date | null): string | undefined {
  if (!date) return undefined;
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function parseIsoDate(v: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return null;
  const [, yyyy, mm, dd] = m;
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
}

export function DateOfBirthField({
  value,
  onChange,
  error,
}: {
  value: Date | null;
  onChange: (d: Date) => void;
  error?: string;
}) {
  const [visible, setVisible] = useState(false);
  const [stagedYear, setStagedYear] = useState(today().getFullYear() - DEFAULT_AGE);
  const [stagedMonth, setStagedMonth] = useState(0);
  const [stagedDay, setStagedDay] = useState(1);

  const openPicker = () => {
    const base = value ?? new Date(today().getFullYear() - DEFAULT_AGE, 0, 1);
    setStagedYear(base.getFullYear());
    setStagedMonth(base.getMonth());
    setStagedDay(base.getDate());
    setVisible(true);
  };

  // Clamp month/day so a birthdate can never land in the future (matches the
  // old native picker's maximumDate=today constraint). Clamped at read-time
  // rather than written back into state - stagedMonth/stagedDay stay as the
  // user last set them, so picking an earlier year again doesn't lose them.
  const maxDate = today();
  const isCurrentYear = stagedYear === maxDate.getFullYear();
  const maxMonth = isCurrentYear ? maxDate.getMonth() : 11;
  const effectiveMonth = Math.min(stagedMonth, maxMonth);
  const isCurrentYearMonth = isCurrentYear && effectiveMonth === maxDate.getMonth();
  const maxDay = isCurrentYearMonth ? maxDate.getDate() : daysInMonth(stagedYear, effectiveMonth);
  const effectiveDay = Math.min(stagedDay, maxDay);

  const maxYear = maxDate.getFullYear();
  const years = useMemo(() => Array.from({ length: maxYear - MIN_YEAR + 1 }, (_, i) => maxYear - i), [maxYear]);
  const months = useMemo(() => MONTHS.slice(0, maxMonth + 1), [maxMonth]);
  const days = useMemo(() => Array.from({ length: maxDay }, (_, i) => i + 1), [maxDay]);

  const yearIndex = years.indexOf(stagedYear);

  const onDone = () => {
    onChange(new Date(stagedYear, effectiveMonth, effectiveDay));
    setVisible(false);
  };

  // Use a plain HTML date input on web instead of the picker below - it
  // already lets the user type a year directly, no custom UI needed there.
  if (Platform.OS === 'web') {
    return (
      <View style={styles.field}>
        <Text style={styles.label}>Date of Birth</Text>
        <View style={[styles.inputWrap, !!error && styles.inputError]}>
          <input
            type="date"
            value={toIsoDob(value) ?? ''}
            max={toIsoDob(today())}
            min={`${MIN_YEAR}-01-01`}
            onChange={(e) => {
              const parsed = parseIsoDate(e.target.value);
              if (parsed) onChange(parsed);
            }}
            style={webInputStyle}
          />
        </View>
        {!!error && <Text style={styles.errorText}>{error}</Text>}
      </View>
    );
  }

  return (
    <View style={styles.field}>
      <Text style={styles.label}>Date of Birth</Text>
      <Pressable onPress={openPicker} style={[styles.inputWrap, !!error && styles.inputError]}>
        <Text style={value ? styles.input : styles.placeholder}>{value ? formatDisplay(value) : 'DD/MM/YYYY'}</Text>
      </Pressable>
      {!!error && <Text style={styles.errorText}>{error}</Text>}

      <Modal visible={visible} transparent animationType="slide" onRequestClose={() => setVisible(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setVisible(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Date of Birth</Text>
            <View style={styles.columns}>
              <PickerColumn
                label="Day"
                items={days}
                selected={effectiveDay}
                onSelect={setStagedDay}
                initialScrollIndex={effectiveDay - 1}
              />
              <PickerColumn
                label="Month"
                items={months}
                selected={months[effectiveMonth]}
                onSelect={(m) => setStagedMonth(months.indexOf(m))}
                initialScrollIndex={effectiveMonth}
              />
              <PickerColumn
                label="Year"
                items={years}
                selected={stagedYear}
                onSelect={setStagedYear}
                initialScrollIndex={yearIndex >= 0 ? yearIndex : 0}
              />
            </View>
            <PrimaryButton title="Done" onPress={onDone} />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function PickerColumn<T extends string | number>({
  label,
  items,
  selected,
  onSelect,
  initialScrollIndex,
}: {
  label: string;
  items: T[];
  selected: T;
  onSelect: (v: T) => void;
  initialScrollIndex?: number;
}) {
  return (
    <View style={styles.column}>
      <Text style={styles.columnLabel}>{label}</Text>
      <FlatList
        data={items}
        keyExtractor={(item) => String(item)}
        style={styles.columnList}
        getItemLayout={(_, index) => ({ length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index })}
        initialScrollIndex={initialScrollIndex}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const isSelected = item === selected;
          return (
            <Pressable onPress={() => onSelect(item)} style={styles.columnItem}>
              <Text style={[styles.columnItemText, isSelected && styles.columnItemTextSelected]}>{item}</Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: Spacing.sm },
  label: {
    color: Colors.textDim,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  inputWrap: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: Spacing.md,
    height: 52,
    justifyContent: 'center',
  },
  inputError: { borderColor: Colors.like },
  input: { color: Colors.text, fontSize: 14.5 },
  placeholder: { color: Colors.textDim, fontSize: 14.5 },
  errorText: { color: Colors.like, fontSize: 11.5 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalSheet: { backgroundColor: Colors.surface, padding: Spacing.lg, gap: Spacing.md, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  modalTitle: { color: Colors.text, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  columns: { flexDirection: 'row', gap: Spacing.sm, height: ITEM_HEIGHT * 5 },
  column: { flex: 1, gap: Spacing.xs },
  columnLabel: {
    color: Colors.textDim,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  columnList: { flex: 1, backgroundColor: Colors.surface2, borderRadius: 10 },
  columnItem: { height: ITEM_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  columnItemText: { color: Colors.textDim, fontSize: 15 },
  columnItemTextSelected: { color: Colors.accent, fontWeight: '700', fontSize: 16 },
});

// Raw DOM <input> (web only) takes CSS, not an RN StyleSheet.
const webInputStyle: CSSProperties = {
  width: '100%',
  height: '100%',
  border: 'none',
  outline: 'none',
  background: 'transparent',
  color: Colors.text,
  fontSize: 14.5,
  fontFamily: 'inherit',
  colorScheme: 'dark',
};
