const crypto = require("crypto");
const { getDb, admin } = require("./firebase-admin");

const GOOGLE_OAUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";
const GOOGLE_CALENDAR_TIMEZONE = "Europe/Berlin";
const DEFAULT_GOOGLE_OAUTH_STATE_TTL_MS = 2 * 60 * 60 * 1000;
const GOOGLE_OAUTH_CLOCK_SKEW_MS = 5 * 60 * 1000;

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatWallClockDateTime(date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:00`;
}

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

function getGoogleConfig() {
  return {
    clientId: getRequiredEnv("GOOGLE_CLIENT_ID"),
    clientSecret: getRequiredEnv("GOOGLE_CLIENT_SECRET"),
    redirectUri: getRequiredEnv("GOOGLE_REDIRECT_URI"),
    stateSecret:
      process.env.GOOGLE_OAUTH_STATE_SECRET ||
      process.env.TELEGRAM_CRON_SECRET ||
      getRequiredEnv("GOOGLE_CLIENT_SECRET"),
    encryptionSecret:
      process.env.GOOGLE_TOKEN_ENCRYPTION_SECRET ||
      process.env.TELEGRAM_CRON_SECRET ||
      getRequiredEnv("GOOGLE_CLIENT_SECRET"),
  };
}

function getGoogleOAuthStateTtlMs() {
  const raw = Number.parseInt(process.env.GOOGLE_OAUTH_STATE_TTL_MS || "", 10);
  if (Number.isFinite(raw) && raw >= 60_000 && raw <= 24 * 60 * 60 * 1000) {
    return raw;
  }
  return DEFAULT_GOOGLE_OAUTH_STATE_TTL_MS;
}

function privateDoc(userId) {
  return getDb().collection("PlannerSecrets").doc(userId);
}

function normalizeOAuthUserId(userId) {
  const safeUserId = String(userId || "").trim();
  if (!safeUserId) {
    throw new Error("Google OAuth user id is required");
  }
  if (safeUserId.includes("/")) {
    throw new Error("Google OAuth user id cannot contain '/'.");
  }
  return safeUserId;
}

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (normalized.length % 4 || 4)) % 4;
  return Buffer.from(normalized + "=".repeat(padding), "base64").toString("utf8");
}

function signState(payload) {
  const { stateSecret } = getGoogleConfig();
  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto
    .createHmac("sha256", stateSecret)
    .update(body)
    .digest("hex");
  return `${body}.${signature}`;
}

function verifyState(state, options = {}) {
  const { stateSecret } = getGoogleConfig();
  const [body, signature, ...extraParts] = String(state || "").split(".");
  if (!body || !signature) {
    throw new Error("Invalid OAuth state");
  }
  if (extraParts.length > 0) {
    throw new Error("Invalid OAuth state");
  }

  const expected = crypto.createHmac("sha256", stateSecret).update(body).digest("hex");
  const expectedBytes = Buffer.from(expected, "hex");
  const signatureBytes = Buffer.from(signature, "hex");
  if (
    expectedBytes.length !== signatureBytes.length ||
    !crypto.timingSafeEqual(expectedBytes, signatureBytes)
  ) {
    throw new Error("OAuth state signature mismatch");
  }

  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(body));
  } catch (_error) {
    throw new Error("Invalid OAuth state payload");
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Invalid OAuth state payload");
  }

  const userId = normalizeOAuthUserId(payload.userId);
  const ts = Number(payload.ts);
  if (!Number.isFinite(ts) || ts <= 0) {
    throw new Error("Invalid OAuth state timestamp");
  }

  const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  const ttlMs = Number.isFinite(Number(options.ttlMs)) ? Number(options.ttlMs) : getGoogleOAuthStateTtlMs();
  if (ts > nowMs + GOOGLE_OAUTH_CLOCK_SKEW_MS) {
    throw new Error("OAuth state timestamp is in the future");
  }
  if (nowMs - ts > ttlMs) {
    throw new Error("OAuth state expired");
  }

  return {
    ...payload,
    userId,
    ts,
  };
}

function encryptionKey() {
  const { encryptionSecret } = getGoogleConfig();
  return crypto.createHash("sha256").update(encryptionSecret).digest();
}

function encryptSecret(value) {
  const iv = crypto.randomBytes(12);
  const key = encryptionKey();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: encrypted.toString("base64"),
  };
}

function decryptSecret(payload) {
  if (!payload?.iv || !payload?.tag || !payload?.ciphertext) {
    throw new Error("Encrypted secret payload is incomplete");
  }

  const key = encryptionKey();
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(payload.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

function buildGoogleCalendarConnectUrl(userId, options = {}) {
  const { clientId, redirectUri } = getGoogleConfig();
  const safeUserId = normalizeOAuthUserId(userId);
  const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  const state = signState({
    userId: safeUserId,
    ts: nowMs,
  });
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: GOOGLE_CALENDAR_SCOPE,
    state,
  });
  return `${GOOGLE_OAUTH_BASE}?${params.toString()}`;
}

async function exchangeCodeForTokens(code) {
  const { clientId, clientSecret, redirectUri } = getGoogleConfig();
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Google token exchange failed: ${data.error || response.status}`);
  }

  return data;
}

