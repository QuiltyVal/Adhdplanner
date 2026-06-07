# Firestore Backup Export

Use this when you need a local JSON backup of the live planner state before risky QA or migration work.

The export script is read-only. It reads `Users/{uid}` and selected subcollections, then writes a local JSON file under ignored `backups/`.

## Requirements

- `FIREBASE_CREDENTIALS` contains the Firebase service account JSON.
- `PLANNER_DEFAULT_USER_ID` is set, or pass `--userId`.
- Do not commit generated backup files.

## Commands

Preview the backup scope without Firebase credentials, without reading Firestore, and without writing a file:

```bash
npm run backup:planner -- --userId U2geUdbvWyVRNLWnSZBnftOMSU22 --dry-run
```

Check that Firebase credentials are present and shaped correctly without reading Firestore and without writing a file:

```bash
npm run backup:planner -- --userId U2geUdbvWyVRNLWnSZBnftOMSU22 --preflight
```

```bash
npm run backup:planner
```

```bash
npm run backup:planner -- --userId U2geUdbvWyVRNLWnSZBnftOMSU22
```

```bash
npm run backup:planner -- --collections tasks,taskSnapshots,plannerEvents,reportItems --maxDocs 500
```

Verify a generated backup file without reading Firestore:

```bash
npm run backup:planner -- --verify-file backups/firestore-planner-user.json --expectUserId U2geUdbvWyVRNLWnSZBnftOMSU22
```

Collection names are intentionally restricted to simple Firestore collection ids (`letters`, `numbers`, `_`, `-`). This prevents an accidental nested path from being exported when the command is typed by hand.

Successful real exports now validate the generated payload before writing, read the saved file back, and print `verified: true` with per-collection document counts, `sizeBytes`, and `fileSha256`. This does not prove semantic correctness of every task, but it catches broken JSON, wrong user ids, schema drift, invalid document paths, and gives you a checksum to record before a backup is trusted.

Every command prints a `safety` object:

- dry-run: `firestoreRead: false`, `firestoreWrite: false`, `localFileWrite: false`
- preflight: `firestoreRead: false`, `firestoreWrite: false`, `localFileWrite: false`, `credentialEnvRead: true`
- verify-file: `firestoreRead: false`, `firestoreWrite: false`, `localFileRead: true`
- real export: `firestoreRead: true`, `firestoreWrite: false`, `localFileWrite: true`, `verifiedReadback: true`

Preflight output reports only whether required credential fields are present. It does not print `project_id`, `client_email`, `private_key`, or the raw `FIREBASE_CREDENTIALS` value.

The export command never writes to Firestore.

When taking the first live backup, record the printed `outputPath`, `totalDocs`, and `fileSha256` in the session log before doing risky QA.

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
