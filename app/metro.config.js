const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// For local development with pnpm's file: link to shared package
const sharedPath = path.resolve(__dirname, '../shared');

// Watch the shared directory for hot reload during local development
config.watchFolders = [sharedPath];

// Enable symlink support for local development with pnpm
config.resolver.unstable_enableSymlinks = true;

module.exports = config;
