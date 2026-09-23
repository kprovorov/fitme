const { withAppDelegate, withInfoPlist } = require("expo/config-plugins");

// iOS 27 (Xcode 27 SDK) refuses to launch apps that do not adopt the UIKit
// scene-based life cycle. Expo ships this natively from SDK 57.0.23 via
// expo-build-properties' `ios.enableSceneSupport`; this plugin ports that
// change to the SDK 55 AppDelegate template. Remove it after upgrading to
// SDK 57+ and switching to `enableSceneSupport` (or SDK 58, which needs nothing).

const APP_DELEGATE_CLASS = "class AppDelegate: ExpoAppDelegate {";
const SCENE_MARKER = "// MARK: - Scene life cycle";
const WINDOW_STATEMENT =
  /^[ \t]*window = UIWindow\(frame: UIScreen\.main\.bounds\)\r?\n/m;
const START_STATEMENT = /^[ \t]*factory\.startReactNative\([^)]*\)\r?\n/m;
const EMPTY_OS_WRAPPER =
  /^[ \t]*#if os\(iOS\) \|\| os\(tvOS\)\r?\n[ \t]*#endif\r?\n/m;

const SCENE_MANIFEST = {
  UIApplicationSupportsMultipleScenes: false,
  UISceneConfigurations: {
    UIWindowSceneSessionRoleApplication: [
      {
        UISceneConfigurationName: "Default Configuration",
        UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).SceneDelegate",
      },
    ],
  },
};

const SCENE_DELEGATE = `
${SCENE_MARKER}
// Ported from Expo SDK 57's ExpoAppSceneDelegate (plugins/with-ios-scene-lifecycle.js).
// Creates the window from the connecting scene, starts React Native into it, and re-feeds
// scene events to the AppDelegate so ExpoAppDelegate subscribers and the AppDelegate
// overrides above keep running under the scene life cycle.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  private var appDelegate: AppDelegate? {
    UIApplication.shared.delegate as? AppDelegate
  }

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene else {
      return
    }
    guard let appDelegate, let factory = appDelegate.reactNativeFactory else {
      fatalError("SceneDelegate couldn't start React Native: AppDelegate has no reactNativeFactory.")
    }

    let window = UIWindow(windowScene: windowScene)
    self.window = window
    // Mirror the window onto the app delegate so code reading
    // UIApplication.shared.delegate?.window keeps working (e.g. expo-system-ui).
    appDelegate.window = window

    // Under the scene life cycle cold-start URLs arrive in connectionOptions, but
    // React Native's Linking.getInitialURL() reads them from launch options.
    let browsingWebActivity = connectionOptions.userActivities.first {
      $0.activityType == NSUserActivityTypeBrowsingWeb
    }
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: Self.launchOptions(
        url: connectionOptions.urlContexts.first?.url,
        userActivity: browsingWebActivity
      )
    )

    for context in connectionOptions.urlContexts {
      open(url: context.url, options: Self.openURLOptions(from: context.options))
    }
    for activity in connectionOptions.userActivities {
      continueActivity(activity)
    }
    if let shortcutItem = connectionOptions.shortcutItem {
      perform(shortcutItem) { _ in }
    }
  }

  func sceneDidDisconnect(_ scene: UIScene) {
    window = nil
  }

  func sceneDidBecomeActive(_ scene: UIScene) {
    appDelegate?.applicationDidBecomeActive(UIApplication.shared)
  }

  func sceneWillResignActive(_ scene: UIScene) {
    appDelegate?.applicationWillResignActive(UIApplication.shared)
  }

  func sceneWillEnterForeground(_ scene: UIScene) {
    appDelegate?.applicationWillEnterForeground(UIApplication.shared)
  }

  func sceneDidEnterBackground(_ scene: UIScene) {
    appDelegate?.applicationDidEnterBackground(UIApplication.shared)
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    for context in URLContexts {
      open(url: context.url, options: Self.openURLOptions(from: context.options))
    }
  }

  func scene(_ scene: UIScene, willContinueUserActivityWithType userActivityType: String) {
    _ = appDelegate?.application(UIApplication.shared, willContinueUserActivityWithType: userActivityType)
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    continueActivity(userActivity)
  }

  func scene(
    _ scene: UIScene,
    didFailToContinueUserActivityWithType userActivityType: String,
    error: Error
  ) {
    appDelegate?.application(
      UIApplication.shared,
      didFailToContinueUserActivityWithType: userActivityType,
      error: error
    )
  }

  func scene(_ scene: UIScene, didUpdate userActivity: NSUserActivity) {
    appDelegate?.application(UIApplication.shared, didUpdate: userActivity)
  }

  func windowScene(
    _ windowScene: UIWindowScene,
    performActionFor shortcutItem: UIApplicationShortcutItem,
    completionHandler: @escaping (Bool) -> Void
  ) {
    perform(shortcutItem, completionHandler: completionHandler)
  }

  // MARK: Forwarding helpers

  // The AppDelegate overrides already call RCTLinkingManager themselves, so a single
  // call delivers the event to both the subscribers and React Native.
  private func open(url: URL, options: [UIApplication.OpenURLOptionsKey: Any]) {
    _ = appDelegate?.application(UIApplication.shared, open: url, options: options)
  }

  private func continueActivity(_ userActivity: NSUserActivity) {
    _ = appDelegate?.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
  }

  private func perform(
    _ shortcutItem: UIApplicationShortcutItem,
    completionHandler: @escaping (Bool) -> Void
  ) {
    guard let delegate = appDelegate as UIApplicationDelegate?,
      let handler = delegate.application(_:performActionFor:completionHandler:)
    else {
      completionHandler(false)
      return
    }
    handler(UIApplication.shared, shortcutItem, completionHandler)
  }

  private static func launchOptions(
    url: URL?,
    userActivity: NSUserActivity?
  ) -> [UIApplication.LaunchOptionsKey: Any]? {
    var launchOptions: [UIApplication.LaunchOptionsKey: Any] = [:]
    if let url {
      launchOptions[UIApplication.LaunchOptionsKey(rawValue: "UIApplicationLaunchOptionsURLKey")] = url
    }
    if let userActivity {
      launchOptions[UIApplication.LaunchOptionsKey(rawValue: "UIApplicationLaunchOptionsUserActivityDictionaryKey")] = [
        "UIApplicationLaunchOptionsUserActivityTypeKey": userActivity.activityType,
        "UIApplicationLaunchOptionsUserActivityKey": userActivity
      ]
    }
    return launchOptions.isEmpty ? nil : launchOptions
  }

  private static func openURLOptions(
    from sceneOptions: UIScene.OpenURLOptions
  ) -> [UIApplication.OpenURLOptionsKey: Any] {
    var options: [UIApplication.OpenURLOptionsKey: Any] = [:]
    if let sourceApplication = sceneOptions.sourceApplication {
      options[.sourceApplication] = sourceApplication
    }
    if let annotation = sceneOptions.annotation {
      options[.annotation] = annotation
    }
    options[.openInPlace] = sceneOptions.openInPlace
    return options
  }
}
`;

