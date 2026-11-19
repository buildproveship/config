import { test } from "node:test";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const noReason: any = 1;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the fixture needs an untyped value
export const withReason: any = 2;

/* eslint-disable */
export const unlimited = 3;
/* eslint-enable */

// @ts-ignore
export const ignored: number = "x";

// @ts-expect-error
export const expected: number = "y";

test.only("focused", () => undefined);
