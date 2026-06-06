# Project Context: litegraph-fp

## The Vision
litegraph-fp is an agnostic, long-lasting visual programming engine inspired by the philosophy of AutoCAD.
Just as AutoCAD provides a neutral Cartesian coordinate system that can support civil engineering, architecture, mechanical design, and countless other domains without favoring any of them, this engine provides a fundamentally neutral foundation for visual programming.
Nodes are treated as simple, untyped blank shells that have no inherent meaning until a user assigns behavior to them. Ports are completely flexible and untyped, allowing any output to connect to any input. The engine itself performs no type checking or enforcement, staying maximally permissive so users can freely explore ideas.
The core is built on pure functional principles: graphs are immutable JSON, nodes are pure functions, and execution is predictable and portable. The system is designed from the ground up to support multiple programming languages, so different communities can bring their own tools and logic into the same graph.
The ultimate goal is to create a system flexible enough that it can evolve and remain useful across decades and many different domains, rather than being locked into one language, one paradigm, or one narrow use case.

## Architecture Directives
* **Paradigm:** Purely functional. Zero object-oriented classes for core logic. Closures and factory functions for impure boundaries.
* **State:** The graph is an immutable JSON object/AST (`src/core/ast.ts`).
* **Execution:** Nodes are pure functions. The engine takes a graph state and input data, and returns a *new* frozen state. No mutations.
* **Side-Effects:** Handled via the Command Pattern. Pure nodes return `$commands` arrays, which the engine extracts into a first-class `commands` field on `ExecutionResult`. An impure `createDispatcher()` factory processes them at the boundary.

## Current Architecture

```
src/
├── core/            # Immutable data definitions (AST)
│   └── ast.ts       # GraphState, NodeState, Edge, NodeID
├── engine/          # Pure execution logic
│   ├── types.ts     # EngineConfig, ExecutionState, ExecutionResult
│   ├── topology.ts  # Tiered topological sort (Kahn's algorithm)
│   └── evaluate.ts  # Core graph evaluator with watchdog timeouts
├── registry/        # Node function implementations
│   ├── types.ts     # NodeFunction, NodeRegistry
│   ├── python.ts    # pythonScript helper
│   └── index.ts     # StandardNodes registry (generic/unconfigured shells)
├── events/          # Impure side-effect boundary
│   ├── types.ts     # Command, SideEffectHandler
│   └── dispatcher.ts # createDispatcher factory
└── ui/              # Canvas rendering (placeholder)
    ├── types.ts     # Viewport, RenderingContext
    ├── canvas.ts    # Pure draw instructions
    └── renderer.ts  # createRenderer factory (rAF loop)
```

## Development Environment
* **Runtime/Tooling:** Node.js for development only (via a Docker container). The final output will be environment-agnostic ECMAScript.
* **Language:** Strict TypeScript (`"strict": true`, `"target": "ES2022"`).