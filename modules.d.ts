// eslint-plugin-no-only-tests ships no type declarations.
declare module "eslint-plugin-no-only-tests" {
  const plugin: import("eslint").ESLint.Plugin;
  export default plugin;
}
