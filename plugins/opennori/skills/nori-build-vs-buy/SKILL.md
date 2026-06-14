---
name: nori-build-vs-buy
description: Record OpenNori build-vs-buy decisions before infrastructure or platform work so agents prefer existing project code, standard libraries, official SDKs, and mature open-source libraries before self-building. Use when implementation touches CLI parsing, schemas, storage, rendering, routing, auth, installers, validators, adapters, UI primitives, or other reusable infrastructure.
---

## Mission

Prevent agents from rebuilding solved infrastructure without evidence, while still allowing small local product-domain code when libraries do not fit.

Build-vs-buy is architecture evidence, not a Product AC.

## Start Here

1. Identify the infrastructure need and why it matters for the current AC.
2. Check in this order: current project dependency, standard library, official SDK, mature open-source library, then small local implementation.
3. Compare license, maintenance, security, package size, runtime cost, performance, integration cost, and product boundary.
4. If self-building, state why reuse options fail.
5. Record the decision before implementing the infrastructure.

Useful state command:

`opennori architecture build-vs-buy --root <repo> --area "<area>" --need "<need>" --recommendation <reuse|buy|self-build> --summary "<decision>" --current-project "<existing deps/patterns>" --standard-library "<stdlib option>" --official-sdk "<sdk option>" --open-source "<libraries checked>" --self-build-reason "<why self-build if chosen>" --json`

## Natural-Language Mapping

- "Can we handwrite this parser/installer/schema/state layer" -> run build-vs-buy first.
- "Use open-source where possible" -> record reuse candidates and the chosen dependency or reason to avoid them.
- "This dependency feels heavy" -> compare package and integration costs before rejecting it.
- "Report shows build_vs_buy risk" -> fill missing reuse candidates or self-build reason without reopening Product AC.

## Acceptable Self-Build Reasons

- License does not fit.
- Maintenance, security, or ecosystem risk is unacceptable.
- Package size, performance, runtime cost, or distribution cost violates product boundaries.
- API shape conflicts with OpenNori's core semantics.
- Integration complexity exceeds a small local implementation.
- The code is product-domain logic that a generic library cannot own.

## State Writes

May write build-vs-buy decision records under `.opennori/architecture/decisions/`. Do not write Product AC, baseline changes, evidence ledger entries, or reports directly.

## Handoffs

- If the decision changes the baseline -> `nori-architecture-challenge`.
- If the user has stack or install preferences -> `nori-capability-profile`.
- If implementation follows the decision -> `nori-architecture-apply`.
- If completion is being judged -> `nori-reporting`.

## User Reply Shape

Use:

```text
Need: ...
Reuse checked: ...
Decision: reuse / buy / self-build
Reason: ...
Risk: ...
```

## Misuse Guards

- Do not self-build because it seems faster, simpler, or familiar without evidence.
- Do not add a dependency only to avoid a few stable product-domain lines.
- Do not make build-vs-buy a user-facing Product AC.
- Do not claim confident architecture completion while required reuse candidates or self-build reasons are missing.
