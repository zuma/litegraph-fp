# Universal System Rules & Conventions

These rules define the explicit primitives, constraints, and architecture philosophies that **MUST** be followed unconditionally for this project. They dictate how AI systems should parse, write, and audit the application. 

## 1. Filesystem Primitives & AI Sandboxing
* **Strict Filesystem Casing:** ALL generated file and folder names MUST be strictly lowercase with underscores or dashes (e.g., `ai_best_practices.md`). Never use ALL_CAPS, CamelCase, or PascalCase.
* **AI Meta-File Sandboxing:** ANY documentation, instruction files/directives, or meta-files explicitly dealing with AI behavior or global rules must automatically be placed inside the `.ai/` directory. NEVER place them in the project root.
* **Meticulous Audits:** Treat strict file conventions as mission-critical. You must proactively audit naming conventions and folder paths before running any file creation or write commands.

## 2. Modularity & The AI "Goldilocks Zone"
This project is built explicitly to be managed by AI. Code must be perfectly sized for context-window ingestion.
* **Avoid Monoliths:** Files over 500-1000 lines force AI to consume vast amounts of unrelated context.
* **Avoid Over-Fragmentation:** Subdividing tiny concepts (e.g., `add.ts`, `subtract.ts`) exhausts tool bandwidth.
* **Domain-Driven Module Size:** Group concepts cleanly by domain (`src/registry/math.ts`). The optimal sweet spot is **100–300 lines per file**.
* **Visual Banners:** Use highly visible comment banners (e.g. `// ========================== //`) to explicitly categorize code blocks based on their prominence within the file.

## 3. The Pure Functional Architecture (Headless-First)
The engine is a strict, functional mathematical model decoupled completely from any rendering interface.
* **Immutability First:** Use strict Plain Old Javascript Objects (POJOs) and TypeScript `Readonly` interfaces to define state. There are no mutating methods or OOP class instances.
* **Complete UI/DOM Decoupling:** The execution engine (`src/engine`) handles state transition reducers. UI components (`src/ui`) act only as "dumb" subscribers drawing visual representations based on the graph state. Neither domain can crossover.

## 4. Impure Isolation (The Command Pattern)
Deeply embedded core logic functions must *never* execute side effects (API calls, DOM mutations, console logs) directly.
* Pure functions must return their intended side-effects strictly as data payloads inside an array alongside output values. For example: `out: { $commands: [{ type: 'CONSOLE_LOG', payload: '...' }] }`.
* An external, impure `EventDispatcher` runs explicitly *after* evaluation is complete, ingesting commands and firing them securely at the boundary edge of the application.

## 5. Mission-Critical Fault Tolerance (Mars-Grade Resilience)
The engine executes unpredictable dynamic graphs and must prevent single-node failure from cascading into fatal timeouts or deadlocks.
* **Tiered Sandboxing:** Use `Promise.allSettled()` instead of `Promise.all()` to evaluate parallel nodes. If one node hits a syntax error, parallel sibling nodes must continue executing safely gracefully.
* **Watchdog Timeouts:** Nodes cannot be allowed to freeze or hang. Wrap async node execution payloads inside a `Promise.race` against a strict timeout limit. A rogue node must be ruthlessly culled, mapped to an error dictionary, and bypassed.

## 6. Continuous Evolution (The Non-Definitive Mindset)
Frameworks and architectural designs are never truly "complete." 
* **Remain Open-Ended:** Never declare a roadmap, research phase, or codebase as definitively "finished". 
* **Acknowledge the Unknown:** Software engineering is an endless learning process. Always leave room for discovering new paradigms, adapting to unknowns, and continuous iteration. Treat all architectures as living, evolving blueprints.

## 7. The Founders' Consultation
When evaluating a design cross-road or significant architectural decision, the AI must actively consult `.ai/founder_consultation_framework.md`. Decisions must be weighed against the core philosophies of Functional Programming thought leaders (Rich Hickey, Simon Peyton Jones, John McCarthy) to ensure the framework stays rigorously aligned with true FP tenets.

## 8. Code Generation Rules
These micro-rules apply when generating or modifying source code:
* Prefer arrow functions and functional array methods (`map`, `reduce`, `filter`).
* Avoid `let` where `const` can be used.
* Node logic must follow the signature: `(inputs: Record<string, unknown>, params: Record<string, unknown>, signal?: AbortSignal) => Record<string, unknown>`.
* Add strict TypeScript interfaces/types to clarify the shape of immutable state objects passing through the functions.
* Zero reliance on `this` context. Functions must rely ONLY on their explicit input parameters.

