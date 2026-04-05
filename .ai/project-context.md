# Project Context: litegraph-fp

## The Vision
This is a ground-up, purely functional rewrite of `litegraph.js`. The goal is to completely decouple the execution engine from the visual canvas to achieve extreme portability (running in browsers, Web Workers, or headless edge/server environments). 

## Architecture Directives
* **Paradigm:** Purely functional. Zero object-oriented classes. 
* **State:** The graph is an immutable JSON object/AST.
* **Execution:** Nodes are pure functions. The engine takes a graph state and input data, and returns a *new* graph state. No mutations.

## Development Environment Setup
* **Runtime/Tooling:** Node.js for development only (via a Docker container). The final output will be environment-agnostic ECMAScript.
* **Language:** Strict TypeScript (`"strict": true`, `"target": "ES2022"`).
* **Linting/Formatting:** ESLint paired with Prettier. Crucially, using `eslint-plugin-functional` to strictly enforce immutability and ban keywords like `let` and `this`. 

## Current Status & Next Steps
1.  The repository is a fresh, blank slate (not a fork containing legacy code).
2.  `package.json` and strict `tsconfig.json` are initialized.
3.  **Immediate Task:** We need to implement the core Execution Engine's topological sorting algorithm in `src/engine.ts`. It must be a pure function that takes the immutable graph schema and returns a flat array of Node IDs representing the correct execution order (pre-calculated on graph modification).