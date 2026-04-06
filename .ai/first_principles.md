# First Principles — Stack-Ranked

The "big rocks" of litegraph-fp. These are ordered by **leverage** — how many downstream design decisions each principle automatically resolves. Getting Principle #1 right makes dozens of later choices obvious. Getting #7 right is still important, but it affects less.

This follows the Pareto structure: principles 1–3 determine roughly 80% of the architecture. Principles 4–7 handle the remaining 20%.

---

## 1. Separate Description from Interpretation

**The single most consequential decision in this project.**

The graph *describes* what to compute. The engine *interprets* that description. The renderer *visualizes* that description. These are three completely independent programs that happen to share one data structure.

**What this resolves automatically:**
- The engine can run without a renderer (headless mode)
- The renderer can display without executing (static preview)
- The graph can be serialized, transferred, stored, diffed, versioned
- AI agents can manipulate the graph as structured data
- Multiple interpreters can coexist (a fast JIT compiler, a debugging step-through evaluator, a distributed worker-based evaluator) — all consuming the same description

**The test:** Can you `JSON.stringify` the entire graph, send it over a WebSocket to a different machine, and execute it there with zero modifications? If yes, description and interpretation are properly separated.

---

## 2. The Graph is Inert Data

A direct consequence of #1 but important enough to state explicitly: the graph object itself must contain **zero behavior**. No methods. No event emitters. No callbacks stored inside nodes. No hidden closures.

The graph is a spreadsheet, not a program. It describes relationships between cells. The formulas live elsewhere (the registry). The calculation engine lives elsewhere (the evaluator). The graph is just the grid.

**What this resolves automatically:**
- Serialization is trivial (it's already JSON)
- Undo/redo is trivial (store previous snapshots of inert data)
- Collaboration is feasible (merge two JSON states)
- Graph validation is a pure function over data
- Testing requires zero mocks — just construct a plain object

**The test:** Can you define an entire graph as a `const` literal with no imports? If yes, the data is truly inert.

---

## 3. Same Inputs → Same Outputs (Determinism)

Every node function, given identical inputs and parameters, must produce identical outputs. Every time. Forever.

This is Alonzo Church's principle, but its practical consequences are enormous:

**What this resolves automatically:**
- **Caching/memoization** — if inputs haven't changed, skip re-evaluation entirely
- **Delta reactivity** — only re-evaluate downstream nodes whose inputs actually changed
- **Parallel execution** — deterministic functions have no race conditions by definition
- **Testing** — no flaky tests, no "works on my machine"
- **Time-travel debugging** — replay any execution from its inputs

**The test:** Run a node 10,000 times with the same inputs. If any output differs, the node is impure and must be redesigned or explicitly quarantined as an effect.

**The tension:** Some nodes genuinely need randomness (noise generators), time (animation), or external state (API calls). These don't violate the principle — they just require that the source of non-determinism be passed in as an explicit input (a seed, a timestamp, a fetched value) rather than accessed via hidden global state.

---

## 4. Effects are Data, Not Actions

Pure nodes never *do* things. They never log, fetch, write, or mutate. Instead, they *return descriptions of things they'd like done* — the `$commands` array.

This is the Haskell/Elm insight: side effects described as data can be inspected, filtered, batched, replayed, and tested. Side effects executed inline are invisible and uncontrollable.

**What this resolves automatically:**
- The engine runs identically in Node.js, a browser, a Web Worker, or a test harness
- Side-effect handlers can be swapped per environment (real fetch vs. mock fetch)
- Effect batching and deduplication become possible
- Effects can be logged/audited for debugging

---

## 5. Structure Determines Order

No node manually specifies "run me after node X." The edges in the graph *are* the dependency declarations. The topological sort *derives* the execution order.

**What this resolves automatically:**
- Automatic parallelization (same-tier nodes have no mutual dependencies)
- Automatic cycle detection (topology rejects circular graphs before execution)
- No fragile manual sequencing that breaks when the graph changes
- The execution plan is itself inspectable data (the tier array)

---

## 6. Uniform Node Interface

Every node — from a simple `add` to a complex ML inference — conforms to the same function signature: `(inputs, params, signal?) → outputs`. No special cases. No "this node type works differently."

**What this resolves automatically:**
- Plugin/extension systems are trivial (just register a function)
- Node composition is straightforward (wrap one function in another)
- The engine needs zero special-case logic per node type
- Users can create custom nodes without understanding engine internals

**The tension:** Some nodes (subgraphs, loops, conditional branches) feel like they need special treatment. Resist this. Model them as nodes that receive a *graph description* as an input parameter and invoke the evaluator recursively. The interface stays uniform.

---

## 7. Failure is Data, Not Catastrophe

When a node fails, the failure becomes a value in the output dictionary — not an exception that unwinds the call stack. The engine continues. Sibling nodes complete. The error is surfaced alongside the results, not instead of them.

**What this resolves automatically:**
- Partial results (95 of 100 nodes succeeded? You get 95 outputs.)
- Error visualization (the UI can highlight exactly which node failed and why)
- Resilience under user error (a typo in one node doesn't nuke a 500-node graph)
- Debugging clarity (errors are localized, not a stack trace pointing at `evaluateGraph`)

---

## How to Use This Document

When facing any design decision, find the highest-numbered principle it relates to. If it conflicts with a lower-numbered (higher-leverage) principle, the lower number wins.

Example: "Should we let nodes emit events directly for better performance?"
- This conflicts with #4 (Effects are Data) and #1 (Separate Description from Interpretation).
- Performance is an implementation concern. #4 and #1 are architectural bedrock.
- Answer: No. Return command data. Optimize the dispatch layer instead.
