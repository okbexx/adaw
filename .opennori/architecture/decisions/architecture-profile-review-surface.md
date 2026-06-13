# architecture-profile-review-surface Build-vs-Buy Decision

Area: architecture-profile
Need: Expose reviewable Architecture Profile details before baseline confirmation
Recommendation: self-build

## Summary

Reuse OpenNori's existing architecture profile state and CLI JSON surface to expose applies_to, sources, principles, checks, preferred libraries, avoid boundaries, and build-vs-buy policy before baseline confirmation.

## Candidates Checked

- Current project: src/architecture/profile.ts owns built-in and project Architecture Profiles; src/cli/commands/architecture/profile.ts and profiles.ts expose opennori architecture profile review.
- Standard library: Node fs/path are sufficient for reading project-local profile JSON.
- Official SDK: No official SDK applies to OpenNori product-state semantics.
- Open source: Registry/schema libraries would be heavier than needed for this deterministic profile review surface; schema validation can be reconsidered if profile schemas grow.

## Self-build Reason

Architecture Profile review is OpenNori product semantics and should reuse the existing Architecture Baseline domain model without adding a generic registry dependency.
