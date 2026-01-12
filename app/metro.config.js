const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Add the shared package to watch folders so Metro can resolve it
const sharedPath = path.resolve(__dirname, '../shared');

config.watchFolders = [sharedPath];

// Configure resolver to find the shared package
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(sharedPath, 'node_modules'),
];

// Ensure symlinks are resolved
config.resolver.unstable_enableSymlinks = true;

module.exports = config;
