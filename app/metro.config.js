const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// Watch the workspace root for changes
config.watchFolders = [workspaceRoot];

// Resolve modules from both app and workspace root node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Force single copy of react to avoid "Invalid hook call" errors
// Also add semver for react-reanimated scripts
config.resolver.extraNodeModules = {
  react: path.resolve(projectRoot, 'node_modules/react'),
  'react-native': path.resolve(projectRoot, 'node_modules/react-native'),
  semver: path.resolve(workspaceRoot, 'node_modules/semver'),
};

// Enable symlink support for pnpm
config.resolver.unstable_enableSymlinks = true;

// Ensure workspace packages use app's react
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
