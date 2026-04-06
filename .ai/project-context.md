# Project Context: litegraph-fp

## The Vision
This is a ground-up, purely functional rewrite of `litegraph.js`. The goal is to completely decouple the execution engine from the visual canvas to achieve extreme portability (running in browsers, Web Workers, or headless edge/server environments). 

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
│   ├── math.ts      # add, multiply
│   ├── logic.ts     # invertBoolean
│   ├── system.ts    # delaySim, logToConsole
│   └── index.ts     # StandardNodes registry assembly
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