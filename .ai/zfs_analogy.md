# The ZFS Analogy

The graph engine, at its ideal completion, should operate like a filesystem — specifically like ZFS. ZFS is widely considered the most architecturally rigorous filesystem ever designed. Its core properties map almost 1:1 to the properties we want in a graph execution engine.

This document serves as an architectural compass. When facing a design decision, ask: "How would ZFS handle this?"

---

## Property Mapping

### 1. Copy-on-Write (COW) → Immutable State Transitions

**ZFS:** Never overwrites data in place. Writes new data to a new location, then atomically swaps the pointer. The old data remains untouched until explicitly reclaimed.

**Graph Engine:** Never mutates `GraphState` in place. Every user action (add node, move node, connect edge) produces a *new* `GraphState` object. The old one remains untouched. The "current graph" is just a pointer to the latest immutable snapshot.

**What this gives us for free:**
- Atomic transitions (the graph is either fully in state A or fully in state B — never halfway)
- Undo is a pointer swap, not a reversal operation
- Snapshots are essentially free (just keep the old pointer alive)

---

### 2. Snapshots & Clones → Graph History and Forking

**ZFS:** Snapshots are instant and nearly free because of COW. You just freeze the current pointer tree. Clones are writable forks that share all unchanged blocks with the original.

**Graph Engine:** Named snapshots (item #11 in future-improvements) cost almost nothing — just retain a reference to a previous `GraphState`. Graph **cloning/forking** means creating a variant of a graph that shares the majority of its structure via structural sharing, diverging only where changes are made.

**What this gives us for free:**
- Branching workflows ("try this experimental layout without losing the original")
- A/B comparison of two graph variants
- Template graphs that users clone and customize

---

### 3. Checksumming & Self-Healing → Runtime Integrity Validation

**ZFS:** Every data block is checksummed. On read, the checksum is verified. If corruption is detected and redundancy exists, ZFS silently self-heals.

**Graph Engine:** On graph load (from file, network, or snapshot restore), a schema validator (zod, JSON Schema) verifies every node, edge, and parameter conforms to the expected `GraphState` shape. If a node function returns data that violates the expected output schema, the engine flags it as corrupt and quarantines it — similar to how ZFS quarantines a bad block.

**What this gives us for free:**
- Silent rejection of malformed graph imports
- Runtime detection of node functions producing garbage
- Confidence that any `GraphState` the engine holds is structurally valid

---

### 4. Transaction Groups (TXG) → Batched Atomic Mutations

**ZFS:** Individual writes are not committed one at a time. They are batched into Transaction Groups and flushed atomically at regular intervals.

**Graph Engine:** When a user performs a compound operation (e.g., "paste 12 nodes and their 8 connecting edges"), this should not create 20 separate undo entries. It should be a single atomic transaction that produces one new `GraphState`. If any part fails, the entire batch is discarded and the previous state is retained.

**What this gives us for free:**
- Clean undo granularity (one undo = one meaningful user action, not one undo per node)
- Consistency guarantees during complex operations
- Performance (one state swap instead of twenty)

---

### 5. Deduplication & Block Sharing → Structural Sharing in History

**ZFS:** Identical data blocks across snapshots are stored only once. Two snapshots that differ by 1% share 99% of their physical storage.

**Graph Engine:** If the undo stack holds 50 `GraphState` snapshots and 48 of them share 95% of the same nodes, we should not store 50 full copies. Persistent/immutable data structures (like those in Immer.js or hand-rolled structural sharing) allow snapshots to share unchanged subtrees, making deep history essentially free.

**What this gives us for free:**
- Unlimited undo depth without memory explosion
- Efficient diffing between any two snapshots
- Cheap branching (clones share structure with their parent)

---

### 6. Send / Receive → Graph Replication & Collaboration

**ZFS:** `zfs send` serializes a snapshot (or a delta between two snapshots) into a portable byte stream. `zfs receive` applies it to a remote pool. This enables efficient incremental replication.

**Graph Engine:** Serialize a `GraphState` (or a *diff* between two states) and transmit it over WebSocket/network to another instance. The receiving end applies the delta to its local state. This is the foundation for:
- Real-time collaborative editing (multiple users on the same graph)
- Cloud save/sync
- Distributed execution (send the graph to a worker farm, receive results back)

The protobuf serialization layer (item #8 in future-improvements) becomes the equivalent of ZFS's compact binary send stream.

---

### 7. Storage Pools (zpools) → Registry & Engine Composition

**ZFS:** Physical disks are abstracted into logical pools (zpools). Multiple filesystems can share a single pool. The pool manages allocation, redundancy, and performance transparently.

**Graph Engine:** The `NodeRegistry` is a pool of available computational capabilities. Multiple graphs can share the same registry. Multiple evaluation strategies (parallel, serial, JIT-compiled) can operate on the same graph. The pool (registry + evaluator) is an abstraction layer that graphs consume without knowing the internals.

---

## Where the Analogy Diverges

ZFS was written in C — deeply imperative, kernel-level, with manual memory management. It was not built with functional programming in mind. The analogy holds at the *property* level but diverges at the *implementation* level, and that divergence cuts both ways.

### Where FP Exceeds ZFS

| Concern | ZFS | Our Engine |
|---|---|---|
| **Thread safety** | Requires explicit mutexes and locking to prevent concurrent corruption of shared state. A missed lock = data corruption. | Free by default. Immutable data cannot be corrupted. There is nothing to lock because there is nothing to mutate. |
| **COW enforcement** | A discipline enforced by careful C code. A single pointer overwrite in the wrong place violates it silently. | Enforced by the type system (`Readonly<>`). It is structurally impossible to violate, not just conventionally avoided. |
| **Snapshot flexibility** | Snapshots are read-only filesystem states managed by special kernel commands. | Snapshots are just data. They can be transformed, merged, diffed, or fed into pure functions with no special API. |
| **Composability** | Composing two zpools or merging two filesystems is not a supported operation. | Merging two `GraphState` objects is a pure function. Composing two graphs into a larger graph is a data transformation. |

### Where ZFS's Imperative Nature Wins

| Concern | ZFS | Our Engine |
|---|---|---|
| **Memory control** | Direct control over memory layout, cache lines, allocation. Zero-copy I/O. Memory-mapped files. | At the mercy of JavaScript's garbage collector. Every "COW" state transition allocates new objects that create GC pressure. |
| **Write optimization** | COW is carefully tuned to minimize write amplification on physical media. Transaction groups batch I/O for disk throughput. | Our "transactions" are conceptual groupings. We have no equivalent of I/O scheduling or write coalescing. |
| **Raw throughput ceiling** | C code running in kernel space, optimized for the exact hardware. | JavaScript in a VM. The asymptotic CPU limit discussed in the Readability Dial (system_rules.md §2) requires JIT compilation to approach, and even then, JS cannot match bare metal. |

### Where the Analogy Breaks Entirely

- **ZFS manages data at rest.** Our engine manages data *in motion* — flowing through nodes, being transformed at each step. ZFS doesn't "evaluate" its stored data; it just guarantees its integrity.
- **ZFS has a single execution model** (read/write blocks). Our engine has multiple interpretation strategies (serial, parallel, delta, JIT) consuming the same data structure.
- **ZFS's "nodes" (blocks, inodes) are fixed-schema.** Our nodes are user-defined, dynamically registered functions with arbitrary input/output shapes.

The takeaway: **use ZFS as an architectural compass for the data-integrity guarantees** (atomicity, snapshots, checksumming, replication). **Do not try to replicate its imperative implementation patterns.** The FP paradigm gives us some of those guarantees for free and others through different mechanisms entirely.

---

## Status

| ZFS Property | Graph Engine Equivalent | Status |
|---|---|---|
| Copy-on-Write | Immutable `GraphState` | ✅ Built |
| Snapshots | Named checkpoints | 📝 Designed |
| Clones | Graph forking / branching | 📝 New |
| Checksumming | Schema validation on load | 📝 Designed |
| Transaction Groups | Batched atomic mutations | 📝 New |
| Deduplication | Structural sharing in history | 📝 New |
| Send / Receive | Graph delta replication | 📝 New |
| Storage Pools | Registry + Engine composition | ✅ Built |

The goal is not to *be* a filesystem. The goal is to inherit the **guarantees** that made ZFS the gold standard of data integrity — achieving them through functional programming's own strengths rather than imitating ZFS's imperative mechanisms.
