/**
 * Type declarations for Expo public environment variables.
 * These are injected at build time via EXPO_PUBLIC_* prefix.
 */
declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_API_URL?: string;
    EXPO_PUBLIC_WS_URL?: string;
  }
}
