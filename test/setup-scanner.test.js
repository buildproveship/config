import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { parse } from "yaml";
import { renderCopilotSetup } from "../scripts/rollout.js";

const template = readFileSync(
  new URL("../templates/copilot-setup-steps.yml", import.meta.url),
  "utf8",
);
const sha = "a".repeat(40);
const installer = parse(
  readFileSync(
    new URL("../.github/actions/install-gitleaks/action.yml", import.meta.url),
    "utf8",
  ),
).runs.steps[0];

test("documented copy and renderer install the same governed scanner exactly once", () => {
  const copied = parse(template.replaceAll("<sha>", sha));
  const rendered = parse(renderCopilotSetup(sha));
  assert.deepEqual(rendered, copied);
  assert.deepEqual(copied.permissions, { contents: "read", packages: "read" });
  const steps = copied.jobs["copilot-setup-steps"].steps;
  const installers = steps.filter(
    /** @param {{ uses?: string }} step */ (step) =>
      step.uses?.includes("install-gitleaks"),
  );
  assert.equal(installers.length, 1);
  assert.equal(
    installers[0].uses,
    `buildproveship/config/.github/actions/install-gitleaks@${sha}`,
  );
  assert.ok(
    steps.indexOf(installers[0]) <
      steps.findIndex(
        /** @param {{ run?: string }} step */ (step) => step.run === "npm ci",
      ),
  );
});

test("selected installer verifies before extraction and exposes scanner to the next step", (t) => {
  const root = mkdtempSync(join(tmpdir(), "setup scanner "));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const archive = join(root, "fixture.tgz");
  const payload = join(root, "payload");
  const bin = join(root, "bin");
  mkdirSync(payload);
  mkdirSync(bin);
  writeFileSync(
    join(payload, "gitleaks"),
    "#!/bin/sh\nprintf 'synthetic scanner ready\\n'\n",
  );
  chmodSync(join(payload, "gitleaks"), 0o755);
  execFileSync("tar", ["-czf", archive, "-C", payload, "gitleaks"]);
  const digest = createHash("sha256")
    .update(readFileSync(archive))
    .digest("hex");
  writeFileSync(
    join(bin, "curl"),
    '#!/bin/sh\nwhile [ "$1" != "-o" ]; do shift; done\nshift\ncp "$FIXTURE_ARCHIVE" "$1"\n',
  );
  chmodSync(join(bin, "curl"), 0o755);
  for (const valid of [true, false]) {
    const temp = join(root, String(valid));
    mkdirSync(temp);
    const pathFile = join(temp, "path");
    writeFileSync(pathFile, "");
    // Only transport and archive digest are synthetic. Execute the unchanged governed shell.
    const result = spawnSync("bash", ["-e", "-c", installer.run], {
      encoding: "utf8",
      env: {
        PATH: `${bin}:${process.env.PATH}`,
        RUNNER_OS: "Linux",
        RUNNER_ARCH: "X64",
        RUNNER_TEMP: temp,
        GITHUB_PATH: pathFile,
        ...installer.env,
        GITLEAKS_SHA256_LINUX_X64: valid ? digest : "0".repeat(64),
        FIXTURE_ARCHIVE: archive,
      },
    });
    if (!valid) {
      assert.notEqual(result.status, 0);
      assert.equal(readFileSync(pathFile, "utf8"), "");
      assert.equal(existsSync(join(temp, "gitleaks-bin")), false);
      continue;
    }
    assert.equal(result.status, 0, result.stderr);
    const added = readFileSync(pathFile, "utf8").trim();
    const next = spawnSync("gitleaks", ["version"], {
      encoding: "utf8",
      env: { PATH: `${added}:${process.env.PATH}` },
    });
    assert.equal(next.status, 0, next.stderr);
    assert.equal(next.stdout.trim(), "synthetic scanner ready");
  }
});
