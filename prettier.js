/**
 * Shared Prettier config. Prettier's defaults are the house style (double quotes, semicolons,
 * trailing commas, 80 columns): six of the eight JS/TS repos already used them, so adopting this
 * config reformats the fewest files. Values are spelled out so a Prettier major cannot move them.
 *
 * @type {import("prettier").Config}
 */
const config = {
  printWidth: 80,
  tabWidth: 2,
  useTabs: false,
  semi: true,
  singleQuote: false,
  jsxSingleQuote: false,
  quoteProps: "as-needed",
  trailingComma: "all",
  bracketSpacing: true,
  arrowParens: "always",
  endOfLine: "lf",
};

export default config;
