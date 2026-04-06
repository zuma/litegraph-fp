# Flash Agent Continuous Workflow

**AI INSTRUCTIONS:** 
You are acting as a junior developer. When the user points you to this file and says "Start", or when the user says "Continue":
1. Read this file to find the **first incomplete subtask** (marked with `[ ]`).
2. Execute **ONLY** that single subtask. Do not look ahead to the next numbered list item.
3. Keep your context footprint minimal. Only read the files explicitly required.
4. **MANDATORY VERIFICATION:** If a subtask asks you to write code, you must use your terminal to run type-checking (`npx tsc --noEmit`) and tests (`npx vitest run --passWithNoTests`) before finishing. If it fails, fix your code and try again.
5. Only once verified, use your file editing tools to change the `[ ]` to `[x]` in this document.
6. STOP abruptly. Give a 1-sentence summary of what you did, and ask the user to type "continue".

> **GUARDRAIL:** Try to keep your modifications confined to `src/registry/` and `src/tests/` unless architecture changes require you to fix types elsewhere.

---

## Phase 1: Core Node Refactoring

### Task 1: Refactor `math.ts` to use NodeDefinition
- [x] **1a:** View `src/registry/math.ts` and `src/registry/types.ts` to understand the current structure.
- [x] **1b:** In `src/registry/math.ts`, change the import statement to `import { NodeDefinition } from './types.js';`.
- [x] **1c:** Refactor the `add` export. Change it from a raw arrow function to an object: `export const add: NodeDefinition = { ... }`.
- [x] **1d:** Inside the `add` object, set the exact literal strings: `namespace: 'core'`, `category: 'math'`, `name: 'add'`.
- [x] **1e:** Inside the `add` object, explicitly set the arrays: `requires: ['a', 'b']` and `provides: ['out']`.
- [x] **1f:** Move the original function logic into the `execute: (inputs) => { ... }` block inside the `NodeDefinition`.
- [x] **1g:** Repeat steps 1c through 1f for the `multiply` node.
- [x] **1h:** Run `npx tsc --noEmit` in your terminal to ensure there are no TypeScript interface errors in `math.ts`.

### Task 2: Refactor `logic.ts` to use NodeDefinition
- [x] **2a:** View `src/registry/logic.ts` to see what is currently there.
- [x] **2b:** Add the import: `import { NodeDefinition } from './types.js';`.
- [x] **2c:** Convert every existing logic node into a `NodeDefinition` object.
- [x] **2d:** For every logic node, set `namespace: 'core'`, `category: 'logic'`, and `name: '[function_name]'`.
- [x] **2e:** explicitly declare the `requires` array (what inputs it expects) and `provides: ['out']` for every node.
- [x] **2f:** Run `npx tsc --noEmit` to verify type completion.

### Task 3: Establish Test Coverage
- [x] **3a:** Create a new file at `src/tests/math.test.ts`.
- [x] **3b:** Write a `vitest` suite that specifically imports the `add` node from `../registry/math.js` and tests `add.execute({a: 5, b: 10}, {})`.
- [x] **3c:** Write a test to ensure missing inputs fall back safely (e.g. `add.execute({}, {})` should not crash).
- [x] **3d:** Run `npx vitest run` in the terminal to verify the tests pass.

---

## Phase 2: Math Library Expansion (Batched to save context)

### Task 4: Basic Math Expansion
- [x] **4a:** Open `src/registry/math.ts`.
- [x] **4b:** Create a completely new export for `subtract` using the exact `NodeDefinition` format. It requires `['a', 'b']`.
- [x] **4c:** Create a completely new export for `divide` using the exact `NodeDefinition` format. It requires `['a', 'b']`. In the execute block, if `b === 0`, return `{ out: 0 }` to rigidly prevent Infinity crashes.
- [x] **4d:** Create a completely new export for `modulo` using the exact `NodeDefinition` format. It requires `['a', 'b']`.
- [x] **4e:** Open `src/tests/math.test.ts` and write positive/negative/zero edge case tests for `subtract`, `divide`, and `modulo`.
- [x] **4f:** Run compilation (`tsc --noEmit`) and tests (`vitest run`). Fix any broken logic.

