# Code Review: litegraph-fp

A full audit of the codebase from architecture to polish. Items are grouped by severity.

---

## 🔴 Bugs & Correctness Issues

### 1. [RESOLVED] Dispatcher is recreated on every execution — handlers are lost

In [runExecutionPipeline()](file:///workspaces/litegraph-fp/src/ui/main.ts#L317-L324), a **brand new dispatcher** is created on every single graph evaluation:

```typescript
const dispatcher = createDispatcher();
dispatcher.on('CONSOLE_LOG', async (cmd, sourceNodeId) => { ... });
await dispatcher.dispatchFromExecution(result);
```

This means:
- Handler registration is thrown away after every run
- If you ever want persistent handlers (e.g., for custom plugins), you can't add them once — they'll vanish
- The "System starting command execution dispatcher…" log fires **every** execution, flooding the console

**Fix**: Create the dispatcher once at module scope and register handlers once during init. Only call `dispatchFromExecution()` per run.

---

### 2. [RESOLVED] Duplicate constant declarations between `canvas.ts` and `main.ts`

[canvas.ts](file:///workspaces/litegraph-fp/src/ui/canvas.ts#L9-L12) exports `NODE_WIDTH`, `ROW_HEIGHT`, `HEADER_HEIGHT`, `PIN_RADIUS`.

[main.ts](file:///workspaces/litegraph-fp/src/ui/main.ts#L229-L232) **re-declares** these same constants as local variables:

```typescript
const NODE_WIDTH = 180;
const ROW_HEIGHT = 15;
const HEADER_HEIGHT = 30;
const GRID_SIZE = 30;
```

These shadows are a maintenance landmine — if you change the value in `canvas.ts`, `main.ts` will silently use the old value. `GRID_SIZE` is the only unique one.

**Fix**: Import the shared constants from `canvas.ts` and only declare `GRID_SIZE` locally.

---

### 3. [RESOLVED] `getNodeHeight` accepts different argument types in different files

- [canvas.ts](file:///workspaces/litegraph-fp/src/ui/canvas.ts#L35) → `getNodeHeight(nodeDef?: NodeDefinition)` — takes a **definition**
- [main.ts](file:///workspaces/litegraph-fp/src/ui/main.ts#L234) → `getNodeHeight(node: NodeState)` — takes a **node**, looks up the definition internally

Two functions with the same name, different signatures, doing similar work. The one in `canvas.ts` is exported but `main.ts` doesn't use it — it has its own copy that also does the registry lookup. Any caller has to know which one they're calling.

**Fix**: Consolidate into one canonical function (preferably in `canvas.ts` since it's the layout module) and import it.

---

### 4. [RESOLVED] Stale comments referencing old spacing

Several comments still reference `60px` pin spacing from before the refactor to `15px`:

- [canvas.ts:49](file:///workspaces/litegraph-fp/src/ui/canvas.ts#L49): `// Pins placed at ny + 60 + pinIndex * 60 (grid aligned)`
- [canvas.ts:60](file:///workspaces/litegraph-fp/src/ui/canvas.ts#L60): Same stale comment
- [main.ts:250](file:///workspaces/litegraph-fp/src/ui/main.ts#L250): Same stale comment
- [main.ts:263](file:///workspaces/litegraph-fp/src/ui/main.ts#L263): Same stale comment

The actual formula is `ny + 60 + pinIndex * 15`, not `× 60`. These are misleading.

---

### 5. [RESOLVED] `drawDraggingConnection` in `canvas.ts` is dead code

[drawDraggingConnection()](file:///workspaces/litegraph-fp/src/ui/canvas.ts#L324-L341) is exported but **never called**. It also does nothing useful — it saves and immediately restores the context. The actual dragging connection is drawn in [renderer.ts:59-85](file:///workspaces/litegraph-fp/src/ui/renderer.ts#L59-L85).

**Fix**: Delete the dead function.

---

### 6. Registry has nodes defined but not registered

[math.ts](file:///workspaces/litegraph-fp/src/registry/math.ts) exports `subtract`, `divide`, `modulo`, `sin`, `cos`, `tan`, `abs`, `round` — 8 node definitions.

[index.ts](file:///workspaces/litegraph-fp/src/registry/index.ts) only registers `add` and `multiply`. The other 8 are invisible to the app.

**Fix**: Register all exported definitions in `StandardNodes`, or remove the dead code.

---

### 7. `as any` type escape in the registry

[registry/index.ts:19](file:///workspaces/litegraph-fp/src/registry/index.ts#L19): `Object.freeze({ ... } as any)` completely bypasses TypeScript's type checking. Any type mismatch between a `NodeDefinition` and its registration will be silently accepted.

**Fix**: Remove the `as any` cast. If the types don't align, fix the underlying type definition rather than escaping the type system.

---

## 🟡 Architecture & Maintainability

### 8. [RESOLVED] `main.ts` is a 1,485-line monolith

This single file contains:
- Graph state management
- Undo/redo system
- Execution pipeline orchestration
- Node inspector DOM manipulation
- All mouse/keyboard event handlers
- Node CRUD operations
- Theme management
- Sidebar toggling
- Console logging

This makes it difficult to test any UI logic in isolation and creates merge conflicts when multiple features are in flight.

> [!TIP]
> Consider extracting into focused modules:
> - `state.ts` — Graph state, undo/redo, history
> - `inspector.ts` — Inspector panel DOM logic
> - `interactions.ts` — Mouse/keyboard event handling
> - `selection.ts` — Selection box + multi-select logic
> - `init.ts` — Theme, sidebar, and DOM setup

---

### 9. [RESOLVED] Rendering context is duplicated state

The `syncContextState()` pattern in [main.ts:171-177](file:///workspaces/litegraph-fp/src/ui/main.ts#L171-L177) manually copies `selectedNodeId`, `selectedNodeIds`, `nodeErrors` from module variables into `renderingContext`. This is easy to forget (and has caused bugs). If any new state gets added but `syncContextState()` isn't updated, the renderer silently shows stale data.

**Fix**: Rather than duplicating state, have the renderer read from a single source of truth — either pass getters to the renderer, or use the module-level variables directly.

---

### 10. [RESOLVED] No `vitest` script in `package.json`

[package.json](file:///workspaces/litegraph-fp/package.json#L8) has `"test": "tsx test.ts"` which runs the ad-hoc integration test, but there's no way to run the vitest unit tests in `src/tests/`. The vitest suite (with `describe`/`it`/`expect`) is never executed in CI or development.

**Fix**: Add `"test:unit": "vitest run"` and keep `"test:e2e": "tsx test.ts"` separate.

---

### 11. [RESOLVED] `getComputedStyle(document.body)` is called on every drawn node every frame

In [drawNode()](file:///workspaces/litegraph-fp/src/ui/canvas.ts#L115) and [drawEdge()](file:///workspaces/litegraph-fp/src/ui/canvas.ts#L290), `getComputedStyle(document.body)` is called for **every node and every edge**, on **every frame** at 60fps. This forces the browser to perform layout recalculations.

**Fix**: Call `getComputedStyle` once per frame in the render loop and pass the result into the drawing functions.

---

## 🟢 Performance Opportunities

### 12. [RESOLVED] Unbounded `logToTerminal` DOM growth

[logToTerminal()](file:///workspaces/litegraph-fp/src/ui/main.ts#L348-L358) appends a new `<div>` to the terminal on every call, with no cap. With auto-run enabled, every graph evaluation adds 3+ lines. A complex session can easily produce thousands of DOM nodes, causing layout thrashing and memory bloat.

**Fix**: Cap the terminal to ~200 lines and remove oldest entries when exceeded.

---

### 13. [RESOLVED] `JSON.parse(JSON.stringify(...))` for deep cloning

[pushToHistory()](file:///workspaces/litegraph-fp/src/ui/main.ts#L109), [undo()](file:///workspaces/litegraph-fp/src/ui/main.ts#L125), [redo()](file:///workspaces/litegraph-fp/src/ui/main.ts#L146), and drag start all use `JSON.parse(JSON.stringify(currentGraph))`. This is slow for large graphs and will silently strip any `undefined` values or functions.

Since the graph is a plain JSON-serializable object, `structuredClone(currentGraph)` is a faster, safer modern alternative.

---

### 14. [RESOLVED] Edge animation forces continuous repaints

The flowing pulse animation at [canvas.ts:318](file:///workspaces/litegraph-fp/src/ui/canvas.ts#L318) (`Date.now() / 24`) means the canvas is **always dirty** — the render loop can never skip a frame because the dashes are always moving. This burns CPU even when the user is idle.

> [!TIP]
> Consider only animating edges when the graph is executing, or using a dirty flag to skip idle frames.

---

## 🔵 Missing Features & Polish

### 15. [RESOLVED] No "Fit to Screen" implementation

The HTML has a "Fit Graph to Screen" button ([index.html:76-80](file:///workspaces/litegraph-fp/index.html#L76-L80)) with `id="btn-zoom-fit"`, but there's no event listener wired to it — clicking it does nothing.

---

### 16. No keyboard shortcut for adding nodes

Double-click and right-click both open the node adder, but there's no keyboard shortcut (e.g., `Tab` or `N`) for keyboard-first workflows.

---

### 17. [RESOLVED] DPR (Device Pixel Ratio) not handled for HiDPI displays

The canvas resize at [main.ts:555-559](file:///workspaces/litegraph-fp/src/ui/main.ts#L555-L559) sets `canvas.width = rect.width` without accounting for `window.devicePixelRatio`. On Retina/HiDPI displays, the canvas will render at half resolution and look blurry.

**Fix**:
```typescript
const dpr = window.devicePixelRatio || 1;
canvas.width = rect.width * dpr;
canvas.height = rect.height * dpr;
ctx.scale(dpr, dpr);
```

---

### 18. No edge deletion UX

Users can create edges by dragging between pins, but there's no way to delete individual edges except via "Disconnect All" from the context menu. There's no way to click on or select a single edge to remove it.

---

## 📦 Open-Source Readiness

### 19. README is minimal

The [README.md](file:///workspaces/litegraph-fp/README.md) has no:
- Screenshot or GIF of the app
- Installation instructions
- Development setup guide
- Architecture diagram
- Contributing guidelines
- Keyboard shortcut reference

For an open-source project, this is the front door.

---

### 20. [RESOLVED] No `.editorconfig` or formatting configuration

No Prettier, ESLint, or `.editorconfig` is set up. Contributors will inevitably introduce inconsistent formatting.

---

### 21. `.DS_Store` committed to repo

[.DS_Store](file:///workspaces/litegraph-fp/.DS_Store) is a macOS artifact that shouldn't be in version control. It's not in `.gitignore`.

---

## Summary: Priority Actions

| Priority | Item | Effort | Status |
|----------|------|--------|--------|
| 🔴 High | #1 Dispatcher recreation | Small | ✅ Resolved |
| 🔴 High | #2 Duplicate constants | Small | ✅ Resolved |
| 🔴 High | #6 Unregistered nodes | Small | ✅ Resolved (previously fixed) |
| 🔴 High | #7 `as any` escape | Small | ✅ Resolved (previously fixed) |
| 🟡 Medium | #11 `getComputedStyle` per-frame | Small | ✅ Resolved |
| 🟡 Medium | #8 `main.ts` monolith | Large | ✅ Resolved |
| 🟡 Medium | #10 Vitest script missing | Small | ✅ Resolved |
| 🟡 Medium | #17 HiDPI canvas support | Small | ✅ Resolved |
| 🟢 Low | #5 Dead `drawDraggingConnection` | Small | ✅ Resolved |
| 🟢 Low | #12 Unbounded terminal DOM | Small | ✅ Resolved |
| 🟢 Low | #13 `structuredClone` | Small | ✅ Resolved |
| 🟢 Low | #14 Edge animation repaints | Small | ✅ Resolved |
| 🟢 Low | #4 Stale comments | Small | ✅ Resolved |
| 🔵 Polish | #15 Fit-to-screen button | Medium | ✅ Resolved |
| 🔵 Polish | #19 README enhancement | Medium | ⏳ Pending |
