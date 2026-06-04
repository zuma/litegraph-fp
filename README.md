# litegraph-fp
A headless, purely functional fork of litegraph.js. Build visual graphs anywhere, execute them everywhere.

## Why functional?

Traditional node graphs rely on object instances mutating their own state, making them tightly coupled to their UI and difficult to run headlessly. `litegraph-fp` separates the data from the logic:

* **Immutable State:** Graphs are plain JSON objects.
* **Pure Execution:** Nodes are pure functions. Given the same inputs, they guarantee the same outputs.
* **Extreme Portability:** Zero reliance on the DOM or browser APIs for the core engine. Run your graphs in the browser, on a server, or wire them together across networks.

---

## Setup & Quick Start

### Prerequisites
- **Node.js** (v20 or higher recommended)
- **NPM** (v10 or higher)

### Installation
Clone the repository and install all development dependencies:
```bash
npm install
```
*Note: A `postinstall` script runs automatically to compile the TypeScript codebase into the `./dist` directory.*

### Running the Webapp
Start the development server locally:
```bash
npm run dev
```
Once started, the application UI is available at `http://localhost:3000`.

### Typechecking & Testing
To verify code correctness:
- **Typecheck**: `npm run typecheck` (validates TypeScript types without emitting files)
- **Integration Tests**: `npm test` (validates math pipelines and rogue node watchdog limits)
- **Unit Tests**: `npm run test:unit` (runs Vitest unit suite)

### Dev Container Setup
This project includes a `.devcontainer` configuration. If you are using VS Code or an IDE that supports Dev Containers, opening the project in a container will automatically:
1. Spin up a Node-based bullseye container.
2. Install all npm dependencies.
3. Build the TypeScript compiler assets.
4. Set up port forwarding for `3000`.

