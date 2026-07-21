import React, { useRef } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '../theme/colors';

export const Input = ({ icon, style, ...props }) => (
  <View style={[styles.inputWrap, style]}>
    {icon ? <Ionicons name={icon} size={19} color={colors.textSecondary} /> : null}
    <TextInput placeholderTextColor={colors.textSecondary} {...props} style={styles.input} />
  </View>
);

export function Button({ title, onPress, danger, secondary, disabled, icon, compact, style }) {
  const scale = useRef(new Animated.Value(1)).current;
  const animate = value => Animated.spring(scale, { toValue: value, useNativeDriver: true, speed: 40 }).start();
  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        disabled={disabled}
        onPress={onPress}
        onPressIn={() => animate(0.97)}
        onPressOut={() => animate(1)}
        style={[styles.button, secondary && styles.secondary, danger && styles.danger, compact && styles.compact, disabled && styles.disabled]}
      >
        {icon ? <Ionicons name={icon} size={18} color={secondary ? colors.primaryDark : '#FFF'} /> : null}
        <Text style={[styles.buttonText, secondary && styles.secondaryText]}>{title}</Text>
      </Pressable>
    </Animated.View>
  );
}

export const IconButton = ({ icon, onPress, active, danger }) => (
  <Pressable onPress={onPress} style={[styles.iconButton, active && styles.iconActive, danger && styles.iconDanger]}>
    <Ionicons name={icon} size={20} color={danger ? colors.danger : active ? '#FFF' : colors.primaryDark} />
  </Pressable>
);

export const Card = ({ children, style }) => <View style={[styles.card, style]}>{children}</View>;
export const Loading = () => <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;
export const Empty = ({ text = 'No hay registros para mostrar' }) => <View style={styles.empty}><Ionicons name="leaf-outline" size={34} color={colors.border} /><Text style={styles.emptyText}>{text}</Text></View>;
export const money = value => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(Number(value || 0));

export function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;
  const pages = Array.from({ length: totalPages }, (_, index) => index + 1).filter(number => Math.abs(number - page) <= 2 || number === 1 || number === totalPages);
  return (
    <View style={styles.pagination}>
      <IconButton icon="chevron-back" onPress={() => onChange(Math.max(1, page - 1))} />
      {pages.map((number, index) => (
        <React.Fragment key={number}>
          {index && number - pages[index - 1] > 1 ? <Text style={styles.dots}>…</Text> : null}
          <Pressable onPress={() => onChange(number)} style={[styles.page, page === number && styles.pageActive]}>
            <Text style={[styles.pageText, page === number && { color: '#FFF' }]}>{number}</Text>
          </Pressable>
        </React.Fragment>
      ))}
      <IconButton icon="chevron-forward" onPress={() => onChange(Math.min(totalPages, page + 1))} />
    </View>
  );
}

const styles = StyleSheet.create({
  inputWrap: { minHeight: 49, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: '#FFF', borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingHorizontal: 14, marginBottom: 11 },
  input: { flex: 1, paddingVertical: 12, color: colors.text, fontSize: 15 },
  button: { minHeight: 48, backgroundColor: colors.primary, paddingHorizontal: 18, borderRadius: 14, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', marginVertical: 5 },
  secondary: { backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: '#BFE5CF' }, secondaryText: { color: colors.primaryDark },
  danger: { backgroundColor: colors.danger }, disabled: { backgroundColor: colors.disabled }, compact: { minHeight: 40, paddingHorizontal: 13, borderRadius: 11 },
  buttonText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
  iconButton: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  iconActive: { backgroundColor: colors.primary }, iconDanger: { backgroundColor: colors.dangerSoft },
  card: { backgroundColor: '#FFF', borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 16, marginBottom: 12, shadowColor: '#183D28', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.07, shadowRadius: 9, elevation: 2 },
  center: { minHeight: 180, justifyContent: 'center', alignItems: 'center' },
  empty: { alignItems: 'center', padding: 34, gap: 8 }, emptyText: { color: colors.textSecondary, textAlign: 'center' },
  pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14 },
  page: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, pageActive: { backgroundColor: colors.primary }, pageText: { color: colors.text, fontWeight: '700' }, dots: { color: colors.textSecondary },
});
