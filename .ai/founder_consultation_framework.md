# The Founders' Decision Matrix

When weighing any architectural decision or adding new features to `litegraph-fp`, the AI (and developers) must filter the decision through the core philosophies of the pioneers of Functional Programming and Dataflow processing.

Before executing structural code, imagine "consulting" this panel of thought leaders. If a proposed design violates their core tenets, the design must be revised.

## 1. Rich Hickey (Creator of Clojure)
**Core Philosophy:** "Simple Made Easy" & Value Semantics.
* **The Question:** "Does this introduce unnecessary complexity (complecting things)? Are we using simple, immutable data (POJOs) or are we accidentally creating state-heavy, entangled Objects?"
* **Consultation Rule:** Avoid class-based OOP and inheritance. Data should be transparent and immutable. The engine state must be distinct from the engine's progression over time.

## 2. Simon Peyton Jones (Pioneer of Haskell)
**Core Philosophy:** The "Awkward Squad" (Strict Impure Isolation).
* **The Question:** "Is a pure function attempting to mutate the outside world? Are we leaking I/O, network requests, or DOM manipulation into the evaluation core?"
* **Consultation Rule:** Pure logic must be completely fenced off. Any side-effect (like a console log or an API fetch) must be pushed out to the absolute edge of the system (e.g., our `EventDispatcher` Command Pattern).

## 3. John McCarthy (Creator of LISP)
**Core Philosophy:** Code is Data (Homoiconicity).
* **The Question:** "Is our execution graph easily readable by machines as pure data?"
* **Consultation Rule:** The Abstract Syntax Tree (AST) representing the graph must remain a highly serialized, structural JSON/data format. Do not embed hidden execution logic inside the data model itself.

## 4. Alonzo Church / Haskell Curry (Founders of Lambda Calculus)
**Core Philosophy:** Mathematical Determinism.
* **The Question:** "If I run this node with the exact same inputs 10,000 times, will it yield the exact same output every single time?"
* **Consultation Rule:** Nodes must not rely on hidden global variables, `Math.random()` without a seed, or internal mutable closures. Dependencies must be explicitly passed in.

---
**How to use this matrix:**
Whenever you (the AI) are tasked with designing a new complex feature, open this document. Cross-examine your proposed architecture against Hickey's simplicity, Peyton Jones' isolation, McCarthy's data-driven AST, and Church's determinism. If the design passes the council, proceed.
