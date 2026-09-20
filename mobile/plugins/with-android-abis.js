// Config plugin: limit the Android native ABIs bundled in local / sideload builds.
//
// A plain `assembleRelease` packs arm64-v8a, armeabi-v7a, x86 and x86_64 into one
// APK (~135 MB). Phones are arm64 (a few old ones armeabi-v7a); x86 only matters
// for the emulator. EAS store builds produce an AAB split per ABI, so this only
// affects local APKs. Override with `ANDROID_ABIS=arm64-v8a,x86_64` when building
// for the emulator.
const { withGradleProperties } = require('expo/config-plugins');

const DEFAULT_ABIS = 'arm64-v8a,armeabi-v7a';

module.exports = function withAndroidAbis(config) {
  return withGradleProperties(config, (c) => {
    const abis = process.env.ANDROID_ABIS || DEFAULT_ABIS;
    const key = 'reactNativeArchitectures';
    c.modResults = c.modResults.filter((item) => !(item.type === 'property' && item.key === key));
    c.modResults.push({ type: 'property', key, value: abis });
    return c;
  });
};
