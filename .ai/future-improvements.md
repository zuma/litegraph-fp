# Future Improvements & Architectural Enhancements

This document tracks long-term vision features and structural improvements to the `litegraph-fp` engine, specifically focused on balancing strict functional typing with dynamic node flexibility.

### 1. "Wildcard" Node Pins (Generics & `unknown`)
*   **Concept:** Use TypeScript Generics combined with `unknown` for "Pass-through" or utility nodes (like mappings/filters) that don't need rigid data structures.
*   **Workflow:** Internal type checking remains strictly `"strict": true`, but at runtime, the execution context dynamically narrows the type for specific edge connections, preventing rigid bottlenecks on general-purpose nodes.

### 2. Runtime Type Guards (`zod` or Schema Validation)
*   **Concept:** Since TypeScript only exists at compile time, we need runtime safety when users drag cables in the UI. 
*   **Workflow:** Nodes will independently define lightweight schemas (using `zod` or standard JSON Schemas) for what they accept. If mismatched data is executed, the runtime gracefully highlights the error visually rather than crashing the core functional loop.

### 3. Implicit Type Coercion Middleware
*   **Concept:** Adapters that convert common data structures behind the scenes (e.g., passing a boolean into a number input safely converting to `1 / 0`).
*   **Workflow:** Implement optional middleware inside the execution engine. Before evaluating a pure node function, the engine passes the connected data through an adapter. Safe conversions are modified; dangerous conversions are halted and logged.

### 4. Custom User-Defined Types (Plugin Architecture)
*   **Concept:** Allow users deploying our engine to inject entirely custom data objects (like 3D meshes or database records).
*   **Workflow:** Construct the abstract syntax tree with a generic template wrapper (e.g., `Graph<MyCustomTypes>`). This protects the core execution engine from bloat while giving UI designers the freedom to define custom cable systems without breaking pure node evaluation.

### 5. Lazy Evaluation (Demand-Driven Execution)
*   **Concept:** Currently, Kahn's algorithm processes *every* node from the top down. In massive graphs, users might only care about a single "Output" node's final value at a given frame.
*   **Workflow:** Instead of generating execution tiers globally, implement a Depth-First Search (DFS) that walks *backwards* starting only from explicitly requested target nodes. The engine then exclusively crunches the exact slice of the graph needed, ignoring floating dead-ends to save CPU cycles.

### 6. JIT Compilation (Graph-to-Code Transpiler)
*   **Concept:** Dynamic evaluation (mapping over arrays and calling functions at runtime) has inherent JavaScript overhead.
*   **Workflow:** Build a static compiler pass. The engine takes the topological sequence and transpiles it into a single, raw JavaScript string (e.g., `const X = A + B; const Y = X * C; return Y;`). Evaluating this via `new Function()` strips away the engine overhead entirely, achieving C-like bare-metal speed for frozen engine graphs.

### 7. Explicit Feedback Loops (State Memory)
*   **Concept:** Pure topological sorts strictly forbid circular dependencies. However, in Audio DSP and simulation loops, data often needs to feed *backwards* into previous nodes for the *next* execution frame.
*   **Workflow:** Introduce a specialized `DelayEdge` concept in the AST. The topological sorter ignores `DelayEdges` when checking for loops. The execution engine then plucks the values from these edges and pre-loads them into the `initialInputs` dictionary for the *next* tick of the loop, simulating 1-frame memory without violating mathematical topology.

### 8. Protocol Buffers as a Serialization Layer
*   **Concept:** JSON is human-readable but verbose and slow to parse at scale. For high-frequency graph transfers (WebSocket sync, Worker messaging, disk persistence of large graphs), Protocol Buffers (protobuf) offer a compact binary format with strict schema enforcement and significantly faster serialization/deserialization.
*   **Workflow:** Define `.proto` schemas mirroring `GraphState`, `NodeState`, and `Edge`. The inert-data principle (First Principle #2) makes this viable — the graph is already plain structured data with no behavior attached. JSON remains the default for human-readable debugging and small graphs; protobuf becomes an opt-in format for performance-critical paths. Libraries like `protobuf.js` or `buf` provide TypeScript-native codegen.
*   **Trade-off:** Adds a build step (proto compilation) and a dependency. Worth it only when graph sizes or transfer frequency justify the overhead. Start with JSON, migrate hot paths to protobuf when profiling demands it.

---

## Human Interaction Layer

The UI is not just a canvas renderer — it is an entire domain of **human-facing tooling**. Because the graph is inert data (First Principle #2), most of these features are trivially cheap to implement. They are data operations, not complex undo frameworks.

### 9. Undo / Redo (State History Stack)
*   **Concept:** Maintain an array of previous `GraphState` snapshots. "Undo" swaps the current state with the previous one. "Redo" swaps forward. No command-pattern reversal logic needed — just pointer movement over an immutable history.
*   **Design:** A simple `{ past: GraphState[], present: GraphState, future: GraphState[] }` structure. Every user action (add node, move node, connect edge) pushes the current state onto `past` and replaces `present` with the new state. Undo pops from `past`, redo pops from `future`.
*   **Optimization:** For very large graphs, structural sharing (only storing diffs or using persistent data structures) can reduce memory overhead. But start with full snapshots — they're cheap for graphs under 10,000 nodes.

### 10. Graph Persistence (Save / Load / Export)
*   **Concept:** The graph is already a plain object. Persistence is serialization.
*   **Format:** JSON is the natural default — it maps 1:1 to `GraphState` with zero transformation. XML adds verbosity and parsing complexity with no structural benefit for this use case. Protobuf (item #8) becomes the high-performance alternative when needed.
*   **Workflow:** `save()` = `JSON.stringify(graphState)`. `load()` = `JSON.parse(fileContents)` + validation. Export to `.json` files, import from `.json` files. The file *is* the graph. No custom binary formats, no proprietary save logic.
*   **Validation:** On load, run a schema validator (see item #2, zod) to verify the imported file conforms to the `GraphState` interface before the engine touches it.

### 11. Named Snapshots (User Checkpoints)
*   **Concept:** Like undo, but explicitly user-triggered and labeled. "Save this graph state as 'before refactor'" so you can return to it by name, not just by linear history position.
*   **Workflow:** A `Map<string, GraphState>` of named snapshots. The user assigns a label, the current `GraphState` is frozen and stored. Restoring a snapshot replaces the current state and optionally pushes the replaced state onto the undo stack.

### 12. Programmable Custom Script Nodes
*   **Concept:** Like Autodesk Dynamo's "Execute Python" node, allow users to drop a node on the canvas where they can type dynamic Python or JS code directly to map inputs to outputs, providing infinite flexibility without modifying the core TypeScript registry.
*   **Workflow:** For browsers, use a WebAssembly layer like `Pyodide` to instantiate a safe Python interpreter context. For JS, evaluate user strings in an isolated context (like QuickJS). The compiler injects the node `inputs` into the environment as global variables and reads back the `out` variables when the script finishes. Delegated to a future state due to the heavy dependency size and sandboxing requirements involved in ensuring pure-execution security.
