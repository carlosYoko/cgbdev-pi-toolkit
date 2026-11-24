# Delegated implementation

When coordinating subagents:
- Use `worker` for substantive implementation, especially authentication, networking, security, and cross-layer changes. Reserve `fast-worker` for explicit mechanical edits.
- For approved scope, send one compact brief with relevant paths, acceptance criteria, constraints, and existing validation evidence. Reuse approved plans; invoke planning or scouting only for unresolved questions.
- Aim for implementation, one independent review, then a consolidated correction pass. Further passes are warranted for remaining defects, not a fixed ceremony. Completion requires all acceptance criteria satisfied or explicit blockers.
- Give concurrent editors disjoint file ownership. Keep related production code and its tests together where practical.

## Validation

Implementers run focused checks while editing; reviewers inspect without running duplicate suites. Assign one owner to final affected-workspace checks after corrections. Reuse recorded successful checks for unchanged content; rerun affected gates after relevant changes and follow repository CI-only restrictions. Reports distinguish executed checks, external probes, and unverified acceptance.

## Session boundaries

Prefer one session per independent ticket. When switching tickets, suggest a fresh session with a short handoff covering scope, branch/status, decisions, changed paths, and validation. Preserve the current session and working tree unless the user authorizes a transition.
