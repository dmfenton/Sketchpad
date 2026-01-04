/**
 * Authentication Screen - Login/Signup with invite code
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../context';
import { borderRadius, spacing, useTheme } from '../theme';

type AuthMode = 'signin' | 'signup' | 'magic-link';

interface AuthScreenProps {
  magicLinkError?: string | null;
  onClearError?: () => void;
}

export function AuthScreen({ magicLinkError, onClearError }: AuthScreenProps): React.JSX.Element {
  const { colors } = useTheme();
  const { signIn, signUp, requestMagicLink } = useAuth();

  const [mode, setMode] = useState<AuthMode>('magic-link');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<string | null>(magicLinkError ?? null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Clear parent error when user interacts
  const clearError = () => {
    setError(null);
    onClearError?.();
  };

  const handleSubmit = () => {
    clearError();
    setSuccess(null);
    setLoading(true);

    void (async () => {
      try {
        let result;
        if (mode === 'magic-link') {
          if (!email.trim()) {
            setError('Email is required');
            setLoading(false);
            return;
          }
          result = await requestMagicLink(email);
          if (result.success) {
            setSuccess('Check your email for a sign-in link');
          }
        } else if (mode === 'signin') {
          result = await signIn(email, password);
        } else {
          if (!inviteCode.trim()) {
            setError('Invite code is required');
            setLoading(false);
            return;
          }
          result = await signUp(email, password, inviteCode);
        }

        if (!result.success) {
          setError(result.error ?? 'Authentication failed');
        }
      } catch (err) {
        setError('An unexpected error occurred');
        console.error('[Auth] Submit error:', err);
      } finally {
        setLoading(false);
      }
    })();
  };

  const toggleMode = () => {
    if (mode === 'magic-link') {
      setMode('signin');
    } else if (mode === 'signin') {
      setMode('signup');
    } else {
      setMode('magic-link');
    }
    clearError();
    setSuccess(null);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Code Monet</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {mode === 'magic-link'
                ? 'Sign in with email'
                : mode === 'signin'
                  ? 'Welcome back'
                  : 'Create your account'}
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.surface,
                  color: colors.textPrimary,
                  borderColor: colors.border,
                },
              ]}
              placeholder="Email"
              placeholderTextColor={colors.textSecondary}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              editable={!loading}
            />

            {mode !== 'magic-link' && (
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.surface,
                    color: colors.textPrimary,
                    borderColor: colors.border,
                  },
                ]}
                placeholder="Password"
                placeholderTextColor={colors.textSecondary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                editable={!loading}
              />
            )}

            {mode === 'signup' && (
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.surface,
                    color: colors.textPrimary,
                    borderColor: colors.border,
                  },
                ]}
                placeholder="Invite Code"
                placeholderTextColor={colors.textSecondary}
                value={inviteCode}
                onChangeText={setInviteCode}
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!loading}
              />
            )}

            {error && (
              <View style={[styles.errorBox, { backgroundColor: colors.error + '20' }]}>
                <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
              </View>
            )}

            {success && (
              <View style={[styles.successBox, { backgroundColor: colors.primary + '20' }]}>
                <Text style={[styles.successText, { color: colors.primary }]}>{success}</Text>
              </View>
            )}

            <Pressable
              style={[
                styles.button,
                { backgroundColor: colors.primary },
                loading && styles.buttonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={colors.background} />
              ) : (
                <Text style={[styles.buttonText, { color: colors.background }]}>
                  {mode === 'magic-link'
                    ? 'Send Magic Link'
                    : mode === 'signin'
                      ? 'Sign In'
                      : 'Sign Up'}
                </Text>
              )}
            </Pressable>
          </View>

          {/* Toggle */}
          <Pressable style={styles.toggle} onPress={toggleMode} disabled={loading}>
            <Text style={[styles.toggleText, { color: colors.textSecondary }]}>
              {mode === 'magic-link'
                ? 'Use password instead? '
                : mode === 'signin'
                  ? "Don't have an account? "
                  : 'Sign in with '}
              <Text style={{ color: colors.primary }}>
                {mode === 'magic-link'
                  ? 'Sign In'
                  : mode === 'signin'
                    ? 'Sign Up'
                    : 'Magic Link'}
              </Text>
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  title: {
    fontSize: 32,
    fontWeight: '700' as const,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: 18,
  },
  form: {
    gap: spacing.md,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    fontSize: 16,
  },
  errorBox: {
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
  },
  successBox: {
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  successText: {
    fontSize: 14,
    textAlign: 'center',
  },
  button: {
    height: 48,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600' as const,
  },
  toggle: {
    alignItems: 'center',
    marginTop: spacing.xl,
    padding: spacing.sm,
  },
  toggleText: {
    fontSize: 16,
  },
});
