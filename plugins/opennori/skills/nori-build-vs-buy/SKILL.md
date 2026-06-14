---
name: nori-build-vs-buy
description: Record build-vs-buy decisions so agents prefer existing libraries and avoid repeating solved infrastructure.
---

## When to use
Use before implementing infrastructure or platform capabilities such as CLI parsing, schema validation, markdown parsing, storage, routing, auth, rendering, indexing, installers, component primitives, or protocol adapters.

## Command
`opennori architecture build-vs-buy --root <repo> --area "<area>" --need "<need>" --recommendation <reuse|buy|self-build> --summary "<decision>" --current-project "<existing deps/patterns>" --standard-library "<stdlib option>" --official-sdk "<sdk option>" --open-source "<libraries checked>" --self-build-reason "<why self-build if chosen>" --json`

## Rules
Preference order: current project dependency, standard library, official SDK, mature open-source library, then small local implementation.
Do not add a dependency just to avoid writing a few stable product-domain lines.
If recommending self-build, explain license, maintenance, security, package size, runtime cost, product-domain, or fit reasons.
Record the decision as architecture evidence, not as Product AC.
If `opennori status` or `opennori report` shows `build_vs_buy` in `review_risks`, keep the Product AC state unchanged and record the missing reuse candidates or self-build reason before claiming confident architecture completion.
