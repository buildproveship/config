import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { checkEvidence } from "./release-evidence.js";

const { values } = parseArgs({ options: { evidence: { type: "string" } } });
if (!values.evidence)
  throw new Error("pass --evidence with the measurement JSON");
checkEvidence(JSON.parse(readFileSync(values.evidence, "utf8")));
