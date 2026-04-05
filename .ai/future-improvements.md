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
