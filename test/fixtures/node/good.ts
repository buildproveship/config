import { test } from "node:test";

export function add(a: number, b: number): string {
  return `${a + b}`;
}

export function drop(input: { omitted: string; kept: number }): { kept: number } {
  const { omitted, ...rest } = input;
  return rest;
}

test("add", () => {
  if (add(1, 2) !== "3") throw new Error("add failed");
});
