// Test classification: unit
// Review status: Not Reviewed
// Evidence: synthetic
// Scope: the cost-cap settings in the CI spot-runner Terraform, read as text; it does not run Terraform or touch AWS.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (/** @type {string} */ file) =>
  readFileSync(new URL(`../infra/ci-runners/${file}`, import.meta.url), "utf8");
const main = read("main.tf");
const variables = read("variables.tf");

test("the runner count is capped at 2 and the cap cannot be raised by a variable", () => {
  assert.match(main, /runners_maximum_count\s*=\s*var\.max_runners/);
  assert.match(variables, /default\s*=\s*2\b/);
  assert.match(variables, /var\.max_runners <= 2/);
});

test("runners are spot, ephemeral and idle-free", () => {
  assert.match(main, /instance_target_capacity_type\s*=\s*"spot"/);
  assert.match(main, /enable_ephemeral_runners\s*=\s*true/);
  assert.doesNotMatch(main, /idle_config/);
});

test("no NAT gateway or private-subnet network is created", () => {
  assert.doesNotMatch(main, /nat_gateway|private_subnets|enable_nat/);
  assert.match(main, /data "aws_vpc" "default"/);
});

test("the module and its lambda zips are pinned to one release", () => {
  const pins = [
    ...main.matchAll(/\?ref=(v[\d.]+)/g),
    ...main.matchAll(/tag\s*=\s*"(v[\d.]+)"/g),
  ].map((m) => m[1]);
  assert.equal(pins.length, 5);
  assert.equal(new Set(pins).size, 1);
});

test("the only trivy exception is the runner egress finding, and it carries a reason", () => {
  const lines = readFileSync(
    new URL("../.trivyignore", import.meta.url),
    "utf8",
  )
    .split("\n")
    .filter((line) => line.trim() !== "");
  assert.deepEqual(
    lines.filter((line) => !line.startsWith("#")),
    ["AWS-0104"],
  );
  assert.ok(
    lines
      .filter((line) => line.startsWith("#"))
      .join(" ")
      .includes("Reason:"),
  );
});
