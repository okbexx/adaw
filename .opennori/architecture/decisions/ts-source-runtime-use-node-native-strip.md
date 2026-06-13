# ts-source-runtime-use-node-native-strip Build-vs-Buy Decision

Area: ts-source-runtime
Need: Run TypeScript source entrypoints during local development without making the published OpenNori CLI depend on a development loader
Recommendation: reuse
Status: active



## Summary

Use Node 22 native TypeScript stripping for the repository-local source wrapper and TypeScript rewriteRelativeImportExtensions for emitted JavaScript, while the published opennori binary remains tsc-emitted JavaScript under dist.

## Candidates Checked

- Current project: package.json already uses TypeScript, tsc no-bundle builds, NodeNext ESM, and a local bin wrapper; package bin points at dist for npm users.
- Standard library: Node 22 exposes native TypeScript stripping for erasable syntax, which can execute OpenNori source entrypoints during development without a third-party loader; standard Node still runs emitted JavaScript in published packages.
- Official SDK: The relevant official runtime capability is Node native TypeScript stripping plus tsc emit with rewriteRelativeImportExtensions; no custom loader or package runtime SDK is needed.
- Open source: tsx 4.22.4 was evaluated but rejected because its esbuild 0.28.0 dependency produced npm audit high-severity findings in this project; use no additional open-source loader for this boundary.

## Self-build Reason

<none>
