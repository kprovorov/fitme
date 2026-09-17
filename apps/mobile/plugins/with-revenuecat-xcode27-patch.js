const { withPodfile } = require("expo/config-plugins");

const POST_INSTALL_MARKER = "react_native_post_install(";
const HOOK_MARKER = "RevenueCat Xcode 27 workaround";

// Xcode 27 / Swift 6.4 synthesizes a memberwise init for `PaywallColor` that
// collides with its public `init(stringRepresentation:)`, so the RevenueCat pod
// fails to compile (https://github.com/RevenueCat/purchases-ios/issues/7730).
// Moving the designated initializer into the struct body suppresses the
// synthesized one. Remove this plugin once RevenueCat ships a fix.
const RUBY_HOOK = `
    # ${HOOK_MARKER}: see plugins/with-revenuecat-xcode27-patch.js
    paywall_color = File.join(installer.sandbox.root, 'RevenueCat', 'Sources', 'Paywalls', 'PaywallColor.swift')
    if File.exist?(paywall_color)
      source = File.read(paywall_color)
      designated_init = [
        '    /// "Designated" initializer',
        '    private init(stringRepresentation: String, underlyingColor: (any Sendable)?) {',
        '        self.stringRepresentation = stringRepresentation',
        '        self._underlyingColor = underlyingColor',
        '    }',
        '',
      ].join("\\n")
      anchor = "    fileprivate var _underlyingColor: (any Sendable)?\\n"
      if source.include?(designated_init) && source.include?(anchor)
        source = source.sub(designated_init, '')
        body_init = [
          '',
          '    /// Declared in the type body so Swift 6.4 does not synthesize a memberwise',
          '    /// initializer that collides with \`init(stringRepresentation:)\`.',
          '    fileprivate init(stringRepresentation: String, underlyingColor: (any Sendable)?) {',
          '        self.stringRepresentation = stringRepresentation',
          '        self._underlyingColor = underlyingColor',
          '    }',
          '',
        ].join("\\n")
        source = source.sub(anchor, anchor + body_init)
        File.write(paywall_color, source)
        Pod::UI.puts '[Fitme] Patched RevenueCat PaywallColor.swift for Xcode 27'
      end
    end
`;

const withRevenueCatXcode27Patch = (config) =>
  withPodfile(config, (podfileConfig) => {
    const { contents } = podfileConfig.modResults;
    if (contents.includes(HOOK_MARKER)) {
      return podfileConfig;
    }
    const index = contents.indexOf(POST_INSTALL_MARKER);
    if (index === -1) {
      throw new Error(
        "with-revenuecat-xcode27-patch: could not find react_native_post_install in Podfile"
      );
    }
    const lineStart = contents.lastIndexOf("\n", index) + 1;
    podfileConfig.modResults.contents =
      contents.slice(0, lineStart) + RUBY_HOOK + contents.slice(lineStart);
    return podfileConfig;
  });

module.exports = withRevenueCatXcode27Patch;
