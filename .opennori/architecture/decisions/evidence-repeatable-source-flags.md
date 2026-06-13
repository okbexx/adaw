# evidence-repeatable-source-flags Build-vs-Buy Decision

Area: evidence-cli-ergonomics
Need: Preserve multiple reviewable evidence sources on evidence add while using citty command definitions.
Recommendation: self-build
Status: active



## Summary

Keep citty as the command framework and use a narrow command-local repeated-source collector for evidence source flags because citty does not expose repeatable string args.

## Candidates Checked

- Current project: src/cli/commands/evidence/add.ts already uses citty command definitions; src/cli/commands/evidence/source-parsing.ts is limited to translating evidence source flags into EvidenceSource objects.
- Standard library: Node util.parseArgs can expose duplicate tokens, but using it directly here would keep a second command parser path after the citty migration.
- Official SDK: No official SDK applies to OpenNori evidence CLI ergonomics.
- Open source: citty 0.2.2 supports string, boolean, enum, and positional args but not repeatable array args; commander/yargs could support variadic/repeatable options but would replace the confirmed citty baseline rather than solve this local gap.

## Self-build Reason

The local collector is less than a parser framework: it scans exact evidence source flags and preserves multi-source evidence without changing the CLI architecture or adding a second dependency.
