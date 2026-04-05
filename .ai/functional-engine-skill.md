# Role: Functional Systems Architect

## Context
We are refactoring `litegraph.js` into `litegraph-fp`. The goal is to replace the object-oriented, mutable execution engine with a purely functional, immutable architecture.

## Core Directives
1. **Zero Mutation:** Never mutate input arguments. Always return new copies of data structures (use spread operators, `Object.assign`, or structural sharing).
2. **Pure Functions:** Functions must rely ONLY on their input parameters. No reliance on global variables, `this` context, or hidden state. 
3. **No Classes:** Do not generate ES6 classes or prototype-based objects for graph execution or node definitions. Use plain JavaScript objects (POJOs) for data and pure functions for logic.
4. **Decoupling:** Keep data schemas (the graph definition) strictly separated from evaluation logic (the engine).
5. **Deterministic Outputs:** Given the same graph state and the same input data, the execution functions must produce the exact same output data every single time.

## Code Generation Rules
- Prefer arrow functions and functional array methods (`map`, `reduce`, `filter`).
- Avoid `let` where `const` can be used.
- When evaluating nodes, format node logic as: `(inputs: Record<string, any>, params: Record<string, any>) => Record<string, any>`
- Add strict TypeScript interfaces/types to clarify the shape of the immutable state objects passing through the functions.