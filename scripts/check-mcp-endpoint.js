#!/usr/bin/env node

const DEFAULT_MCP_URL = "https://mcp.valquilty.com/mcp";
const REQUIRED_SCOPE = "mcp:tools";

function getArgValue(name, argv = process.argv) {
  const direct = argv.find((arg) => arg.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);

  const index = argv.indexOf(name);
  if (index >= 0 && argv[index + 1] && !argv[index + 1].startsWith("--")) return argv[index + 1];
  return "";
}

function hasFlag(name, argv = process.argv) {
  return argv.includes(name);
}

function normalizeUrl(value) {
  const url = new URL(String(value || "").trim());
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`Unsupported MCP URL protocol: ${url.protocol}`);
  }
  return url.toString();
}

function parseMcpProbeOptions(argv = process.argv, env = process.env) {
  if (hasFlag("--help", argv)) return { help: true };

  const timeoutMsRaw = getArgValue("--timeoutMs", argv);
  const timeoutMs = timeoutMsRaw ? Number.parseInt(timeoutMsRaw, 10) : 15000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("--timeoutMs must be a positive integer.");
  }

  return {
    help: false,
    url: normalizeUrl(getArgValue("--url", argv) || env.PLANNER_MCP_URL || DEFAULT_MCP_URL),
    requiredScope: getArgValue("--requiredScope", argv) || REQUIRED_SCOPE,
    timeoutMs,
  };
}

function getHelpText() {
  return [
    "Usage:",
    "  npm run check:mcp",
    "  npm run check:mcp -- --url https://mcp.valquilty.com/mcp",
    "",
    "Options:",
    "  --url <mcp-url>",
    "  --requiredScope mcp:tools",
    "  --timeoutMs 15000",
    "",
    "This probe is read-only. It sends no bearer token and does not call MCP tools.",
    "Expected healthy public boundary: HTTP 401 with Bearer auth and OAuth protected-resource metadata.",
  ].join("\n");
}

function splitHeaderParams(rawParams = "") {
  const parts = [];
  let current = "";
  let inQuotes = false;
  let escaped = false;

  for (const char of String(rawParams || "")) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      current += char;
      escaped = true;
      continue;
    }
    if (char === "\"") {
      current += char;
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      if (current.trim()) parts.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
}

function unquoteHeaderValue(value = "") {
  const trimmed = String(value || "").trim();
  if (trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
    return trimmed
      .slice(1, -1)
      .replace(/\\"/g, "\"")
      .replace(/\\\\/g, "\\");
  }
  return trimmed;
}

function parseWwwAuthenticate(header = "") {
  const raw = String(header || "").trim();
  if (!raw) return { scheme: "", params: {} };

  const firstSpace = raw.search(/\s/);
  const scheme = firstSpace >= 0 ? raw.slice(0, firstSpace) : raw;
  const rawParams = firstSpace >= 0 ? raw.slice(firstSpace + 1) : "";
  const params = {};

  for (const part of splitHeaderParams(rawParams)) {
    const equalsIndex = part.indexOf("=");
    if (equalsIndex < 0) continue;
    const key = part.slice(0, equalsIndex).trim();
    if (!key) continue;
    params[key] = unquoteHeaderValue(part.slice(equalsIndex + 1));
  }

  return { scheme, params };
}

function getHeader(headers, name) {
  if (!headers) return "";
  if (typeof headers.get === "function") return headers.get(name) || "";
  const lowerName = String(name || "").toLowerCase();
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === lowerName);
  return entry ? String(entry[1] || "") : "";
}

function scopeList(value = "") {
  return String(value || "")
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function includesScope(value = "", requiredScope = REQUIRED_SCOPE) {
  return scopeList(value).includes(requiredScope);
}

async function fetchWithTimeout(fetchImpl, url, { timeoutMs = 15000, ...options } = {}) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeout = controller
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;

  try {
    return await fetchImpl(url, {
      ...options,
      signal: controller ? controller.signal : options.signal,
    });
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function readJsonResponse(response, label) {
  const text = typeof response.text === "function" ? await response.text() : "";
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} did not return valid JSON: ${error.message}`);
  }
}

function normalizeMetadata(metadata = {}) {
  return {
    resource: String(metadata.resource || ""),
    resourceName: String(metadata.resource_name || ""),
    authorizationServers: Array.isArray(metadata.authorization_servers)
      ? metadata.authorization_servers.map((item) => String(item))
      : [],
    scopesSupported: Array.isArray(metadata.scopes_supported)
      ? metadata.scopes_supported.map((item) => String(item))
      : [],
  };
}

async function probeMcpEndpoint({
  url = DEFAULT_MCP_URL,
  fetchImpl = globalThis.fetch,
  requiredScope = REQUIRED_SCOPE,
  timeoutMs = 15000,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("No fetch implementation is available in this Node runtime.");
  }

  const mcpUrl = normalizeUrl(url);
  let boundaryResponse = await fetchWithTimeout(fetchImpl, mcpUrl, {
    method: "HEAD",
    redirect: "manual",
    timeoutMs,
  });

  if (boundaryResponse.status === 405) {
    boundaryResponse = await fetchWithTimeout(fetchImpl, mcpUrl, {
      method: "GET",
      redirect: "manual",
      timeoutMs,
    });
  }

  const authHeader = getHeader(boundaryResponse.headers, "www-authenticate");
  const auth = parseWwwAuthenticate(authHeader);
  const authProtected = boundaryResponse.status === 401 && auth.scheme.toLowerCase() === "bearer";
  const scopeOk = includesScope(auth.params.scope, requiredScope);
  const metadataUrl = auth.params.resource_metadata || "";
  let metadataStatus = 0;
  let metadata = null;
  let metadataOk = false;

  if (metadataUrl) {
    const metadataResponse = await fetchWithTimeout(fetchImpl, metadataUrl, {
      method: "GET",
      redirect: "manual",
      timeoutMs,
    });
    metadataStatus = metadataResponse.status;
    metadata = normalizeMetadata(await readJsonResponse(metadataResponse, "MCP resource metadata"));
    metadataOk = metadataStatus >= 200 &&
      metadataStatus < 300 &&
      metadata.resource === mcpUrl &&
      metadata.scopesSupported.includes(requiredScope);
  }

  return {
    ok: authProtected && scopeOk && (!metadataUrl || metadataOk),
    mcpUrl,
    status: boundaryResponse.status,
    authProtected,
    authScheme: auth.scheme,
    authError: auth.params.error || "",
    authErrorDescription: auth.params.error_description || "",
    requiredScope,
    scopeAdvertised: auth.params.scope || "",
    scopeOk,
    resourceMetadataUrl: metadataUrl,
    resourceMetadataStatus: metadataStatus || null,
    resourceMetadataOk: metadataUrl ? metadataOk : null,
    resourceMetadata: metadata,
    nextAction: metadataOk
      ? "Use a real authenticated MCP client to run the task-list and disposable subtask-write smoke."
      : "Fix the MCP auth/protected-resource boundary before running live MCP write smoke.",
  };
}

async function main() {
  const options = parseMcpProbeOptions();
  if (options.help) {
    console.log(getHelpText());
    return;
  }

  const result = await probeMcpEndpoint(options);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[check:mcp] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_MCP_URL,
  REQUIRED_SCOPE,
  getHelpText,
  includesScope,
  normalizeMetadata,
  normalizeUrl,
  parseMcpProbeOptions,
  parseWwwAuthenticate,
  probeMcpEndpoint,
  scopeList,
  splitHeaderParams,
};
