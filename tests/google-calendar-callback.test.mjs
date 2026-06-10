import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const googleCalendarPath = require.resolve("../api/_lib/google-calendar.js");
const callbackPath = require.resolve("../api/google-calendar-callback.js");
const statusPath = require.resolve("../api/google-calendar-status.js");

function createResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: "",
    redirectStatus: null,
    redirectUrl: "",
    setHeader(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    redirect(statusCode, url) {
      this.redirectStatus = statusCode;
      this.redirectUrl = url;
      return this;
    },
  };
}

function loadCallbackHandlerWithStubs(stubs = {}) {
  const googleCalendar = require(googleCalendarPath);
  const originals = {
    exchangeCodeForTokens: googleCalendar.exchangeCodeForTokens,
    storeGoogleCalendarRefreshToken: googleCalendar.storeGoogleCalendarRefreshToken,
    verifyState: googleCalendar.verifyState,
  };

  Object.assign(googleCalendar, stubs);
  delete require.cache[callbackPath];
  const handler = require(callbackPath);

  return {
    handler,
    restore() {
      Object.assign(googleCalendar, originals);
      delete require.cache[callbackPath];
    },
  };
}

async function withCallbackHandler(stubs, testFn) {
  const loaded = loadCallbackHandlerWithStubs(stubs);
  try {
    await testFn(loaded.handler);
  } finally {
    loaded.restore();
  }
}

function loadStatusHandlerWithStubs(stubs = {}, env = {}) {
  const googleCalendar = require(googleCalendarPath);
  const originals = {
    hasGoogleCalendarConnection: googleCalendar.hasGoogleCalendarConnection,
  };
  const previousPlannerDefaultUserId = process.env.PLANNER_DEFAULT_USER_ID;

  if (Object.hasOwn(env, "PLANNER_DEFAULT_USER_ID")) {
    if (env.PLANNER_DEFAULT_USER_ID === undefined) {
      delete process.env.PLANNER_DEFAULT_USER_ID;
    } else {
      process.env.PLANNER_DEFAULT_USER_ID = env.PLANNER_DEFAULT_USER_ID;
    }
  }

  Object.assign(googleCalendar, stubs);
  delete require.cache[statusPath];
  const handler = require(statusPath);

  return {
    handler,
    restore() {
      Object.assign(googleCalendar, originals);
      if (previousPlannerDefaultUserId === undefined) {
        delete process.env.PLANNER_DEFAULT_USER_ID;
      } else {
        process.env.PLANNER_DEFAULT_USER_ID = previousPlannerDefaultUserId;
      }
      delete require.cache[statusPath];
    },
  };
}

async function withStatusHandler(stubs, env, testFn) {
  const loaded = loadStatusHandlerWithStubs(stubs, env);
  try {
    await testFn(loaded.handler);
  } finally {
    loaded.restore();
  }
}

{
  await withCallbackHandler({}, async (handler) => {
    const res = createResponse();
    await handler({ method: "POST", query: {} }, res);

    assert.equal(res.statusCode, 405);
    assert.equal(res.headers.Allow, "GET");
    assert.equal(res.body, "Method not allowed");
  });
}

{
  await withCallbackHandler({}, async (handler) => {
    const res = createResponse();
    await handler({ method: "GET", query: { error: "access_denied" } }, res);

    assert.equal(res.redirectStatus, 302);
    assert.equal(res.redirectUrl, "https://planner.valquilty.com/?calendar=error&reason=access_denied");
  });
}

{
  await withCallbackHandler({}, async (handler) => {
    const res = createResponse();
    await handler({ method: "GET", query: { code: "code-only" } }, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body, "Missing code or state");
  });
}

