#!/usr/bin/env node
// buildproveship-guardrails: the mechanical half of the buildproveship-code-quality skill.
//
//   buildproveship-guardrails            run every check from the repo root (what pr.yml runs)
//   buildproveship-guardrails --static   only the fast file rules (no knip, no jscpd)
//   buildproveship-guardrails sync       write the published skill and its .claude stub into this repo
//   buildproveship-guardrails baseline   print allow entries (with `max`, empty reasons) for today's findings
import { parseArgs } from "node:util";
import { baseline, check, findAll } from "./index.js";
import { syncSkill } from "./skill.js";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    static: { type: "boolean", default: false },
    root: { type: "string", default: process.cwd() },
  },
});
const [command = "check"] = positionals;
if (command === "sync") {
  const written = await syncSkill(values.root);
  console.log(`wrote ${written.join(", ")}`);
} else if (command === "baseline") {
  const allow = baseline(await findAll(values.root));
  console.log(JSON.stringify({ allow }, null, 2));
} else if (command === "check") {
  process.exitCode = await check(values.root, { staticOnly: values.static });
} else {
  console.error(`unknown command "${command}" (use check, sync or baseline)`);
  process.exitCode = 2;
}
