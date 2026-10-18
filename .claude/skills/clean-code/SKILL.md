---
name: clean-code
description: Write and review code so it is simple, readable and easy to change. Use when writing, refactoring or reviewing code, or when the user mentions clean code, readability, naming, code smells or cleanup.
---

# Clean Code

Make the code easy to read first. Match the style of the surrounding code before applying any rule below.

## When writing code

1. **Names say what a thing is or does.** Use full words, not abbreviations. A function is a verb (`sendInvite`), a value is a noun (`expiresAt`), a yes/no is a question (`isExpired`). If a name needs a comment, rename it.
2. **Keep functions small and single-purpose.** One level of detail per function. If you must write "and" to describe it, split it. Aim for at most 3 parameters; group more into an object.
3. **Return early.** Handle errors and edge cases at the top so the main path is not nested. Avoid deep `if` nesting.
4. **No magic values.** Give numbers and strings a named constant (`MAX_JSON_BYTES`, not `262144`).
5. **Do not repeat yourself, but do not abstract too early.** Extract after the third copy, and only if the copies change for the same reason.
6. **Make invalid states impossible.** Use precise types, enums and validation at the edges (zod), then trust the data inside.
7. **Handle errors on purpose.** Fail with a clear error type and message. Never swallow errors silently. Do not use exceptions for normal control flow.
8. **Keep side effects at the edges.** Pure logic in the middle; I/O (database, network, time, randomness) passed in so it can be tested.
9. **Comments explain why, not what.** Delete comments that repeat the code, and delete commented-out code.
10. **No dead code.** Remove unused functions, imports, parameters and flags.

## When reviewing or refactoring

Look for these smells and fix the worst first:

- Long function or file, or a function doing several jobs
- Deep nesting, long `if/else` chains, flag arguments
- Unclear or misleading names
- Duplicated logic
- Primitive values passed around that should be one object or type
- Hidden dependencies (globals, current time, environment reads inside logic)
- Missing or weak tests around code you are about to change

Rules for a refactor:
- Change structure, not behaviour. Run the tests before and after.
- Make small steps, one kind of change per commit.
- Do not mix a refactor with a new feature or bug fix.
- Do not rewrite code that is fine just because you would write it differently.

## Before finishing

- [ ] Names are clear and consistent with the rest of the code
- [ ] Each function does one thing and fits on a screen
- [ ] No duplicated logic, magic values, dead code or leftover debug output
- [ ] Errors are handled and give useful messages
- [ ] Tests, lint and type check pass
- [ ] The diff contains only what the task needed
