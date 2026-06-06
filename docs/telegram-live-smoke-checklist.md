# Telegram Live Smoke Checklist

Use this checklist when validating the real Apusbot Telegram client after a deploy.

Production app: `https://planner.valquilty.com`

## Scope

This checks whether Telegram can still act as the daily interface:

1. command discovery
2. Today digest
3. completed-task restore
4. Calendar connect
5. Cemetery prompt/list
6. `Open planner` return buttons

Do not use fake Telegram API calls as the final proof. The pass criteria require screenshots or copied evidence from a real Telegram client.

## Preconditions

- Confirm `planner.valquilty.com` returns HTTP 200.
- Confirm the bot chat is the real Apusbot chat.
- Start with read-only commands before tapping any mutation button.
- Use a disposable QA task only when a mutation is required.
- If anything looks wrong, stop before tapping `Done`, `Return to active`, `Yes, Cemetery`, or any calendar scheduling action.

## Read-Only Smoke

### 1. `/help`

Action:
- Send `/help`.

Expected:
- Bot replies with the command list.
- Reply includes `/today`, `/completed`, `/cemetery`, and `/calendar`.
- Inline keyboard includes `Open planner`.

### 2. `/today`

Action:
- Send `/today`.

Expected:
- Bot shows the current Today/Mission digest or the current priority task list.
- At least one task card, when present, has action buttons.
- Task action keyboard includes `Open planner`.
- This command must not create, complete, or delete tasks.

### 3. `/calendar`

Action:
- Send `/calendar`.

Expected:
- Bot sends the Google Calendar connect prompt.
- Keyboard includes the Google Calendar connect URL.
- Keyboard also includes `Open planner`.
- Do not complete OAuth unless the current test explicitly includes calendar connection.

### 4. `/cemetery`

Action:
- Send `/cemetery`.

Expected:
- Bot lists recent Cemetery/dead tasks, or says there are none.
- Listed task cards include `Return to active` and `Open planner`.
- Do not tap `Return to active` during the read-only pass.

## Controlled Mutation Smoke

Only run this after the read-only smoke passes.

### 5. Completed -> Active -> Completed Cleanup

Action:
- Use a disposable completed QA task if one exists.
- Send `/completed`.
- Tap `Return to active` on exactly that disposable task.

Expected:
- Bot replies that the task is active again.
- Returned task keyboard includes `Done`, `Pin today`, `Critical`, `I'm stuck`, and `Open planner`.
- Cleanup: tap `Done` on the same task, or clean it up through the web UI.

Stop if the bot restores the wrong task.

### 6. Active -> Cemetery Prompt -> Cancel

Action:
- Open a disposable active QA task card in Telegram.
- Tap `Cemetery`.

Expected:
- First tap only shows a confirmation prompt.
- Confirmation keyboard includes `Yes, Cemetery`, `Make smaller`, `Cancel`, and `Open planner`.
- Tap `Cancel` unless this test explicitly uses a disposable task for the full Cemetery move.

Stop if the first `Cemetery` tap moves the task immediately.

## Evidence To Record

For a complete pass, record:

- commit hash and production deployment id;
- `/help` screenshot or copied message;
- `/today` screenshot showing `Open planner`;
- `/calendar` screenshot showing Google Calendar and `Open planner`;
- `/cemetery` screenshot or "empty Cemetery" message;
- optional completed restore screenshot;
- optional Cemetery confirmation/cancel screenshot.

## Pass Criteria

The Telegram live smoke passes when:

- every tested command responds in the real Telegram client;
- `Open planner` appears on every relevant keyboard;
- read-only commands do not mutate tasks;
- mutation tests use only a disposable or intentionally selected task;
- any restored or moved QA task is cleaned up;
- anomalies are logged in `AGENT_LOG.md` before more Telegram feature work.
