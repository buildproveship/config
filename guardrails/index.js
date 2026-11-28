// releaseready-guardrails: the mechanical half of the buildproveship-code-quality skill (CLI in cli.js).
//
// Repo settings live in releaseready-guardrails.json (see guardrails/config.schema.json). Every allowlist entry
// carries a reason, and an entry that no longer matches anything is itself an error.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { Ajv } from "ajv";
import { legacyRules } from "./old-code-rules.js";
import { alwaysExcluded, generatedGlobs, matches, rules } from "./rules.js";
import { skillDrift } from "./skill.js";

const require = createRequire(import.meta.url);
const configFile = "releaseready-guardrails.json";
/** The most duplication any repo may have (owner decision, 25 Nov 2026, RRDSCRUM-662); a repo may set a lower threshold. */
export const maxJscpdThreshold = 1;
const jscpdFormats = "javascript,typescript,jsx,tsx,python";

/**
 * @typedef {object} AllowEntry
 * @property {string} rule
 * @property {string} path glob
 * @property {string} [match] substring the offending line must contain
 * @property {number} [max] at most this many findings (a ratchet: the count may fall, never rise)
 * @property {string} reason
 */

/**
 * @typedef {object} GuardrailsConfig
 * @property {AllowEntry[]} [allow]
 * @property {{ threshold?: number; paths?: string[] }} [jscpd]
 * @property {{ enabled?: boolean; reason?: string; args?: string[] }} [knip]
 * @property {{ paths?: string[] }} [designSystem]
 * @property {{ path: string; reason: string }[]} [contractPaths]
 * @property {{ maxLines?: number; reason?: string; generated?: { path: string; reason: string }[] }} [fileLength]
 */

/**
 * @param {string} root
 * @returns {GuardrailsConfig}
 */
export function loadConfig(root) {
  const path = join(root, configFile);
  if (!existsSync(path)) return {};
  const config = /** @type {unknown} */ (
    JSON.parse(readFileSync(path, "utf8"))
  );
  const schema = /** @type {object} */ (
    JSON.parse(
      readFileSync(new URL("config.schema.json", import.meta.url), "utf8"),
    )
  );
  // nosemgrep: javascript.ajv.security.audit.ajv-allerrors-true.ajv-allerrors-true -- validates the repo's own small allowlist file, not untrusted input, and we want every error listed
  const ajv = new Ajv({ allErrors: true, strict: true, strictRequired: false });
  const validate = ajv.compile(schema);
  if (!validate(config)) {
    throw new Error(`${configFile}: ${ajv.errorsText(validate.errors)}`);
  }
  return /** @type {GuardrailsConfig} */ (config);
}

/**
 * Tracked and unignored files, as git sees them.
 *
 * @param {string} root
 * @returns {import("./rules.js").RepoFiles}
 */
export function repoFiles(root) {
  const output = execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
  );
  const tracked = execFileSync("git", ["ls-files", "-z", "--cached"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  })
    .split("\0")
    .filter(Boolean);
  const paths = [...new Set(output.split("\0").filter(Boolean))]
    .filter((p) => existsSync(join(root, p)))
    .filter((p) => !matches(p, alwaysExcluded))
    .sort();
  /** @type {Map<string, string>} */
  const cache = new Map();
  return {
    paths,
    tracked,
    read(path) {
      let text = cache.get(path);
      if (text === undefined) {
        text = readFileSync(join(root, path), "utf8");
        cache.set(path, text);
      }
      return text;
    },
  };
}

/**
 * Split findings into reported and allowed, and report allowlist entries that matched nothing.
 *
 * @param {import("./rules.js").Finding[]} findings
 * @param {AllowEntry[]} allow
 */
export function applyAllowlist(findings, allow) {
  const used = allow.map(() => 0);
  const reported = findings.filter((finding) => {
    const index = allow.findIndex(
      (entry, i) =>
        entry.rule === finding.rule &&
        matches(finding.path, entry.path) &&
        (entry.match === undefined ||
          (finding.text ?? "").includes(entry.match)) &&
        (entry.max === undefined || (used[i] ?? 0) < entry.max),
    );
    if (index === -1) return true;
    used[index] = (used[index] ?? 0) + 1;
    return false;
  });
  const allowed = findings.length - reported.length;
  allow.forEach((entry, index) => {
    const count = used[index] ?? 0;
    const label = `{rule: ${entry.rule}, path: ${entry.path}${entry.match === undefined ? "" : `, match: ${entry.match}`}}`;
    if (count === 0) {
      reported.push({
        rule: "unused-allow",
        path: configFile,
        line: 0,
        message: `allow entry ${label} matches nothing: delete it`,
      });
    } else if (entry.max !== undefined && count < entry.max) {
      reported.push({
        rule: "unused-allow",
        path: configFile,
        line: 0,
        message: `allow entry ${label} has max ${String(entry.max)} but matches ${String(count)}: lower max to ${String(count)}`,
      });
    }
  });
  return { reported, allowed };
}

