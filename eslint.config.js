// This repo lints itself with the config it publishes.
import { defineConfig } from "eslint/config";
import { buildproveship } from "./eslint.js";

export default defineConfig(
  buildproveship({ tsconfigRootDir: import.meta.dirname }),
  // Fixtures hold deliberate violations for the tests.
  { ignores: ["test/fixtures/**", "types/**"] },
);
