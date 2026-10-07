import { Ionicons } from '@expo/vector-icons';
import { forwardRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { label as fmtLabel } from '../lib/format';
import { toneFor, useTheme } from '../theme';

export { Ionicons };

/** Scrollable screen with pull-to-refresh. */
export function Screen({ children, onRefresh, refreshing = false, scroll = true, padded = true, edges = ['bottom'] }) {
  const t = useTheme();
  const content = <View style={{ padding: padded ? 16 : 0, gap: 12 }}>{children}</View>;
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: t.bg }}>
      {scroll ? (
        <ScrollView keyboardShouldPersistTaps="handled" refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.brand} /> : undefined}>
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

export function Card({ title, right, children, style, onPress }) {
  const t = useTheme();
  const Body = (
    <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }, style]}>
      {(title || right) && (
        <View style={styles.rowBetween}>
          {title ? <Text style={[styles.cardTitle, { color: t.text }]}>{title}</Text> : <View />}
          {right}
        </View>
      )}
      {children}
    </View>
  );
  return onPress ? <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>{Body}</Pressable> : Body;
}

export function T({ children, muted, size = 15, weight, color, style, ...p }) {
  const t = useTheme();
  return (
    <Text style={[{ color: color || (muted ? t.muted : t.text), fontSize: size, fontWeight: weight }, style]} {...p}>
      {children}
    </Text>
  );
}

export function Button({ title, onPress, variant = 'primary', icon, disabled, loading, small, style }) {
  const t = useTheme();
  const bg = { primary: t.brand, danger: t.bad, ghost: 'transparent', soft: t.brandSoft }[variant];
  const fg = { primary: t.brandInk, danger: '#fff', ghost: t.text, soft: t.brand }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        small && styles.btnSmall,
        { backgroundColor: bg, borderColor: variant === 'ghost' ? t.border : bg, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Ionicons name={icon} size={small ? 16 : 18} color={fg} /> : null}
      {title ? <Text style={{ color: fg, fontWeight: '600', fontSize: small ? 13 : 15 }}>{title}</Text> : null}
    </Pressable>
  );
}

export const Input = forwardRef(function Input({ label, hint, error, style, multiline, ...p }, ref) {
  const t = useTheme();
  return (
    <View style={{ gap: 4 }}>
      {label && <Text style={{ color: t.muted, fontSize: 13, fontWeight: '600' }}>{label}</Text>}
      <TextInput
        ref={ref}
        placeholderTextColor={t.muted}
        multiline={multiline}
        style={[styles.input, { borderColor: error ? t.bad : t.border, color: t.text, backgroundColor: t.surface, minHeight: multiline ? 84 : 46, textAlignVertical: multiline ? 'top' : 'center' }, style]}
        {...p}
      />
      {(error || hint) && <Text style={{ color: error ? t.bad : t.muted, fontSize: 12 }}>{error || hint}</Text>}
    </View>
  );
});

/** Single-select chip row. options: [[value,label]] or string[] */
export function Chips({ label, options, value, onChange }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      {label && <Text style={{ color: t.muted, fontSize: 13, fontWeight: '600' }}>{label}</Text>}
      <View style={styles.wrap}>
        {options.map((o) => {
          const [v, l] = Array.isArray(o) ? o : [o, fmtLabel(o)];
          const on = v === value;
          return (
            <Pressable key={String(v)} onPress={() => onChange(v)} style={[styles.chip, { borderColor: on ? t.brand : t.border, backgroundColor: on ? t.brandSoft : t.surface }]}>
              <Text style={{ color: on ? t.brand : t.text, fontWeight: on ? '700' : '400' }}>{l}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function Badge({ status, text }) {
  const t = useTheme();
  const tone = toneFor(status);
  const bg = { ok: t.okSoft, warn: t.warnSoft, bad: t.badSoft, info: t.infoSoft, muted: t.surface2 }[tone];
  const fg = { ok: t.ok, warn: t.warn, bad: t.bad, info: t.info, muted: t.muted }[tone];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={{ color: fg, fontSize: 12, fontWeight: '700' }}>{text ?? fmtLabel(status)}</Text>
    </View>
  );
}

export function Stat({ label, value, hint, onPress }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={[styles.stat, { backgroundColor: t.surface, borderColor: t.border }]}>
      <Text style={{ color: t.muted, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: t.text, fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{value}</Text>
      {hint ? <Text style={{ color: t.muted, fontSize: 12 }}>{hint}</Text> : null}
    </Pressable>
  );
}

export const StatRow = ({ children }) => <View style={styles.statRow}>{children}</View>;

export function ListItem({ title, subtitle, right, onPress, icon, meta }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.item, { backgroundColor: pressed ? t.surface2 : t.surface, borderColor: t.border }]}>
      {icon && (
        <View style={[styles.itemIcon, { backgroundColor: t.brandSoft }]}>
          <Ionicons name={icon} size={18} color={t.brand} />
        </View>
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: t.text, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={{ color: t.muted, fontSize: 13 }} numberOfLines={2}>{subtitle}</Text> : null}
        {meta}
      </View>
      {right}
      {onPress && !right && <Ionicons name="chevron-forward" size={18} color={t.muted} />}
    </Pressable>
  );
}

export function Empty({ text = 'Nothing here yet.', loading, error }) {
  const t = useTheme();
  if (loading) return <ActivityIndicator style={{ marginTop: 24 }} color={t.brand} />;
  return <Text style={{ color: error ? t.bad : t.muted, textAlign: 'center', paddingVertical: 24 }}>{error ? error.message : text}</Text>;
}

export function Section({ title, children, right }) {
  const t = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <View style={styles.rowBetween}>
        <Text style={{ color: t.muted, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>{title}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

export const Row = ({ children, style, gap = 8 }) => <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;

export function KV({ k, v }) {
  const t = useTheme();
  return (
    <View style={styles.rowBetween}>
      <Text style={{ color: t.muted }}>{k}</Text>
      <Text style={{ color: t.text, fontWeight: '600', flexShrink: 1, textAlign: 'right' }}>{v}</Text>
    </View>
  );
}

/** Wrap an async action with a busy flag and an error alert. */
export function useBusy() {
  const [busy, setBusy] = useState(false);
  const run = async (fn) => {
    setBusy(true);
    try {
      return await fn();
    } catch (e) {
      const details = e.details?.map?.((d) => `• ${d.path}: ${d.message}`).join('\n');
      Alert.alert('Something went wrong', details ? `${e.message}\n${details}` : e.message);
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  return [run, busy];
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 10 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16, minHeight: 46, borderRadius: 10, borderWidth: 1 },
  btnSmall: { minHeight: 34, paddingHorizontal: 12 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 7 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99, alignSelf: 'flex-start' },
  stat: { flex: 1, minWidth: 140, borderWidth: 1, borderRadius: 12, padding: 12, gap: 2 },
  statRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderWidth: 1, borderRadius: 12 },
  itemIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
