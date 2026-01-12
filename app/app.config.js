/**
 * Expo app configuration with dynamic versioning.
 *
 * Version and build number are set from environment variables during CI builds.
 * - APP_VERSION: Semver from git tag (e.g., "1.0.0")
 * - APP_BUILD_NUMBER: Auto-incremented build number
 */

const version = process.env.APP_VERSION || '0.1.0';
const buildNumber = process.env.APP_BUILD_NUMBER || '1';

export default {
  expo: {
    name: 'Code Monet',
    slug: 'code-monet',
    version,
    orientation: 'portrait',
    icon: './assets/icon.png',
    scheme: 'codemonet',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'net.dmfenton.sketchpad',
      buildNumber,
      associatedDomains: ['applinks:monet.dmfenton.net'],
      infoPlist: {
        // App only uses standard HTTPS/TLS (exempt encryption)
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#ffffff',
      },
      package: 'net.dmfenton.sketchpad',
      versionCode: parseInt(buildNumber, 10),
    },
    web: {
      bundler: 'metro',
      output: 'static',
      favicon: './assets/favicon.png',
    },
    plugins: ['expo-router', 'expo-secure-store'],
    experiments: {
      typedRoutes: true,
    },
  },
};
