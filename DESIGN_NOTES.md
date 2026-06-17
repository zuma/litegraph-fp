# Design Notes - Litegraph-FP

This document outlines key design decisions, user preferences, and aesthetic constraints for the Litegraph-FP interface.

---

## Grid Layout & Canvas Preferences

### Grid Size (60px × 60px) and Snapping (30px)
* **Configuration**: Visible grid is set via `const gridSize = 60;` in [canvas.ts](file:///workspaces/litegraph-fp/src/ui/canvas.ts#L80). Grid snapping is set to `30px` via `const GRID_SIZE = 30;` in [main.ts](file:///workspaces/litegraph-fp/src/ui/main.ts#L179) (half the visible grid distance).
* **Rationale**: Keep visual grid clear at `60px` but allow higher granularity snapping at `30px` intervals (highly composite numbers, factors of 60).
* **Future Work**: Any future coordinate snaps, grid alignment systems, or node spacing defaults should align to multiples of `30px` or `60px`.

---

## Node Dimension Conventions (Multiples of 3 & 15px / 30px Grid-Aligned Pins)

To achieve compact designs and perfect geometric alignment on the canvas, the node dimensions are designed to align **every input and output pin** exactly on a `15px` / `30px` grid interval when snapped:

* **Node Width (`180px`)**: Multiple of 60 (3 × 60px). Plugs in nicely with the grid columns.
* **Header Height (`30px`)**: Half-grid offset.
* **Row Height (`15px`)**: Spacing between connection points.
* **Pin Radius (`6px`)**: Multiple of 3.
* **Bottom Padding (`45px`)**: 3 × Row Height. Provides room for the parameter preview and ellipsis button.

### Total Node Height Formula
```text
Height = Header Height (30px) + (Max Rows × Row Height (15px)) + Bottom Padding (45px)
       = 75px + (Max Rows × 15px)
```
This formula ensures the bottom edge of every node aligns exactly on a multiple of 15px:
* **1-Row Node**: `30 + 15 + 45 = 90px` (multiple of 30px)
* **2-Row Node**: `30 + 30 + 45 = 105px`
* **3-Row Node**: `30 + 45 + 45 = 120px` (exactly 2 grid cells tall)
* **4-Row Node**: `30 + 60 + 45 = 135px`

### Pin coordinate calculations
Pins are offset vertically by `HEADER_HEIGHT + 30px` (which equals `60px` from the node top). Snapping coordinates align to `30px` intervals, meaning when a node snaps (so `ny` is a multiple of 30), pin Y coordinates are also guaranteed to align cleanly:
```text
Pin Y = ny + 60px + (Pin Index × 15px)
```
* **First Pin**: `ny + 60px` (multiple of 30, and on a visible grid line if `ny` is a multiple of 60)
* **Second Pin**: `ny + 75px` (multiple of 15)
* **Third Pin**: `ny + 90px` (multiple of 30, and on a visible grid line if `ny` is a multiple of 60)
This results in clean geometric alignment—every connecting wire snaps exactly at 15px increments relative to the node, landing on the visible grid intersections or half-grid lines perfectly.

---

## CAD-Style Selection Window (Shift + Drag)

To allow precise, intricate group selections, holding down the `Shift` key while dragging on the empty canvas triggers a selection window:

### 1. Enclosing Selection Window (Left-to-Right Drag)
* **Visual**: Transparent blue fill (`rgba(0, 120, 255, 0.15)`) with a solid blue border (`rgba(0, 120, 255, 0.8)`).
* **Rule**: Only nodes completely enclosed inside the selection boundary are selected.

### 2. Crossing Selection Window (Right-to-Left Drag)
* **Visual**: Transparent emerald/green fill (`rgba(16, 185, 129, 0.15)`) with a dashed green border (`rgba(16, 185, 129, 0.8)`).
* **Rule**: Any node that is completely enclosed or partially intersects/touches the selection boundary is selected.

### 3. Multi-Node Dragging & Deleting
* When multiple nodes are selected, dragging any selected node offsets all other selected nodes by the same relative delta (maintaining their spacing).
* Pressing `Delete` (outside input fields) deletes all selected nodes and prunes all of their associated incoming/outgoing edges. `Backspace` is intentionally excluded to prevent accidental deletions while editing parameter inputs.

### 4. Interactive Cursor States
* **Hovering/Panning**: Custom `grab` cursor indicates the canvas is ready to be panned. Clicking and dragging background transitions dynamically to `grabbing`.
* **Selection Crosshair**: Pressing or holding `Shift` immediately swaps the cursor to a custom **CAD-style crosshair** (`32x32` SVG data URI) complete with a central pickbox and a miniature dotted selection box indicator in the bottom-right quadrant. Hotspot is set to the exact crosshair intersection point `(16, 16)`.


