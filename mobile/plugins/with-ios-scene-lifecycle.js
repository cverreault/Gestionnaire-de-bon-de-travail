// Config plugin: adopt the UIScene life cycle on iOS.
//
// The iOS 27 SDK (Xcode 27) traps at launch when an app still relies on the
// AppDelegate-only life cycle (`___UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`).
// Expo SDK 57 ships `ExpoAppSceneDelegate` for this, but its prebuild template does
// not wire it yet. This plugin:
//   1. declares a scene manifest in Info.plist pointing at `SceneDelegate`;
//   2. adds `SceneDelegate.swift` (subclass of ExpoAppSceneDelegate) to the Xcode target;
//   3. makes AppDelegate a `ExpoReactNativeFactoryProvider` and stops it from creating
//      the window itself (the scene delegate creates the window and starts React Native).
// Idempotent: safe to run on every `expo prebuild`.
const fs = require('fs');
const path = require('path');
const { withAppDelegate, withDangerousMod, withInfoPlist, withXcodeProject, IOSConfig } = require('expo/config-plugins');

const SCENE_DELEGATE_FILE = 'SceneDelegate.swift';
const SCENE_DELEGATE_SOURCE = `internal import Expo
import UIKit

/// Scene-based life cycle (required by the iOS 27 SDK). ExpoAppSceneDelegate creates the
/// window, starts React Native and forwards scene events to the AppDelegate subscribers.
class SceneDelegate: ExpoAppSceneDelegate {}
`;

const withSceneManifest = (config) =>
  withInfoPlist(config, (c) => {
    c.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
          },
        ],
      },
    };
    return c;
  });

const withSceneDelegateFile = (config) =>
  withDangerousMod(config, [
    'ios',
    (c) => {
      const { platformProjectRoot, projectName } = c.modRequest;
      const target = path.join(platformProjectRoot, projectName, SCENE_DELEGATE_FILE);
      if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== SCENE_DELEGATE_SOURCE) {
        fs.writeFileSync(target, SCENE_DELEGATE_SOURCE);
      }
      return c;
    },
  ]);

const withSceneDelegateInTarget = (config) =>
  withXcodeProject(config, (c) => {
    const { projectName } = c.modRequest;
    IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
      filepath: `${projectName}/${SCENE_DELEGATE_FILE}`,
      groupName: projectName,
      project: c.modResults,
    });
    return c;
  });

/** Removes the `#if os(iOS) || os(tvOS) … #endif` block that creates the window in didFinishLaunching. */
function stripWindowBootstrap(contents) {
  const re = /\n#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\([\s\S]*?\)\n#endif\n/;
  return contents.replace(re, '\n');
}

const withFactoryProviderAppDelegate = (config) =>
  withAppDelegate(config, (c) => {
    if (c.modResults.language !== 'swift') {
      throw new Error('with-ios-scene-lifecycle: only the Swift AppDelegate template is supported');
    }
    let contents = c.modResults.contents;
    if (!contents.includes('ExpoReactNativeFactoryProvider')) {
      contents = contents.replace(
        /class AppDelegate: ExpoAppDelegate \{/,
        'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {',
      );
      if (!contents.includes('ExpoReactNativeFactoryProvider')) {
        throw new Error('with-ios-scene-lifecycle: could not find `class AppDelegate: ExpoAppDelegate {`');
      }
    }
    contents = stripWindowBootstrap(contents);
    if (/startReactNative\(/.test(contents)) {
      throw new Error('with-ios-scene-lifecycle: AppDelegate still starts React Native itself; template changed?');
    }
    c.modResults.contents = contents;
    return c;
  });

module.exports = function withIosSceneLifecycle(config) {
  config = withSceneManifest(config);
  config = withSceneDelegateFile(config);
  config = withSceneDelegateInTarget(config);
  config = withFactoryProviderAppDelegate(config);
  return config;
};
