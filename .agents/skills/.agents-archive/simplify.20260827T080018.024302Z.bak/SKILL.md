---
name: simplify
description: Simplify and refine recently modified code for clarity and consistency. Use after writing code to improve readability without changing functionality.
---

# Simplify

Improve recently changed code for clarity and maintainability without changing
observable behavior. Follow the active project's own instructions, language
conventions, public interfaces, and validation commands.

## Method

1. Establish the changed scope and its affected consumers.
2. Record or run the project's behavioral checks before editing when practical.
3. Remove redundant branches, nesting, indirection, duplication, and comments
   that merely restate the code.
4. Prefer descriptive names, explicit control flow, cohesive functions, and the
   project's established abstractions over dense or clever expressions.
5. Preserve error semantics, side effects, ordering, compatibility requirements,
   public types, outputs, and performance characteristics unless the request
   explicitly changes them.
6. Run the project's canonical formatter, static checks, and relevant tests.
7. Report the simplification and the evidence that behavior was preserved.

## Boundaries

- Work only in the requested or recently changed scope unless broader cleanup is
  necessary for correctness.
- Do not replace a clear abstraction merely to reduce line count.
- Do not hide failures with suppression, fallback behavior, hardcoded results, or
  weakened tests.
- Stop and report the conflict when preserving behavior and following the active
  project contract cannot both be achieved.
