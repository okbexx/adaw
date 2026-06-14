# setup-capability-bundle-installer Build-vs-Buy Decision

Area: install-distribution
Need: Provide one explicit OpenNori setup entry that installs the Codex Plugin, packaged Skills, global opennori CLI, project .opennori state, and doctor check without making users understand separate plugin/npm/bootstrap paths.
Recommendation: reuse
Status: active



## Summary

Use the official codex plugin marketplace/add commands for Plugin registration, npm global install for the CLI binary, and existing OpenNori lifecycle install/doctor modules for project state. Self-built code is limited to preview/confirm orchestration and command generation.

## Candidates Checked

- Current project: OpenNori already has citty command modules, lifecycle install plans, doctor checks, Plugin package assets, and preview/confirm semantics for project writes.
- Standard library: Node child_process can run confirmed external commands and fs/path can inspect package.json and .opennori state, but Node does not provide Codex Plugin registration or npm package installation semantics.
- Official SDK: Codex exposes codex plugin marketplace add and codex plugin add as the official registration surface; npm/npx provide package execution and global CLI installation instead of postinstall side effects.
- Open source: TK references show plugin/skill bundle distribution and manifest-managed install boundaries; no extra installer framework is needed for this narrow explicit setup orchestration.

## Self-build Reason

Only the OpenNori-specific setup plan schema and preview/confirm orchestration are self-built; plugin registration and CLI installation are delegated to official CLIs.
