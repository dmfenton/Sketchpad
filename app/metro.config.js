const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// Watch the workspace root for shared library changes
config.watchFolders = [
  ...config.watchFolders || [],
  workspaceRoot,
];

// Resolve modules from workspace root node_modules (npm workspaces hoist there)
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;
