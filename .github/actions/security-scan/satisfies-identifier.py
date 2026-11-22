#!/usr/bin/env python3
"""Fail when tracked TypeScript uses `satisfies` as an identifier (RRDSCRUM-395, UA2-18).

Semgrep 1.186.0 still reports PartialParsing for `let satisfies: Fn`, `const satisfies = ...` and
`satisfies(a, b)`: it reads the identifier as the TypeScript operator and silently skips the line, so
no rule runs on it. The `--error` flag does not fail on a partial parse, so this step does.
The operator is always followed by a type, so `x satisfies Type` is not matched.
Checked first: current Semgrep (still broken, see the CHANGELOG), the Semgrep rule options (none keep
parsing) and npm/PyPI (no maintained wrapper); a one-regex check is the smallest fit.
"""
import re
import subprocess
import sys

IDENTIFIER = re.compile(r"(?<![\w.$\"'/-])satisfies\s*[:=,;()]")


def offenders(root: str) -> list[str]:
    files = subprocess.run(
        ["git", "ls-files", "-z", "--", "*.ts", "*.tsx", "*.mts", "*.cts"],
        cwd=root, check=True, capture_output=True, text=True,
    ).stdout.split("\0")
    found = []
    for name in filter(None, files):
        with open(f"{root}/{name}", encoding="utf-8") as handle:
            for number, line in enumerate(handle, 1):
                if IDENTIFIER.search(line):
                    found.append(f"{name}:{number}: {line.strip()}")
    return found


if __name__ == "__main__":
    hits = offenders(sys.argv[1] if len(sys.argv) > 1 else ".")
    if hits:
        print("Semgrep cannot parse `satisfies` used as an identifier; rename it (for example satisfiesRange):", file=sys.stderr)
        print("\n".join(hits), file=sys.stderr)
        sys.exit(1)
