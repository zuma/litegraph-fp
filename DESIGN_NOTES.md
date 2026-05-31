# Design Notes - Litegraph-FP

This document outlines key design decisions, user preferences, and aesthetic constraints for the Litegraph-FP interface.

---

## Grid Layout & Canvas Preferences

### Grid Size (60px × 60px)
* **Configuration**: Set via `const gridSize = 60;` in [canvas.ts](file:///workspaces/litegraph-fp/src/ui/canvas.ts#L80).
* **Rationale**: Changed from `40px` to `60px` based on developer preference for **highly composite numbers** and **multiples of 3**.
* **Future Work**: Any future coordinate snaps, grid alignment systems, or node spacing defaults should align to multiples of `60px` or division factors of 60 (such as `10`, `12`, `15`, `20`, `30`).

---

## Node Dimension Conventions (Multiples of 3)

To maintain a consistent geometric rhythm throughout the application, the HTML5 Canvas node dimensions are designed using highly composite multiples of 3:

* **Node Width (`180px`)**: Highly composite number (divisible by 1, 2, 3, 4, 5, 6, 9, 10, 12, 15, 18, 20, 30, etc.).
* **Header Height (`36px`)**: Multiple of 3, highly composite.
* **Row Height (`24px`)**: Multiple of 3, highly composite.
* **Pin Radius (`6px`)**: Multiple of 3.
* **Bottom Padding (`12px`)**: Multiple of 3, highly composite.

### Total Node Height Formula
```text
Height = Header Height (36px) + (Max Rows × Row Height (24px)) + Bottom Padding (12px)
```
This formula ensures every calculated node height naturally sums to a highly composite multiple of 12 (divisible by 2, 3, 4, 6, 12), ensuring smooth grid alignment:
* **1-Row Node**: `36 + 24 + 12 = 72px`
* **2-Row Node**: `36 + 48 + 12 = 96px`
* **3-Row Node**: `36 + 72 + 12 = 120px` (exactly `2 × 60px` grid cells!)
* **4-Row Node**: `36 + 96 + 12 = 144px`
