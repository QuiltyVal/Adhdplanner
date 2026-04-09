# AGENT_LOG.md

Append-only log for coding-agent handoff.

Purpose:
- give the next agent a compact trail of what happened
- reduce context loss across Codex, Claude, and other agents
- record what was changed, verified, and left risky

Rules:
- add a new entry after every meaningful work session
- newest entry goes at the top
- keep entries short and factual
- do not paste secrets, tokens, or full logs
- if architecture or runtime behavior changed, also update `SESSION_HANDOFF.md`

Entry template:

```md
## YYYY-MM-DD HH:MM Europe/Berlin - Agent name

- Summary: one or two sentences
- Changed:
  - file or system
  - file or system
- Verified:
  - build/test/manual check
- Risks / follow-up:
  - open issue
```

## 2026-04-09 22:35 Europe/Berlin - Codex

- Summary: Made cross-agent logging mandatory by adding a shared work log and wiring it into the repo handoff docs.
- Changed:
  - `AGENT_LOG.md`
  - `AGENTS.md`
  - `CLAUDE.md`
  - `SESSION_HANDOFF.md`
  - `README.md`
- Verified:
  - reviewed updated docs and diff locally
- Risks / follow-up:
  - next coding session should actually append to this log after real code changes

## 2026-04-09 22:10 Europe/Berlin - Codex

- Summary: Added handoff docs so the project can switch between coding agents without restarting from zero.
- Changed:
  - `AGENTS.md`
  - `CLAUDE.md`
  - `SESSION_HANDOFF.md`
  - `README.md`
- Verified:
  - files created and committed in `82f92e0`
- Risks / follow-up:
  - logging was not mandatory yet; add explicit logging contract next
