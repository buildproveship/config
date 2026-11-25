# Shared staged-file checks

The package exports its existing default as `@buildproveship/config/lint-staged`. To opt into lint-staged's
normal closest-config discovery while keeping the shared defaults at the root, commit this consumer-owned
`lint-staged.config.mjs` in the repository root:

```js
export { default } from "@buildproveship/config/lint-staged";
```

Use a package version that includes this export. The config runs ESLint and Prettier for staged code and
Prettier for the other supported file types. It does not install those tools or generate consumer configs.
The shared pre-commit caller remains unchanged: a root config enables normal lint-staged discovery, and
lint-staged owns partial staging and restoration of unstaged edits.

Verify the export resolves in the consumer before adopting the forwarding file:

```sh
node --input-type=module -e "import('@buildproveship/config/lint-staged')"
```

A forwarding config with an incompatible installed package is unsupported. With nested configs present,
lint-staged can ignore an unloadable root config and leave root files unchecked; a successful commit alone
does not verify that the package supports the export.

A nested configuration owns files closest to it; its rules do not automatically merge with the root defaults.
If those files also need shared checks, the nested owner must explicitly import and compose the shared
configuration. Review existing consumer-owned configs rather than replacing them with the example.

Consumers with no root config keep the current explicit shared fallback. In that mode, nested-only configs
are not discovered. This additive export does not transparently fix nested ownership for those consumers:
opting in requires a deliberate committed root config and a compatible package version. No temporary config
is created during a commit, and no consumer migration or package release is implied by this documentation.
