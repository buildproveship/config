// Shared .env loader for BuildProveShip test frameworks (appium2, UPF). A thin wrapper over dotenv, so the
// parsing rules are dotenv's; it exists to give every repo the same call and to make it testable with a
// synthetic env object instead of process.env.
import { config } from "dotenv";

/**
 * Load a .env file into an env object. Values already set in the target win (dotenv's default), so CI and
 * shell variables override the file. A missing file is not an error (CI sets the variables directly); any other read failure throws.
 * @param {{ path?: string, processEnv?: Record<string, string | undefined> }} [options]
 *   path: the file to read (default `.env` in the current directory); processEnv: the object to fill (default process.env)
 * @returns {Record<string, string>} the variables read from the file (empty when the file is missing)
 */
export function loadEnv({ path = ".env", processEnv = process.env } = {}) {
  const result = config({
    path,
    processEnv,
    quiet: true,
  });
  // dotenv reports read failures instead of throwing; only a missing file is expected.
  if (result.error && result.error.code !== "ENOENT") throw result.error;
  return result.parsed ?? {};
}