async function storeGoogleCalendarRefreshToken(userId, refreshToken, metadata = {}) {
  await privateDoc(userId).set(
    {
      googleCalendar: {
        refreshToken: encryptSecret(refreshToken),
        scope: metadata.scope || GOOGLE_CALENDAR_SCOPE,
        tokenType: metadata.tokenType || null,
        connectedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    },
    { merge: true },
  );
}

async function getGoogleCalendarRefreshToken(userId) {
  const snapshot = await privateDoc(userId).get();
  const payload = snapshot.data()?.googleCalendar?.refreshToken;
  if (!payload) return null;
  return decryptSecret(payload);
}

async function hasGoogleCalendarConnection(userId) {
  const snapshot = await privateDoc(userId).get();
  return Boolean(snapshot.data()?.googleCalendar?.refreshToken);
}

async function refreshGoogleAccessToken(refreshToken) {
  const { clientId, clientSecret } = getGoogleConfig();
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Google token refresh failed: ${data.error || response.status}`);
  }

  if (!data.access_token) {
    throw new Error("Google token refresh returned no access token");
  }

  return data.access_token;
}

async function googleCalendarRequest(userId, method, path, body) {
  const refreshToken = await getGoogleCalendarRefreshToken(userId);
  if (!refreshToken) {
    throw new Error("Google Calendar is not connected");
  }

  const accessToken = await refreshGoogleAccessToken(refreshToken);
  const response = await fetch(`${GOOGLE_CALENDAR_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Google Calendar API ${response.status}: ${data.error?.message || "Unknown error"}`);
  }

  return data;
}

async function createCalendarEvent(userId, { title, date, startTime, durationMinutes = 60, description }) {
  const [year, month, day] = String(date || "").split("-").map(Number);
  const [hours, minutes] = String(startTime || "").split(":").map(Number);

  if (![year, month, day, hours, minutes].every((value) => Number.isFinite(value))) {
    throw new Error("Invalid start date/time");
  }

  const startUtc = Date.UTC(year, month - 1, day, hours, minutes);
  const endUtc = startUtc + Number(durationMinutes) * 60000;
  const start = new Date(startUtc);
  const end = new Date(endUtc);

  return googleCalendarRequest(userId, "POST", "/calendars/primary/events", {
    summary: title,
    description: description || "",
    start: {
      dateTime: formatWallClockDateTime(start),
      timeZone: GOOGLE_CALENDAR_TIMEZONE,
    },
    end: {
      dateTime: formatWallClockDateTime(end),
      timeZone: GOOGLE_CALENDAR_TIMEZONE,
    },
  });
}

module.exports = {
  buildGoogleCalendarConnectUrl,
  createCalendarEvent,
  exchangeCodeForTokens,
  getGoogleOAuthStateTtlMs,
  hasGoogleCalendarConnection,
  normalizeOAuthUserId,
  storeGoogleCalendarRefreshToken,
  verifyState,
};
