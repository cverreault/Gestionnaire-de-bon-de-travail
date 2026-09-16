// Configuration Metro pour le monorepo (ADR-014 §2).
// - watchFolders : Metro doit voir packages/shared et le node_modules racine.
// - nodeModulesPaths : résout d'abord mobile/node_modules puis la racine
//   (hoisting npm workspaces).
// - disableHierarchicalLookup : évite qu'une dépendance soit résolue depuis un
//   node_modules parent inattendu (deux copies de React).
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