### Task 5: Trigonometry & Utilities Expansion
- [x] **5a:** Open `src/registry/math.ts`.
- [x] **5b:** Add `NodeDefinition` exports for `sin`, `cos`, and `tan`. Use `Math.sin`, etc. They should only require `['a']`.
- [x] **5c:** Add `NodeDefinition` exports for `abs` and `round`. They require `['a']`.
- [x] **5d:** Ensure all 5 new nodes have `namespace: 'core'` and `category: 'math'`.
- [x] **5e:** Add corresponding unit tests to `src/tests/math.test.ts` for all 5 new nodes.
- [x] **5f:** Run compilation and tests. Fix any errors.

---

## Phase 3: Advanced Math & Vectors

### Task 6: Extended Math
- [ ] **6a:** Open `src/registry/math.ts` and add `NodeDefinition` exports for `min`, `max`, `clamp`, and `lerp`.
- [ ] **6b:** `min` and `max` require `['a', 'b']`. `clamp` requires `['a', 'min', 'max']`. `lerp` requires `['a', 'b', 't']`.
- [ ] **6c:** Create corresponding tests in `src/tests/math.test.ts` for all 4 new nodes.
- [ ] **6d:** Run verification.

### Task 7: Vector Operations
- [ ] **7a:** Create `src/registry/vector.ts` and import `NodeDefinition`.
- [ ] **7b:** Implement `vec2Pack` (requires `['x', 'y']`, provides `['out']`) returning an array or floating point array type.
- [ ] **7c:** Implement `vec2Unpack` (requires `['vec']`, provides `['x', 'y']`).
- [ ] **7d:** Create `src/tests/vector.test.ts` to verify packing and unpacking logic safely.
- [ ] **7e:** Run verification.

---

## Phase 4: Logic & Flow Standard Library

### Task 8: Comparisons
- [ ] **8a:** Open `src/registry/logic.ts`.
- [ ] **8b:** Implement `equals`, `greaterThan`, and `lessThan` returning `{ out: boolean }`.
- [ ] **8c:** Create `src/tests/logic.test.ts` with test cases verifying correct truthiness and comparisons safely.
- [ ] **8d:** Run verification.

### Task 9: Boolean Logic
- [ ] **9a:** Open `src/registry/logic.ts`.
- [ ] **9b:** Implement `and`, `or`, and `xor`. Ensure inputs are safely coerced to boolean implicitly.
- [ ] **9c:** Implement a `branch` control flow node. It requires `['condition', 'true_val', 'false_val']` and returns `{ out: condition ? true_val : false_val }`.
- [ ] **9d:** Add corresponding tests to `src/tests/logic.test.ts`. 
- [ ] **9e:** Run verification.

---

## Phase 5: Strings & Arrays 

### Task 10: String Utilities
- [ ] **10a:** Create `src/registry/string.ts`.
- [ ] **10b:** Implement `concat` (requires `['a', 'b']`), `length` (requires `['str']`), and `toString` (requires `['val']`).
- [ ] **10c:** Create `src/tests/string.test.ts` and test edge cases like null/undefined inputs.
- [ ] **10d:** Run verification.

### Task 11: Array Utilities
- [ ] **11a:** Create `src/registry/array.ts`.
- [ ] **11b:** Implement `packArray` (requires `['a', 'b', 'c']`, providing an array `['out']`) and `arrayLength` (requires `['arr']`).
- [ ] **11c:** Create `src/tests/array.test.ts` and ensure non-arrays fall back to 0 or return fallback values safely.
- [ ] **11d:** Run verification.

---

## Phase 6: System & I/O 

### Task 12: Core System & Commands
*Note: In functional architectures, nodes shouldn't do side effects; they yield `$commands` to the dispatcher.*
- [ ] **12a:** Create `src/registry/system.ts`.
- [ ] **12b:** Implement a `consoleLog` node. It requires `['msg']`. It returns `{ out: msg, $commands: [{ type: 'LOG', payload: msg }] }`.
- [ ] **12c:** Create `src/tests/system.test.ts` to ensure `$commands` arrays are emitted cleanly within pure execution blocks.
- [ ] **12d:** Run verification.

*(AI: Remember to mark the checkbox with an 'x' upon completion of a single subtask before stopping!)*
