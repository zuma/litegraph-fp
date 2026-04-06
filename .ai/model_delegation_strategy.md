# AI Model Delegation Strategy

Building a rigorous functional engine like `litegraph-fp` requires intense architectural thought, but a large portion of the actual implementation is highly systematic, repetitive, and well-behaved (especially due to the pure functional paradigm). 

To optimize token usage and cost without sacrificing quality, tasks should be delegated across three tiers of AI models based on their strengths.

## 🥇 Tier 1: Architect / Senior Engineer
**Assigned Models:** Claude 3.5/3.7 Sonnet (Thinking), Claude 3 Opus, Gemini 1.5/3.1 Pro (High)  
**Best for:** Complex algorithmic work, deep architectural constraints, state machines, and tasks that require "seeing the whole board" at once.

### Tasks:
*   **Incremental Delta Reactivity:** Designing the complex AST traversal function (`evaluateDelta`) that strictly walks topological graphs to selectively recalculate only altered downstream dependencies.
*   **Execution Checkpointing & Hydration:** Designing the immutable data structures that allow the engine to snapshot state at different topological tiers, and successfully hydrate from a checkpoint after a crash or yield.
*   **Control Flow Event Loop:** Designing the core loop that separates pure Dataflow evaluation sweeps from event-driven temporal Control Flow logic (e.g., "Wait 2 seconds, then execute next node").
*   **Core Type Definitions:** Creating the foundational generic type parameters for Nodes, Contexts, and execution results.

## 🥈 Tier 2: Mid-Level Engineer
**Assigned Models:** Gemini 1.5/3.1 Pro (Low), GPT-OSS 120B  
**Best for:** Standard implementation of known design patterns, extending isolated subsystems, and writing boilerplate infrastructure based on Senior specs.

### Tasks:
*   **Pluggable Middleware Hook Array:** Building the `beforeNodeExecute` and `afterNodeExecute` dispatcher pipeline. It's a standard execution pattern that mid-tier models can easily assemble if told what to do.
*   **Web Worker & Thread Pool Scaffolding:** Setting up the underlying boilerplate for `navigator.hardwareConcurrency`, Web Worker initialization, and `SharedArrayBuffer` memory management.
*   **Engine-to-UI Bindings:** Connecting the structured execution results of the AST back into visual or DOM rendering logic (`src/ui/` components).

## 🥉 Tier 3: Junior Engineer
**Assigned Models:** Gemini Flash, Claude Haiku  
**Best for:** Highly isolated, strictly defined, repetitive, or simple refactoring. Let Flash do the typing, but provide it the exact pattern.

### Tasks:
*   **Porting Legacy Nodes:** Transpiling the legacy LiteGraph.js basic nodes (Math operations, String parsers, basic UI elements) into pure, stateless TypeScript functions for `src/registry/`.
*   **Adding "Requires" / "Provides" Metadata:** Going through every node in the AST registry and explicitly mapping out what properties it requires and provides for static analysis.
*   **Refactoring to "FlowFile" Packets:** Applying a strict `{ payload, meta }` packet interface defined by a Senior model across dozens of existing I/O nodes.
*   **Writing Exhaustive Unit Tests:** Generating deterministic unit test coverage for pure functions, topology sorting, and math nodes.
*   **JSDoc & Type Documentation:** Scanning TypeScript files and adding comprehensive JSDoc comments to parameters, returns, and generic types to ensure AI-context-friendly Developer Experience.

---

### 💡 Workflow Tip
Create a strict `.md` specification artifact (e.g., `flowfile_spec.md` or `node_creation_guide.md`) using your Senior models. Once the architecture and base template are rock-solid, feed that exact spec document directly into the system prompt of a Junior model and ask it to apply that spec to 20 different math nodes. You will get production-ready code with minimal token cost.