{
  let storedRefreshToken = null;
  await withCallbackHandler({
    verifyState(state) {
      assert.equal(state, "state-1");
      return { userId: "user-1" };
    },
    async exchangeCodeForTokens(code) {
      assert.equal(code, "code-1");
      return {
        refresh_token: "refresh-token-1",
        scope: "https://www.googleapis.com/auth/calendar",
        token_type: "Bearer",
      };
    },
    async storeGoogleCalendarRefreshToken(userId, refreshToken, metadata) {
      storedRefreshToken = { userId, refreshToken, metadata };
    },
  }, async (handler) => {
    const res = createResponse();
    await handler({ method: "GET", query: { code: "code-1", state: "state-1" } }, res);

    assert.equal(res.redirectStatus, 302);
    assert.equal(res.redirectUrl, "https://planner.valquilty.com/?calendar=connected");
    assert.deepEqual(storedRefreshToken, {
      userId: "user-1",
      refreshToken: "refresh-token-1",
      metadata: {
        scope: "https://www.googleapis.com/auth/calendar",
        tokenType: "Bearer",
      },
    });
  });
}

{
  let storeCalled = false;
  await withCallbackHandler({
    verifyState() {
      return { userId: "user-1" };
    },
    async exchangeCodeForTokens() {
      return {
        access_token: "access-token-only",
        scope: "https://www.googleapis.com/auth/calendar",
        token_type: "Bearer",
      };
    },
    async storeGoogleCalendarRefreshToken() {
      storeCalled = true;
    },
  }, async (handler) => {
    const res = createResponse();
    await handler({ method: "GET", query: { code: "code-1", state: "state-1" } }, res);

    assert.equal(res.redirectStatus, 302);
    assert.equal(res.redirectUrl, "https://planner.valquilty.com/?calendar=missing_refresh_token");
    assert.equal(storeCalled, false);
  });
}

{
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    await withCallbackHandler({
      verifyState() {
        throw new Error("OAuth state expired");
      },
      async exchangeCodeForTokens() {
        throw new Error("should not exchange after bad state");
      },
      async storeGoogleCalendarRefreshToken() {
        throw new Error("should not store after bad state");
      },
    }, async (handler) => {
      const res = createResponse();
      await handler({ method: "GET", query: { code: "code-1", state: "expired-state" } }, res);

      assert.equal(res.redirectStatus, 302);
      assert.equal(
        res.redirectUrl,
        "https://planner.valquilty.com/?calendar=error&reason=OAuth%20state%20expired",
      );
    });
  } finally {
    console.error = originalConsoleError;
  }
}

{
  await withStatusHandler({}, { PLANNER_DEFAULT_USER_ID: "user-1" }, async (handler) => {
    const res = createResponse();
    await handler({ method: "POST", query: {} }, res);

    assert.equal(res.statusCode, 405);
    assert.equal(res.headers.Allow, "GET");
    assert.deepEqual(res.body, { error: "Method not allowed" });
  });
}

{
  await withStatusHandler({}, { PLANNER_DEFAULT_USER_ID: undefined }, async (handler) => {
    const res = createResponse();
    await handler({ method: "GET", query: {} }, res);

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { error: "PLANNER_DEFAULT_USER_ID is not configured" });
  });
}

{
  await withStatusHandler({
    async hasGoogleCalendarConnection(userId) {
      assert.equal(userId, "user-1");
      return true;
    },
  }, { PLANNER_DEFAULT_USER_ID: "user-1" }, async (handler) => {
    const res = createResponse();
    await handler({ method: "GET", query: {} }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { connected: true });
  });
}

{
  await withStatusHandler({
    async hasGoogleCalendarConnection(userId) {
      assert.equal(userId, "user-1");
      return false;
    },
  }, { PLANNER_DEFAULT_USER_ID: "user-1" }, async (handler) => {
    const res = createResponse();
    await handler({ method: "GET", query: {} }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { connected: false });
  });
}

{
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    await withStatusHandler({
      async hasGoogleCalendarConnection() {
        throw new Error("Firestore unavailable");
      },
    }, { PLANNER_DEFAULT_USER_ID: "user-1" }, async (handler) => {
      const res = createResponse();
      await handler({ method: "GET", query: {} }, res);

      assert.equal(res.statusCode, 500);
      assert.deepEqual(res.body, { error: "Firestore unavailable" });
    });
  } finally {
    console.error = originalConsoleError;
  }
}

console.log("google calendar callback/status tests passed");
