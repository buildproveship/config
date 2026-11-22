// Shared Allure reporter entry for WebdriverIO `reporters` (appium2, UPF). One place for the output directory
// so every repo's CI uploads the same path.
export const allureResultsDir = "allure-results";

/**
 * The `reporters` tuple for @wdio/allure-reporter. Add it next to "spec" in a wdio config:
 * `reporters: ["spec", allureReporter()]`.
 * @param {Record<string, unknown>} [options] extra @wdio/allure-reporter options; they override the defaults
 * @returns {["allure", Record<string, unknown>]}
 */
export function allureReporter(options = {}) {
  return ["allure", { outputDir: allureResultsDir, ...options }];
}