function updateAppDelegate(contents) {
  if (contents.includes(SCENE_MARKER)) {
    return contents;
  }
  if (
    !(contents.includes(APP_DELEGATE_CLASS) && WINDOW_STATEMENT.test(contents) && START_STATEMENT.test(contents))
  ) {
    throw new Error(
      "with-ios-scene-lifecycle: expected the standard Expo SDK 55 Swift AppDelegate (window + startReactNative in didFinishLaunching)"
    );
  }
  let next = contents
    .replace(WINDOW_STATEMENT, "")
    .replace(START_STATEMENT, "")
    .replace(EMPTY_OS_WRAPPER, "");
  if (!next.includes("import UIKit")) {
    next = next.replace("import React\n", "import React\nimport UIKit\n");
  }
  return `${next.trimEnd()}\n${SCENE_DELEGATE}`;
}

const withIosSceneLifecycle = (config) => {
  config = withAppDelegate(config, (appDelegateConfig) => {
    if (appDelegateConfig.modResults.language !== "swift") {
      throw new Error("with-ios-scene-lifecycle: only the Swift AppDelegate is supported");
    }
    appDelegateConfig.modResults.contents = updateAppDelegate(appDelegateConfig.modResults.contents);
    return appDelegateConfig;
  });
  return withInfoPlist(config, (plistConfig) => {
    plistConfig.modResults.UIApplicationSceneManifest = SCENE_MANIFEST;
    return plistConfig;
  });
};

module.exports = withIosSceneLifecycle;
module.exports.updateAppDelegate = updateAppDelegate;
