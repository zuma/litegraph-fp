# LiteGraph-FP Node Catalog & Roadmap

This document serves as the "Table of Contents" for the node ecosystem. It maps out all existing nodes mapped to their functional domains, alongside the planned architecture for future nodes inspired by the original `litegraph.js` engine.

In `litegraph-fp`, every node execution is fundamentally **pure**. Nodes that traditionally execute side effects (like fetching data or logging) will instead return `$commands` payloads.

## 🧮 Math (`core/math`)
*Pure mathematical transforms and trigonometry.*

### ✅ Implemented
- **add:** `(a, b) => out`
- **subtract:** `(a, b) => out`
- **multiply:** `(a, b) => out`
- **divide:** `(a, b) => out` (Zero-division safe)
- **modulo:** `(a, b) => out`
- **sin:** `(a) => out`
- **cos:** `(a) => out`
- **tan:** `(a) => out`
- **abs:** `(a) => out`
- **round:** `(a) => out`

### ⏳ Planned
- **min:** `(a, b) => out`
- **max:** `(a, b) => out`
- **clamp:** `(a, min, max) => out`
- **lerp:** `(a, b, t) => out` (Linear interpolation)
- **pow:** `(a, exponent) => out`
- **sqrt:** `(a) => out`

---

## 🧠 Logic & Flow (`core/logic`)
*Boolean logic, value comparisons, and conditional routing.*

### ✅ Implemented
- **invertBoolean:** `(a) => out` (Logical NOT)

### ⏳ Planned
- **equals:** `(a, b) => out` (Strict equality)
- **greaterThan:** `(a, b) => out`
- **lessThan:** `(a, b) => out`
- **and:** `(a, b) => out`
- **or:** `(a, b) => out`
- **xor:** `(a, b) => out`
- **branch:** `(condition, true_val, false_val) => out` (Ternary data routing)

---

## 📐 Vector Operations (`core/vector`)
*Math operations meant for 2D/3D spacial calculations and graphics representation.*

### ⏳ Planned
- **vec2Pack:** `(x, y) => out`
- **vec2Unpack:** `(vec) => [x, y]`
- **vec3Pack:** `(x, y, z) => out`
- **vec3Unpack:** `(vec) => [x, y, z]`
- **vec2Add:** `(a_vec, b_vec) => out`
- **vec2Distance:** `(a_vec, b_vec) => out`

---

## 📝 Strings (`core/string`)
*Text manipulation primitives.*

### ⏳ Planned
- **toString:** `(val) => out` (Coerce any payload to string)
- **concat:** `(a, b) => out`
- **length:** `(str) => out`
- **split:** `(str, separator) => array_out` 
- **toUpper:** `(str) => out`
- **toLower:** `(str) => out`

---

## 📦 Arrays (`core/array`)
*List manipulation and aggregation.*

### ⏳ Planned
- **packArray:** `(a, b, c, ...) => out` (Packages raw inputs into a sequential array)
- **arrayLength:** `(arr) => out`
- **arrayGet:** `(arr, index) => out`
- **arrayMap:** `(arr, map_fn_id) => out` (Advanced functional operation)

---

## ⚙️ System & I/O (`core/system`)
*Side-effect boundary nodes. Due to pure graph execution, these return functional `$commands` logs rather than executing locally.*

### ⏳ Planned
- **consoleLog:** `(msg) => out` (Yields `$commands: [{ type: 'LOG', payload: msg }]`)
- **fetchJSON:** `(url) => out` (Yields IO command for dispatcher, triggering a graph re-evaluation upon promise resolution)
- **delay:** `(ms, val) => out` (Yields timer command)
- **constant:** `() => out` (Outputs statically defined properties attached to the node parameters)
