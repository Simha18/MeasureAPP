const { getDefaultConfig } = require('expo/metro-config');
 
const config = getDefaultConfig(__dirname);
 
// Ensure proper resolver configuration for Expo SDK 52
config.resolver.resolverMainFields = ['react-native', 'browser', 'main'];
config.resolver.platforms = ['ios', 'android', 'native', 'web'];
 
 
// Add support for additional asset extensions
config.resolver.assetExts.push('db', 'mp3', 'ttf', 'obj', 'png', 'jpg');
 
// Configure transformer for better compatibility
config.transformer.getTransformOptions = async () => ({
  transform: {
    experimentalImportSupport: false,
    inlineRequires: {
      blockList: ['react-native-reanimated'], // Exclude Reanimated from inline requires
    },
  },
});
 
// Add resolver alias for common problematic modules
config.resolver.alias = {
  'stream': 'readable-stream',
  'buffer': '@craftzdog/react-native-buffer',
};
 
module.exports = config;
 