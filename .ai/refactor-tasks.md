# UI Refactoring Task List
This tracks the status of the UI in-place code cleanup and refactoring.

## 🔴 High Priority
- [x] Extract magic numbers to named constants (`interactions.ts`, `canvas.ts`, `main.ts`)
- [x] Add JSDoc to all exported functions missing documentation
- [x] Remove debug `logToTerminal` calls in mouseup (`interactions.ts`)

## 🟡 Medium Priority
- [x] Extract `findNodeAtPosition()` helper (`interactions.ts`)
- [x] Extract `nextPinName()` helper (`interactions.ts` + `inspector.ts`)
- [x] Extract `resetSelectionState()` helper (`main.ts`)
- [x] Extract `commitPreEditToHistory()` in `inspector.ts`
- [x] Consolidate duplicate `getNodeHeight` (`canvas.ts` vs `state.ts`)
- [x] Remove dead `if (true)` in `canvas.ts`
- [x] Resolve `DESIGN_NOTES.md` bottom padding discrepancy (30px → 45px)

## 🟢 Low Priority
- [x] Extract `saveCamera()` helper (`main.ts`)
- [x] Extract `resetSelectionState()` helper covers syncRenderingContext too (`main.ts`)

## Verification
- [x] Run `npm run build` and compile successfully
- [x] Run unit tests (`npm run test:unit`) - 63 tests pass
- [x] Run integration/E2E test suite (`npm run test:e2e`) - completed successfully
- [ ] Manual browser interaction tests (e.g., node dragging, zooming, using context menus)
