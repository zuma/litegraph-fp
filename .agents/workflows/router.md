---
description: Master router and context initializer for litegraph-fp tasks
---

# Litegraph-FP Initialization Router

Whenever you are asked to execute a major task in this project, you must run this workflow to explicitly fetch the necessary constraints and guidelines BEFORE writing code.

1. **Analyze the Request Domain:** Look at what the user wants to accomplish.
2. **Fetch Sub-Rules:**
   - If the request involves adding or refactoring nodes (in `src/registry`), use your tools to actively read `.ai/system_rules.md` and `.ai/node_catalog.md`.
   - If the request touches core execution logic (`src/engine`), read `.ai/first_principles.md`.
3. **Acknowledge and Execute:** Briefly summarize which rule files you actively fetched, and then proceed with the task.

// turbo-all
