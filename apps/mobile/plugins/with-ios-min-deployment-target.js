const { withPodfile } = require("expo/config-plugins");

const MIN_IOS_VERSION = "15.1";

const POST_INSTALL_MARKER = "react_native_post_install(";

const buildHook = (minVersion) => `
    # Xcode 27 rejects deployment targets below iOS 15. Some third-party pods
    # (and their resource-bundle targets) still declare older minimums, so raise
    # every pod target to at least the app's minimum.
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |build_configuration|
        current = build_configuration.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if current.nil? || Gem::Version.new(current) < Gem::Version.new('${minVersion}')
          build_configuration.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${minVersion}'
        end
      end
    end
`;

/**
 * Raises IPHONEOS_DEPLOYMENT_TARGET for every CocoaPods target to the given
 * minimum. Idempotent: runs only once per generated Podfile.
 */
const withIosMinDeploymentTarget = (
  config,
  { minVersion = MIN_IOS_VERSION } = {}
) =>
  withPodfile(config, (podfileConfig) => {
    const { contents } = podfileConfig.modResults;
    if (contents.includes("Xcode 27 rejects deployment targets")) {
      return podfileConfig;
    }
    const index = contents.indexOf(POST_INSTALL_MARKER);
    if (index === -1) {
      throw new Error(
        "with-ios-min-deployment-target: could not find react_native_post_install in Podfile"
      );
    }
    // Insert the hook before react_native_post_install so it runs inside post_install.
    const lineStart = contents.lastIndexOf("\n", index) + 1;
    podfileConfig.modResults.contents =
      contents.slice(0, lineStart) +
      buildHook(minVersion) +
      contents.slice(lineStart);
    return podfileConfig;
  });

module.exports = withIosMinDeploymentTarget;
