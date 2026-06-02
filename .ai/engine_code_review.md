# Engine Code Review: litegraph-fp

A deep architectural and performance audit of the functional execution engine (`src/engine/` and `src/core/`). Items are grouped by severity.

---

## 🔴 P0 Bugs & Correctness Issues

### 1. [RESOLVED] Synchronous node exceptions bypass the watchdog timer

In [evaluateNode()](file:///workspaces/litegraph-fp/src/engine/evaluate.ts#L65-L127), the engine executes the node logic and races it against a watchdog timer:

```typescript
const executionPromise = nodeDef.execute(resolvedInputs, node.params, controller.signal);
const timeoutMs = config.nodeTimeoutMs ?? 5000;
// ...
const computedOutput = await Promise.race([executionPromise, timeoutPromise]);
```

However, if `nodeDef.execute()` throws an error synchronously (e.g., trying to read a property of an undefined object, or raising a sync exception), it will throw **before** `Promise.race` is called.

* **Impact**: 
  * The stack immediately unwinds out of `evaluateNode()`, bypassing the watchdog configuration entirely.
  * The `finally` block runs next, calling `clearTimeout(timerId!)`. But since the exception was thrown at line 97, `timerId` (declared on line 100) is still uninitialized (`undefined`).
* **Fix**: Wrap the node execution call inside an asynchronous promise context or `Promise.resolve()` so both synchronous throws and asynchronous rejections are channeled cleanly as rejected promises into the watchdog race.
  ```typescript
  const executionPromise = (async () => nodeDef.execute(resolvedInputs, node.params, controller.signal))();
  ```

---

### 2. [RESOLVED] Incompatible Edge Validation silent passes

In [validateGraph()](file:///workspaces/litegraph-fp/src/engine/validation.ts#L44-L70), the validator looks up type definitions of connected pins to verify compatibility:

```typescript
const sourceType = sourceDef.provides[edge.sourcePinId] ?? 'any';
const targetType = targetDef.requires[edge.targetPinId] ?? 'any';
```

If an edge references a pin ID that **does not exist** on the node's definition (e.g. a dangling edge referencing a deleted, renamed, or misspelled pin), the validator defaults the type to `'any'`.

* **Impact**:
  * Since `'any'` is compatible with all types, the validation check passes silently.
  * The engine will proceed to execute the graph, but at runtime, the target input pin will never receive the value, or the source output will never write, leading to silent datapath failures.
* **Fix**: Explicitly check if `edge.sourcePinId` is in `sourceDef.provides` and `edge.targetPinId` is in `targetDef.requires`. Raise a validation error if a pin is referenced but not declared in the registry.

---

## 🟡 Performance & Memory Opportunities

### 3. [RESOLVED] $O(N \times K)$ scaling penalty during input resolution

In [evaluateNode()](file:///workspaces/litegraph-fp/src/engine/evaluate.ts#L78-L83), the engine initializes the node inputs by scanning the keys of `activeState`:

```typescript
Object.keys(activeState).forEach(stateKey => {
    if (stateKey.startsWith(`${nodeId}.`)) {
        const pinName = stateKey.split('.')[1];
        resolvedInputs[pinName] = activeState[stateKey];
    }
});
```

Because `evaluateNode` is called for every node, and `activeState` grows as more node outputs are evaluated, the engine runs `Object.keys(activeState)` $N$ times, leading to an unnecessary $O(N \times K)$ performance penalty.

* **Impact**: In large graphs (e.g., 500+ nodes), compiling the keys array and checking string prefixes on every single node evaluation creates substantial garbage collection pressure and delays execution.
* **Fix**: Instead of scanning all active keys, look up only the specific pins required by the node definition:
  ```typescript
  Object.keys(nodeDef.requires).forEach(pinName => {
      const stateKey = `${nodeId}.${pinName}`;
      if (stateKey in activeState) {
          resolvedInputs[pinName] = activeState[stateKey];
      }
  });
  ```

---

### 4. [RESOLVED] Kahn's Algorithm memory allocations

In [sortTopologically()](file:///workspaces/litegraph-fp/src/engine/topology.ts#L18-L87), `inDegree` and `adjList` are initialized as plain JS objects:

```typescript
const inDegree: Record<NodeID, number> = {};
const adjList: Record<NodeID, NodeID[]> = {};
```

* **Impact**: Dynamic additions and lookup patterns on standard JS objects force V8 to continually transition between hidden classes (Shapes), leading to memory overhead.
* **Fix**: Use a native ES6 `Map<NodeID, number>` and `Map<NodeID, NodeID[]>` for strict, pre-monomorphic key lookup and low-allocation storage.

---

## Summary: Priority Actions

| Priority | Item | Effort | Status |
|----------|------|--------|--------|
| 🔴 P0 | #1 Synchronous node exceptions watchdog bypass | Small | ✅ Resolved |
| 🔴 P0 | #2 Incompatible edge validation silent passes | Small | ✅ Resolved |
| 🟡 P1 | #3 $O(N \times K)$ input resolution scaling | Small | ✅ Resolved |
| 🟢 P2 | #4 Kahn's Algorithm pre-allocation mapping | Small | ✅ Resolved |
