# Google Calendar Live Smoke Checklist

Use this when validating the real Google Calendar OAuth path from Telegram.

This is a live-account smoke. Run it only when the user is available in the real Telegram client and can approve Google OAuth. Do not create a real calendar event unless the current test explicitly includes scheduling.

## Current Status

Already covered repo-side:

- `/calendar` Telegram response includes the Google Calendar connect button and `Open planner`.
- OAuth callback validates state TTL, user id shape, missing code/state, missing refresh token, and non-GET requests.
- `/api/google-calendar-status` handles method guard, missing `PLANNER_DEFAULT_USER_ID`, connected true/false, and backend errors.
- Telegram scheduling executor behavior is covered with mocked Google Calendar functions for disconnected users, connected users missing date/time, and connected successful event creation.

Not yet live-tested:

- completing Google OAuth from the real Telegram button;
- confirming `/api/google-calendar-status` reports `connected: true` after OAuth;
- creating a real Google Calendar event from Telegram.

## Safety Boundaries

- Use a fresh `/calendar` Telegram message. OAuth state links intentionally expire.
- OAuth completion writes or replaces the stored Google Calendar refresh token for the planner user.
- `/api/google-calendar-status` is read-only from the user's perspective, but it checks whether a calendar connection exists in Firestore.
- Do not send a scheduling command that creates a calendar event unless this test explicitly includes event creation.
- If the OAuth flow lands on `calendar=error` or `calendar=missing_refresh_token`, stop and log the URL reason before retrying.

## Preconditions

1. Production responds:

   ```bash
   curl -I -L --max-time 20 https://planner.valquilty.com/main
   ```

2. Telegram `/calendar` renders a fresh Google Calendar connect CTA.
3. The user is signed into the intended Google account in the browser that will open the OAuth link.
4. No old `/calendar` link is reused; send `/calendar` again if more than a few minutes passed.

## Read-Only Baseline

Before OAuth, check the status endpoint:

```bash
curl -sS --max-time 20 https://planner.valquilty.com/api/google-calendar-status
```

Expected outcomes:

- `{"connected":false}` if Google Calendar is not connected yet;
- `{"connected":true}` if the planner already has a stored refresh token;
- a JSON error if required server config is missing.

Record the exact JSON, but do not print or store any Google token values. This endpoint does not return tokens.

## OAuth Smoke

1. In the real Telegram client, send `/calendar`.
2. Tap `Connect Google Calendar`.
3. Complete Google consent for the intended account.
4. Confirm the final browser URL:
   - pass: `https://planner.valquilty.com/?calendar=connected`
   - fail: `calendar=missing_refresh_token`
   - fail: `calendar=error&reason=...`
5. Run the status endpoint again:

   ```bash
   curl -sS --max-time 20 https://planner.valquilty.com/api/google-calendar-status
   ```

Expected pass:

- browser returns to `calendar=connected`;
- status endpoint returns `{"connected":true}`;
- no planner task is created, completed, deleted, or moved during this OAuth-only smoke.

## Optional Event-Creation Smoke

Run this only after OAuth passes and the user explicitly approves creating a disposable calendar event.

Use a clearly disposable event title, for example:

```text
QA Calendar smoke — delete after test
```

Expected:

- Telegram confirms the event creation.
- The event appears in Google Calendar at the intended date/time.
- Cleanup is manual in Google Calendar unless a tested delete-event path exists.

Stop immediately if the bot schedules the wrong title, date, time, or calendar.

## Evidence To Log

For OAuth-only smoke:

- production deployment id or commit hash;
- `/calendar` Telegram screenshot or copied message;
- final browser URL (`calendar=connected` or error reason);
- pre/post `/api/google-calendar-status` JSON;
- confirmation that no task/calendar event mutation was performed beyond OAuth token storage.

For optional event creation:

- exact Telegram scheduling text;
- bot confirmation text;
- screenshot or copied Google Calendar event details;
- cleanup confirmation.

## Pass Criteria

OAuth live smoke passes when:

- a fresh Telegram `/calendar` link opens the real Google consent flow;
- the callback lands on `calendar=connected`;
- `/api/google-calendar-status` returns `connected: true`;
- no task data changes and no calendar event is created during OAuth-only smoke.

Event-creation smoke passes only when the optional disposable event is created with the expected title/date/time and then cleaned up.
