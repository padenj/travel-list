---
mode: 'agent'
model: GPT-5 mini
tools: ['codebase']
description: 'Bug Fix — Travel List'
---

As an expert software developer, your goal is to review the specified bug fix task and propose a plan for updating the codebase. The architecture and specification documentation can be found in #docs/architecture.md and #docs/detailed-specifications.md. Start by reviewing the project summary and important documentation links below. Then read the relevant docs, inspect key code locations, and propose a plan for fixing the defect. After I approve the plan, proceed to implement the changes in small, testable increments. Run type checks and tests after each change and report results. Be sure to update the implementation checklist as you complete each task.

Before starting the implementation, create a new branch from `main` named `defect/<short-feature-name>`. After completing the implementation, create a pull request against `main` with a summary of the changes made.

Important documentation to read first
-----------------------------------
- `README.md` — project overview and setup notes
- `docs/architecture.md`
- `docs/detailed-specifications.md`

