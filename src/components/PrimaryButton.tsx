import { forwardRef, type ComponentRef } from 'react';
import { Pressable, type PressableProps, StyleSheet, Text } from 'react-native';

import { colors, spacing, typography } from '@/theme';

type PrimaryButtonProps = PressableProps & {
  label: string;
  variant?: 'danger' | 'primary' | 'secondary';
};

export const PrimaryButton = forwardRef<ComponentRef<typeof Pressable>, PrimaryButtonProps>(
  ({ disabled, label, onPress, style, variant = 'primary', ...pressableProps }, ref) => {
    const isSecondary = variant === 'secondary';
    const isDanger = variant === 'danger';

    return (
      <Pressable
        ref={ref}
        disabled={disabled}
        onPress={onPress}
        {...pressableProps}
        style={(state) => [
          styles.button,
          isDanger ? styles.dangerButton : isSecondary ? styles.secondaryButton : styles.primaryButton,
          disabled && styles.disabledButton,
          state.pressed && styles.pressed,
          typeof style === 'function' ? style(state) : style,
        ]}
      >
        <Text
          style={[
            styles.label,
            isSecondary ? styles.secondaryLabel : styles.primaryLabel,
            disabled && styles.disabledLabel,
          ]}
        >
          {label}
        </Text>
      </Pressable>
    );
  },
);

PrimaryButton.displayName = 'PrimaryButton';

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 52,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  dangerButton: {
    backgroundColor: colors.danger,
    borderColor: colors.danger,
  },
  disabledButton: {
    backgroundColor: '#E4E7EC',
    borderColor: '#E4E7EC',
  },
  disabledLabel: {
    color: colors.mutedText,
  },
  label: {
    fontSize: typography.body,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.8,
  },
  primaryButton: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  primaryLabel: {
    color: colors.inverseText,
  },
  secondaryButton: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  secondaryLabel: {
    color: colors.text,
  },
});
