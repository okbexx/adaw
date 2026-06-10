# ADAW

Acceptance-Driven Agent Workflow.

ADAW gives coding agents a protocol surface centered on human acceptance criteria and evidence.
The user sees whether the goal is satisfied, why, and what is still missing. The agent can still
plan internally, but progress is determined by acceptance evidence.

## Shape

```text
process/
  acceptance/
    active/
      <goal>.acceptance.md
      <goal>.evidence.json
    completed/
    blocked/
    reports/
    evidence/
  development-protocols/
    adaw.md
```

## Quick Start

```bash
node ./bin/adaw.js brainstorm --idea "Explore a fuzzy goal before acceptance" --root . --json
node ./bin/adaw.js draft --from-brainstorm explore-a-fuzzy-goal-before-acceptance --candidate A --root . --json
node ./bin/adaw.js draft --goal "Ship a user-visible task" --root . --json
node ./bin/adaw.js approve --root . --summary "User approved acceptance criteria." --json
node ./bin/adaw.js init examples/adaw-self.json --root . --json
node ./bin/adaw.js resume --root . --json
node ./bin/adaw.js next --root . --json
node ./bin/adaw.js status --root . --json
node ./bin/adaw.js criterion update --root . --criterion AC-P-1 --user-story "作为用户，我能判断当前验收缺口。" --json
node ./bin/adaw.js evidence add --root . --criterion AC-P-1 --kind test-summary --summary "User can inspect the acceptance contract." --result passing --json
node ./bin/adaw.js profile add --root . --type skill --name design-taste-frontend --strength must --purpose "Use this Skill for the design read and theme token pass." --install-policy existing_only --json
node ./bin/adaw.js profile add --root . --type stack --name radix-ui --strength prefer --purpose "Use accessible primitives for custom components." --install-policy ask_before_install --json
node ./bin/adaw.js profile show --root . --json
node ./bin/adaw.js profile evidence --root . --item skill-design-taste-frontend --result satisfied --summary "Agent used the required Skill before implementation." --json
node ./bin/adaw.js evaluate --root . --json
node ./bin/adaw.js report --root . --json
```

## Development

```bash
npm test
npm run check
```
