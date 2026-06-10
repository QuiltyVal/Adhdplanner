# Firestore Backup Export

Use this when you need a local JSON backup of the live planner state before risky QA or migration work.

The export script is read-only. It reads `Users/{uid}` and selected subcollections, then writes a local JSON file under ignored `backups/`.

## Requirements

- `FIREBASE_CREDENTIALS` contains the Firebase service account JSON, or pass `--credentials-file /path/to/serviceAccountKey.json`.
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

If the service account is stored as a file instead of an environment JSON string:

```bash
npm run backup:planner -- --userId U2geUdbvWyVRNLWnSZBnftOMSU22 --credentials-file /path/to/serviceAccountKey.json --preflight
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

List local backup files, validate each one, and identify the latest trusted backup without reading Firestore:

```bash
npm run backup:planner -- --list-backups backups --expectUserId U2geUdbvWyVRNLWnSZBnftOMSU22
```

Build a non-mutating restore plan from a generated backup file without reading or writing Firestore:

```bash
npm run backup:planner -- --restore-plan backups/firestore-planner-user.json --expectUserId U2geUdbvWyVRNLWnSZBnftOMSU22
```

Build the same non-mutating restore plan from the latest valid local backup:

```bash
npm run backup:planner -- --restore-latest backups --expectUserId U2geUdbvWyVRNLWnSZBnftOMSU22
```

Compare two local backup files without printing document data:

```bash
npm run backup:planner -- --compare-backups backups/before.json backups/after.json --expectUserId U2geUdbvWyVRNLWnSZBnftOMSU22
```

Check whether the local backup inventory is fresh enough before risky QA or migration work:

```bash
npm run backup:planner -- --safety-check backups --expectUserId U2geUdbvWyVRNLWnSZBnftOMSU22 --maxBackupAgeHours 72
```

Require a minimum backup size and key collections before risky work:

```bash
npm run backup:planner -- --safety-check backups --expectUserId U2geUdbvWyVRNLWnSZBnftOMSU22 --maxBackupAgeHours 72 --minTotalDocs 1000 --requireCollections tasks,plannerEvents,outbox,engineRuns
```

Collection names are intentionally restricted to simple Firestore collection ids (`letters`, `numbers`, `_`, `-`). This prevents an accidental nested path from being exported when the command is typed by hand.

Successful real exports now validate the generated payload before writing, read the saved file back, and print `verified: true` with per-collection document counts, `sizeBytes`, and `fileSha256`. This does not prove semantic correctness of every task, but it catches broken JSON, wrong user ids, schema drift, invalid document paths, and gives you a checksum to record before a backup is trusted.

Every command prints a `safety` object:

- dry-run: `firestoreRead: false`, `firestoreWrite: false`, `localFileWrite: false`
- preflight: `firestoreRead: false`, `firestoreWrite: false`, `localFileWrite: false`, `credentialEnvRead: true`, and `credentialFileRead: true` only when `--credentials-file` was used and readable
- verify-file: `firestoreRead: false`, `firestoreWrite: false`, `localFileRead: true`
- list-backups: `firestoreRead: false`, `firestoreWrite: false`, `localFileRead: true`
- restore-plan: `firestoreRead: false`, `firestoreWrite: false`, `localFileRead: true`, `restorePlanOnly: true`
- restore-latest: `firestoreRead: false`, `firestoreWrite: false`, `localFileRead: true`, `restorePlanOnly: true`
- compare-backups: `firestoreRead: false`, `firestoreWrite: false`, `localFileRead: true`
- safety-check: `firestoreRead: false`, `firestoreWrite: false`, `localFileRead: true`, `readyForRiskyQa: true/false`
- real export: `firestoreRead: true`, `firestoreWrite: false`, `localFileWrite: true`, `verifiedReadback: true`

Preflight output reports only whether required credential fields are present. It does not print `project_id`, `client_email`, `private_key`, the raw `FIREBASE_CREDENTIALS` value, or a credentials file path.

The export command never writes to Firestore.

When taking the first live backup, record the printed `outputPath`, `totalDocs`, and `fileSha256` in the session log before doing risky QA.

When resuming later, run `--list-backups` first. It reports `latest`, `validCount`, `invalidCount`, per-file checksums, and validation issues for broken JSON or wrong-user backups. It only reads local JSON files. If the latest valid backup is the intended recovery point, `--restore-latest` builds the restore review artifact without requiring you to paste the long backup filename.

When you have two local backups, run `--compare-backups before.json after.json` before treating a newer export as the expected recovery point. The comparison validates both files, confirms the same user id, reports root/document hash deltas, and prints only counts plus path previews for added/removed/changed documents. It intentionally does not print document data.

Before risky live QA, migration, or destructive repair work, run `--safety-check`. It validates the local backup inventory, checks the latest valid backup age against `--maxBackupAgeHours` (default: 72), applies optional `--minTotalDocs` and `--requireCollections` gates, and prints `readyForRiskyQa`. A failed safety check means take a fresh read-only export first.

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

This script does not restore data. `--restore-plan` and `--restore-latest` are review artifacts only: they verify a backup file, print the target root path, and list the root user document plus per-collection document counts that a separate restore flow would need to write.

The current restore plan does not delete Firestore documents that are absent from the backup. A real restore apply path must be separate, explicitly confirmed, and reviewed before it writes live data.
