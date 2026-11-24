// Classification: integration; packed package and temporary Git consumers; Not Reviewed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  watch,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(new URL("../", import.meta.url));
test("packed lint-staged export preserves root and nested ownership through real commits", async (t) => {
  const base = mkdtempSync(join(tmpdir(), "shared config discovery proof "));
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([k]) => !k.startsWith("GIT_") && k !== "HUSKY" && k !== "CI",
    ),
  );
  env.PATH = `${source}/node_modules/.bin:${env.PATH}`;
  const results = [];
  try {
    const pack = spawnSync("npm", ["pack", "--pack-destination", base], {
      cwd: source,
      encoding: "utf8",
    });
    assert.equal(pack.status, 0, pack.stdout + pack.stderr);
    const archive = readdirSync(base).find((name) => name.endsWith(".tgz"));
    assert.ok(archive);
    for (const mode of ["forwarding", "owned", "fallback"])
      await t.test(mode, async (t) => {
        const forwarding = mode === "forwarding";
        const root = join(base, `consumer ${mode} root`);
        mkdirSync(root);
        const pkg = join(root, "node_modules/@buildproveship/config");
        mkdirSync(pkg, { recursive: true });
        const unpack = spawnSync(
          "tar",
          ["-xzf", join(base, archive), "-C", pkg, "--strip-components=1"],
          { encoding: "utf8" },
        );
        assert.equal(unpack.status, 0, unpack.stderr);
        // Reuse installed dependencies offline; all shared-package files come from the actual archive.
        symlinkSync(join(source, "node_modules"), join(pkg, "node_modules"));
        const packed = JSON.parse(
          readFileSync(join(pkg, "package.json"), "utf8"),
        );
        for (const target of Object.values(packed.exports["./lint-staged"])) {
          assert.ok(typeof target === "string");
          assert.ok(existsSync(join(pkg, target)));
        }
        assert.equal(
          packed.exports["./lint-staged"].default,
          "./hooks/lint-staged.config.js",
        );
        /** @param {string} p @param {string} s */
        const put = (p, s) => {
          mkdirSync(join(root, p, ".."), { recursive: true });
          writeFileSync(join(root, p), s);
        };
        /** @param {string} cmd @param {string[]} args */
        const run = (cmd, args) =>
          spawnSync(cmd, args, { cwd: root, env, encoding: "utf8" });
        /** @param {...string} args */
        const git = (...args) => {
          const r = run("git", args);
          assert.equal(r.status, 0, r.stdout + r.stderr);
          return r.stdout;
        };
        git("init", "-q");
        git("config", "core.hooksPath", ".git/hooks");
        git("config", "user.name", "Synthetic");
        git("config", "user.email", "test@example.com");
        git("config", "commit.gpgsign", "false");
        put("package.json", '{"type":"module","private":true}\n');
        put(".gitignore", "node_modules/\n");
        put(
          "eslint.config.js",
          `export default ${JSON.stringify([{ rules: { "no-restricted-syntax": ["error", { selector: 'Identifier[name="BAD_ROOT"]', message: "root rejection" }] } }])};\n`,
        );

        if (forwarding)
          put(
            "lint-staged.config.mjs",
            "export { default } from '@buildproveship/config/lint-staged';\n",
          );
        if (mode === "owned")
          put(
            "lint-staged.config.mjs",
            `export default {'*.js': ${JSON.stringify(`node "${join(base, "nested-check.cjs")}"`)}};\n`,
          );
        put(
          "nested area/lint-staged.config.js",
          `export default {'*.js': ${JSON.stringify(`node "${join(base, "nested-check.cjs")}"`)}};\n`,
        );
        writeFileSync(
          join(base, "nested-check.cjs"),
          `const fs=require('node:fs');for(const p of process.argv.slice(2)){const text=fs.readFileSync(p,'utf8');if(text.includes('REJECT_NESTED')){console.error('NESTED_OVERRIDE_REJECTED');process.exitCode=1;}}\n`,
        );
        put(
          "root file.js",
          "export const value = 0;\n" +
            "\n".repeat(12) +
            "// footer original\n",
        );
        put("nested area/nested file.js", "export const nested = 0;\n");
        git("add", ".");
        git("commit", "-qm", "RRDPLAT-111: fixture baseline");
        const install = run(process.execPath, [
          join(pkg, "hooks/cli.js"),
          "install",
        ]);
        assert.equal(install.status, 0, install.stdout + install.stderr);
        git("add", ".husky");
        git("commit", "-qm", "RRDPLAT-111: installed real hooks");
        const configPaths = [
          "nested area/lint-staged.config.js",
          ...(mode !== "fallback" ? ["lint-staged.config.mjs"] : []),
        ];
        const configBefore = configPaths.map((p) =>
          readFileSync(join(root, p), "utf8"),
        );
        /** @type {unknown[]} */
        const events = [];
        const watcher = watch(root, { recursive: true }, (event, path) => {
          if (path && !path.startsWith(".git/") && /lint.?staged/.test(path))
            events.push({ event, path });
        });
        t.after(() => watcher.close());
        /** @param {string} label */
        async function commit(label) {
          const r = run("git", ["commit", "-m", `RRDPLAT-111: ${label}`]);
          await new Promise((resolve) => setTimeout(resolve, 100));
          return r;
        }
        // Both staged paths include spaces. Nested override must veto an otherwise valid root change.
        put(
          "root file.js",
          "export const value=1\n" + "\n".repeat(12) + "// footer original\n",
        );
        put(
          "nested area/nested file.js",
          "export const nested=1; // REJECT_NESTED\n",
        );
        git("add", "root file.js", "nested area/nested file.js");
        const before = git("rev-parse", "HEAD");
        const rejected = await commit("nested rejection");
        assert.equal(
          rejected.status === 0,
          mode === "fallback",
          rejected.stdout + rejected.stderr,
        );
        if (mode !== "fallback") {
          assert.match(
            rejected.stdout + rejected.stderr,
            /NESTED_OVERRIDE_REJECTED/,
          );
          assert.equal(git("rev-parse", "HEAD"), before);
          assert.match(
            git("show", ":nested area/nested file.js"),
            /REJECT_NESTED/,
          );
        }
        results.push({
          forwarding,
          case: "nested rejection with root and nested staged",
          exit: rejected.status,
        });
        git("reset", "--hard", "HEAD");
        // Root still uses the actual shared ESLint task.
        put(
          "root file.js",
          mode === "owned"
            ? "export const root=1; // REJECT_NESTED\n"
            : "export const BAD_ROOT=1;\n",
        );
        git("add", "root file.js");
        const rootRejected = await commit("root rejection");
        assert.notEqual(
          rootRejected.status,
          0,
          rootRejected.stdout + rootRejected.stderr,
        );
        assert.match(
          rootRejected.stdout + rootRejected.stderr,
          mode === "owned"
            ? /NESTED_OVERRIDE_REJECTED/
            : /root rejection.*no-restricted-syntax/,
        );
        results.push({
          forwarding,
          case: "root shared ESLint rejection",
          exit: rootRejected.status,
        });
        git("reset", "--hard", "HEAD");
        // Unstaged changes must be hidden from tasks and restored, never committed.
        const stagedRoot =
          "export const value=2\n" + "\n".repeat(12) + "// footer original\n";
        put("root file.js", stagedRoot);
        const nestedStaged =
          mode === "fallback"
            ? "export const nested=2;\n"
            : "export const BAD_ROOT=2;\n";
        put("nested area/nested file.js", nestedStaged);
        git("add", "root file.js", "nested area/nested file.js");
        put(
          "root file.js",
          stagedRoot.replace("footer original", "footer UNSTAGED"),
        );
        put(
          "nested area/nested file.js",
          `${nestedStaged}// REJECT_NESTED unstaged only\n`,
        );
        const partial = await commit("partially staged success");
        assert.equal(partial.status, 0, partial.stdout + partial.stderr);
        const rootHead = git("show", "HEAD:root file.js");
        const nestedHead = git("show", "HEAD:nested area/nested file.js");
        assert.match(
          rootHead,
          mode === "owned" ? /export const value=2/ : /export const value = 2;/,
        );
        assert.doesNotMatch(rootHead, /UNSTAGED/);
        assert.doesNotMatch(nestedHead, /REJECT_NESTED/);
        if (mode !== "fallback") assert.match(nestedHead, /BAD_ROOT/);
        assert.match(
          readFileSync(join(root, "root file.js"), "utf8"),
          /footer UNSTAGED/,
        );
        assert.match(
          readFileSync(join(root, "nested area/nested file.js"), "utf8"),
          /REJECT_NESTED unstaged only/,
        );
        assert.equal(git("diff", "--cached"), "");
        assert.deepEqual(
          configPaths.map((p) => readFileSync(join(root, p), "utf8")),
          configBefore,
        );
        assert.deepEqual(
          events,
          [],
          "no config creation/modification observed during commits",
        );
        if (mode === "fallback")
          assert.equal(existsSync(join(root, "lint-staged.config.mjs")), false);
        results.push({
          forwarding,
          case: "partial staging, actual formatting, unstaged restoration, no config writes",
          exit: partial.status,
        });
      });
    assert.equal(results.length, 9);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
