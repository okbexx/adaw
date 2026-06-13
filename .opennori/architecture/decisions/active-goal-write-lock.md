# active-goal-write-lock Build-vs-Buy Decision

Area: active-goal-state-consistency
Need: Prevent concurrent agent or tool writes from losing OpenNori active-goal evidence ledger updates.
Recommendation: self-build
Status: active



## Summary

Use a small project-local write lock around active-goal mutating CLI commands so read-modify-write operations on .opennori/active are serialized.

## Candidates Checked

- Current project: src/cli/command-tree.ts already centralizes command execution policy, and src/cli/runtime.ts already owns active-goal loading and saving; the lock belongs at this CLI runtime boundary.
- Standard library: Node fs.mkdirSync provides atomic directory creation that works as a local filesystem lock for this single-host project-state use case.
- Official SDK: No official SDK applies to OpenNori local state consistency.
- Open source: proper-lockfile and lockfile-style libraries were considered, but this need is a narrow local single-writer guard around one project-state directory; adding a dependency would increase product surface without improving the acceptance loop.

## Self-build Reason

The implementation is small and uses atomic mkdir plus stale-lock cleanup; it protects the user-visible evidence ledger without introducing a general locking framework.
