module.exports = function (api) {
  api.cache(true);

  return {
    presets: [["babel-preset-expo"], "nativewind/babel"],

    plugins: [
      [
        "module-resolver",
        {
          root: ["./"],

          alias: {
            "@": "./",
            "tailwind.config": "./tailwind.config.js",
          },
        },
      ],
      // Fix per Zustand 5.x: import.meta non supportato in React Native
      function () {
        return {
          visitor: {
            MetaProperty(path) {
              if (
                path.node.meta.name === "import" &&
                path.node.property.name === "meta"
              ) {
                path.replaceWithSourceString(
                  '{ env: { MODE: "development" } }',
                );
              }
            },
          },
        };
      },
      "react-native-reanimated/plugin", // DEVE ESSERE ULTIMO
    ],
  };
};
