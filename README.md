# litegraph-fp
A headless, purely functional fork of litegraph.js. Build visual graphs anywhere, execute them everywhere.

## Why functional?

Traditional node graphs rely on object instances mutating their own state, making them tightly coupled to their UI and difficult to run headlessly. `litegraph-fp` separates the data from the logic:

* **Immutable State:** Graphs are plain JSON objects.
* **Pure Execution:** Nodes are pure functions. Given the same inputs, they guarantee the same outputs.
* **Extreme Portability:** Zero reliance on the DOM or browser APIs for the core engine. Run your graphs in the browser, on a server, or wire them together across networks.
