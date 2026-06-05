# Firestore Backup Export

Use this when you need a local JSON backup of the live planner state before risky QA or migration work.

The export script is read-only. It reads `Users/{uid}` and selected subcollections, then writes a local JSON file under ignored `backups/`.

## Requirements

- `FIREBASE_CREDENTIALS` contains the Firebase service account JSON.
- `PLANNER_DEFAULT_USER_ID` is set, or pass `--userId`.
- Do not commit generated backup files.

## Commands

```bash
npm run backup:planner
```

```bash
npm run backup:planner -- --userId U2geUdbvWyVRNLWnSZBnftOMSU22
```

```bash
npm run backup:planner -- --collections tasks,taskSnapshots,plannerEvents,reportItems --maxDocs 500
```

## Default Scope

The default export includes:

- root `Users/{uid}` document
- `tasks`
- `taskSnapshots`
- `captures`
- `commitments`
- `plannerEvents`
- `reportItems`
- `outbox`
- `engineRuns`
- `outboxRuns`
- `plannerCommands`
- `telegramLogs`
- `angelDecisions`

## Restore Boundary

This script does not restore data. Restore still goes through the existing snapshot restore flow and confirmation path.
