# cli-command-layer-adopt-citty-for-long-term-typescript-cli Build-vs-Buy Decision

Area: cli-command-layer
Need: Keep the growing OpenNori command surface maintainable with a TypeScript command layer
Recommendation: reuse
Status: active



## Summary

OpenNori uses citty command definitions in TypeScript modules while keeping deterministic JSON output and a thin opennori entrypoint.

## Candidates Checked

- Current project: src/cli/command-tree.ts defines the citty command tree, src/cli/commands/** owns command modules, src/cli.ts is a thin entrypoint, and tests cover command behavior through module calls and the real bin.
- Standard library: Node can expose process.argv but does not provide a maintainable nested command definition model for the growing CLI surface.
- Official SDK: No official OpenNori SDK applies; the relevant ecosystem choice is a mature CLI library.
- Open source: citty 0.2.2 MIT matches the confirmed baseline and is used by modern TypeScript tooling patterns; commander and cac remain fallback candidates only if concrete packaging or nested-command evidence challenges citty.

## Self-build Reason

<none>
