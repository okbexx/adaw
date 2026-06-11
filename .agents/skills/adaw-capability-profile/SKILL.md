---
name: adaw-capability-profile
description: Record and report ADAW execution preferences such as required Skills, preferred stacks, avoided tools, and install policy.
---

## When to use
Use when the user says a task must use a Skill, prefers a technology stack, wants to avoid a tool/library, or requires asking before installs.

## Commands
- Add preference: `adaw profile add --root <repo> --type <skill|stack|constraint> --name "<name>" --strength <must|prefer|avoid> --purpose "<why>" --install-policy <existing_only|ask_before_install|allowed> --json`.
- Add compliance evidence: `adaw profile evidence --root <repo> --item <item-id> --result <satisfied|violated|waived> --summary "<evidence>" --json`.
- Show profile: `adaw profile show --root <repo> --json`.

## Rules
Do not turn Skills or stack preferences into user ACs.
`must` and violated `avoid` items block completion unless satisfied or waived.
`prefer` should be reported but should not block completion by itself.
