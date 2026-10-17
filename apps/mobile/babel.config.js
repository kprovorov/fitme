const NODE_MODULES = /node_modules/;

module.exports = (api) => {
  // Metro runs the React Compiler on the app's code (`reactCompiler` in
  // app.json), but babel-preset-expo only turns it on for Metro's caller, so
  // Jest would test uncompiled components. Run it in Jest too, so tests catch
  // what it changes on a device (such as a hook it memoizes away).
  const isJest = api.caller((caller) => caller?.bundler === "jest");
  api.cache(true);
  return {
    overrides: isJest
      ? [
          {
            exclude: NODE_MODULES,
            plugins: [["babel-plugin-react-compiler", { target: "19" }]],
          },
        ]
      : [],
    presets: [["babel-preset-expo"]],
  };
};
