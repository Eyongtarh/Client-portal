// Jest-only config - Vite's own build never reads this file, so
// rewriting import.meta.env here can't affect production. Needed
// because api.js (like any Vite app) reads import.meta.env.
// VITE_API_URL, which Babel/Jest has no native meaning for outside
// Vite's own build pipeline.
function importMetaEnvToProcessEnv() {
  return {
    visitor: {
      MetaProperty(path) {
        path.replaceWithSourceString("({ env: process.env })");
      },
    },
  };
}

module.exports = {
  presets: [
    ["@babel/preset-env", { targets: { node: "current" } }],
    ["@babel/preset-react", { runtime: "automatic" }],
  ],
  plugins: [importMetaEnvToProcessEnv],
};