/**
 * Allowlist entries (one per rule and file, with `max`) for the current findings, to adopt the guardrails in a repo
 * that already has them. The reasons are left empty on purpose: the config does not validate until a person writes
 * each one (for legacy code: the named current consumer, or the finding ID tracking its removal).
 *
 * @param {import("./rules.js").Finding[]} findings
 * @returns {AllowEntry[]}
 */
export function baseline(findings) {
  /** @type {Map<string, AllowEntry>} */
  const entries = new Map();
  for (const f of findings.filter((x) => x.rule !== "skill-drift")) {
    const key = `${f.rule}\0${f.path}`;
    const entry = entries.get(key) ?? {
      rule: f.rule,
      path: f.path,
      max: 0,
      reason: "",
    };
    entry.max = (entry.max ?? 0) + 1;
    entries.set(key, entry);
  }
  return [...entries.values()];
}

/**
 * @param {string} packageName
 * @param {string} bin
 */
function binPath(packageName, bin) {
  // Some tools (knip) do not export package.json, so find it the way Node's resolver looks for the package.
  const manifestPath = (require.resolve.paths(packageName) ?? [])
    .map((dir) => join(dir, packageName, "package.json"))
    .find((path) => existsSync(path));
  if (manifestPath === undefined)
    throw new Error(`${packageName} is not installed`);
  const manifest = /** @type {{ bin: Record<string, string> | string }} */ (
    JSON.parse(readFileSync(manifestPath, "utf8"))
  );
  const relativeBin =
    typeof manifest.bin === "string" ? manifest.bin : manifest.bin[bin];
  if (relativeBin === undefined)
    throw new Error(`${packageName} has no ${bin} bin`);
  return join(dirname(manifestPath), relativeBin);
}

/**
 * @param {string} label
 * @param {string} script
 * @param {string[]} args
 * @param {string} root
 */
function runTool(label, script, args, root) {
  console.log(`\n▶ ${label}`);
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    stdio: "inherit",
  });
  return result.status === 0;
}

/**
 * @param {string} root
 * @param {GuardrailsConfig} config
 */
function runKnip(root, config) {
  if (config.knip?.enabled === false) {
    console.log(`\n▷ knip skipped: ${config.knip.reason ?? ""}`);
    return true;
  }
  if (!existsSync(join(root, "package.json"))) {
    console.log("\n▷ knip skipped: no package.json (not a JS/TS repo)");
    return true;
  }
  return runTool(
    "knip (unused files, exports and dependencies)",
    binPath("knip", "knip"),
    ["--no-progress", ...(config.knip?.args ?? [])],
    root,
  );
}

/**
 * @param {string} root
 * @param {GuardrailsConfig} config
 */
function runJscpd(root, config) {
  const threshold = config.jscpd?.threshold ?? maxJscpdThreshold;
  const ignore = [...alwaysExcluded, ...generatedGlobs(config)];
  return runTool(
    `jscpd (duplication must stay at or below ${String(threshold)}%)`,
    binPath("jscpd", "jscpd"),
    [
      "--threshold",
      String(threshold),
      "--format",
      jscpdFormats,
      "--ignore",
      ignore.join(","),
      "--reporters",
      "console,threshold",
      ...(config.jscpd?.paths ?? ["."]),
    ],
    root,
  );
}

/**
 * Every static finding in `root`, before the allowlist.
 *
 * @param {string} root
 * @param {GuardrailsConfig} [config] the repo's releaseready-guardrails.json, read when not given
 */
export async function findAll(root, config = loadConfig(root)) {
  const repo = repoFiles(root);
  return [
    ...[...rules, ...legacyRules].flatMap((rule) => rule(repo, config)),
    ...(await skillDrift(repo)),
  ];
}

/**
 * Run every check against `root`. Returns the process exit code.
 *
 * @param {string} root
 * @param {{ staticOnly?: boolean }} [options]
 */
export async function check(root, options = {}) {
  const config = loadConfig(root);
  const findings = await findAll(root, config);
  const { reported, allowed } = applyAllowlist(findings, config.allow ?? []);
  for (const f of reported) {
    console.log(
      `${f.path}${f.line > 0 ? `:${String(f.line)}` : ""}  ${f.rule}  ${f.message}`,
    );
  }
  console.log(
    `releaseready-guardrails: ${String(reported.length)} error(s), ${String(allowed)} allowed by ${configFile}`,
  );
  let ok = reported.length === 0;
  if (!options.staticOnly) {
    ok = runKnip(root, config) && ok;
    ok = runJscpd(root, config) && ok;
  }
  return ok ? 0 : 1;
}
