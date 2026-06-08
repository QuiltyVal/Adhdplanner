import { randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { TextEncoder } from "node:util";
import express from "express";
import admin from "firebase-admin";
import { SignJWT, jwtVerify } from "jose";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { InvalidRequestError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import * as z from "zod/v4";
import {
  DEFAULT_CAPTURE_API_URL,
  postPlannerCapture,
  resolveCaptureTimeoutMs,
} from "./capture-client.js";

const encoder = new TextEncoder();
const SESSION_COOKIE_NAME = "adhd_mcp_session";
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
const AUTH_CODE_TTL_MS = 5 * 60 * 1000;
const SUPPORTED_SCOPE = "mcp:tools";
const MCP_SERVER_VERSION = "4.1.0";
const DEFAULT_TASK_HEAT = 35;
const TOUCH_HEAT_BONUS = 12;
const SUBTASK_COMPLETION_CAP = 18;

const config = {
  port: Number.parseInt(process.env.PORT ?? "3000", 10),
  serviceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH ?? "/root/serviceAccountKey.json",
  collectionName: process.env.FIRESTORE_COLLECTION ?? "Users",
  documentId: process.env.FIRESTORE_DOCUMENT_ID ?? process.env.FIRESTORE_USER_ID ?? "",
  tasksField: process.env.FIRESTORE_TASKS_FIELD ?? "tasks",
  publicBaseUrl: new URL(process.env.PUBLIC_BASE_URL ?? "https://mcp.valquilty.com"),
  plannerCaptureApiUrl: new URL(process.env.PLANNER_CAPTURE_API_URL ?? DEFAULT_CAPTURE_API_URL),
  plannerCaptureApiTimeoutMs: resolveCaptureTimeoutMs(process.env.PLANNER_CAPTURE_API_TIMEOUT_MS),
  authSecretsPath: process.env.AUTH_SECRETS_PATH ?? "/root/adhd-mcp/auth-secrets.json",
  oauthClientsPath: process.env.OAUTH_CLIENTS_PATH ?? "/root/adhd-mcp/oauth-clients.json",
};

config.mcpUrl = new URL("/mcp", config.publicBaseUrl);
config.resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(config.mcpUrl);

let authSecrets = JSON.parse(readFileSync(config.authSecretsPath, "utf8"));
const allowedEmail = String(authSecrets.allowedEmail ?? "").trim().toLowerCase();

if (!allowedEmail) {
  throw new Error("auth-secrets.json must contain allowedEmail");
}

if (!config.documentId) {
  throw new Error("FIRESTORE_DOCUMENT_ID or FIRESTORE_USER_ID is required");
}

const authKeys = {
  session: encoder.encode(authSecrets.sessionSecret),
  access: encoder.encode(authSecrets.accessTokenSecret),
  refresh: encoder.encode(authSecrets.refreshTokenSecret),
};

const serviceAccount = JSON.parse(readFileSync(config.serviceAccountPath, "utf8"));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();
const streamableSessions = new Map();

function ensureParentDir(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

function writeJsonFile(filePath, value, mode = 0o600) {
  ensureParentDir(filePath);
  const tempPath = `${filePath}.tmp`;
  writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, { mode });
  renameSync(tempPath, filePath);
}

function normalizeSubtask(subtask) {
  return {
    ...subtask,
    id: typeof subtask?.id === "string" && subtask.id ? subtask.id : randomUUID(),
    text: typeof subtask?.text === "string" ? subtask.text : "",
    completed: Boolean(subtask?.completed),
  };
}

function normalizeTask(task) {
  const heatBase = typeof task?.heatBase === "number" ? task.heatBase : DEFAULT_TASK_HEAT;
  const heatCurrent = typeof task?.heatCurrent === "number" ? task.heatCurrent : heatBase;

  return {
    ...task,
    id: typeof task?.id === "string" && task.id ? task.id : randomUUID(),
    text: typeof task?.text === "string" ? task.text : "",
    status: typeof task?.status === "string" ? task.status : "active",
    urgency: ["low", "medium", "high"].includes(task?.urgency) ? task.urgency : "medium",
    resistance: ["low", "medium", "high"].includes(task?.resistance) ? task.resistance : "medium",
    isToday: Boolean(task?.isToday),
    deadlineAt: typeof task?.deadlineAt === "string" && task.deadlineAt ? task.deadlineAt : "",
    heatBase,
    heatCurrent,
    lastUpdated: typeof task?.lastUpdated === "number" ? task.lastUpdated : Date.now(),
    subtasks: Array.isArray(task?.subtasks) ? task.subtasks.map(normalizeSubtask) : [],
  };
}

function normalizeSubtaskForFingerprint(subtask) {
  return {
    id: typeof subtask?.id === "string" ? subtask.id : "",
    text: typeof subtask?.text === "string" ? subtask.text.trim() : "",
    completed: Boolean(subtask?.completed),
  };
}

function normalizeTaskForFingerprint(task) {
  return {
    id: typeof task?.id === "string" ? task.id : "",
    text: typeof task?.text === "string" ? task.text.trim() : "",
    status: typeof task?.status === "string" ? task.status : "active",
    urgency: ["low", "medium", "high"].includes(task?.urgency) ? task.urgency : "medium",
    resistance: ["low", "medium", "high"].includes(task?.resistance) ? task.resistance : "medium",
    isToday: Boolean(task?.isToday),
    deadlineAt: typeof task?.deadlineAt === "string" ? task.deadlineAt : "",
    subtasks: Array.isArray(task?.subtasks) ? task.subtasks.map(normalizeSubtaskForFingerprint) : [],
  };
}

function buildStateFingerprint(state) {
  return JSON.stringify({
    score: typeof state?.score === "number" ? state.score : 0,
    tasks: Array.isArray(state?.tasks) ? state.tasks.map(normalizeTaskForFingerprint) : [],
  });
}

function hasMeaningfulState(state) {
  return (Array.isArray(state?.tasks) && state.tasks.length > 0) || Number(state?.score || 0) !== 0;
}

function getStateFromData(data) {
  const safeData = data ?? {};

  return {
    data: safeData,
    tasks: Array.isArray(safeData[config.tasksField]) ? safeData[config.tasksField].map(normalizeTask) : [],
    score: typeof safeData.score === "number" ? safeData.score : 0,
  };
}

async function readUserState() {
  const ref = userDocRef();
  const [snapshot, tasksSnapshot] = await Promise.all([
    ref.get(),
    tasksColRef().get(),
  ]);
  const rootState = getStateFromData(snapshot.data());

  return {
    documentExists: snapshot.exists,
    ...rootState,
    tasks: tasksSnapshot.docs.map(doc => normalizeTask(doc.data())),
  };
}

function userDocRef() {
  return db.collection(config.collectionName).doc(config.documentId);
}

function tasksColRef() {
  return userDocRef().collection("tasks");
}

async function mutateUserState(mutator) {
  const ref = userDocRef();
  const current = await readUserState();
  const result = await mutator(current);

  if (result?.commit === false) {
    return { ...current, ...result };
  }

  const nextTasks = Array.isArray(result?.tasks) ? result.tasks.map(normalizeTask) : current.tasks;
  const nextScore = typeof result?.score === "number" ? result.score : current.score;
  const currentFingerprint = buildStateFingerprint(current);
  const nextFingerprint = buildStateFingerprint({ tasks: nextTasks, score: nextScore });
  const batch = db.batch();

  if (currentFingerprint !== nextFingerprint && hasMeaningfulState(current)) {
    const snapshotRef = ref.collection("taskSnapshots").doc();
    batch.set(snapshotRef, {
      source: "mcp",
      kind: "pre_mutation",
      taskCount: current.tasks.length,
      score: current.score,
      fingerprint: currentFingerprint,
      capturedAt: Date.now(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      tasks: current.tasks,
    });
  }

  for (const task of nextTasks) {
    batch.set(tasksColRef().doc(String(task.id)), task);
  }

  const nextTaskIds = new Set(nextTasks.map(task => String(task.id)));
  for (const task of current.tasks) {
    if (!nextTaskIds.has(String(task.id))) {
      batch.delete(tasksColRef().doc(String(task.id)));
    }
  }

  batch.set(ref, {
    score: nextScore,
  }, { merge: true });

  await batch.commit();

  return {
    ...current,
    ...result,
    tasks: nextTasks,
    score: nextScore,
  };
}

function createSubtask(text) {
  return {
    id: randomUUID(),
    text,
    completed: false,
  };
}

function createTask(text, subtasks = []) {
  const now = Date.now();

  return {
    id: randomUUID(),
    text,
    lastUpdated: now,
    heatBase: DEFAULT_TASK_HEAT,
    heatCurrent: DEFAULT_TASK_HEAT,
    status: "active",
    urgency: "medium",
    resistance: "medium",
    isToday: false,
    deadlineAt: "",
    subtasks: subtasks.map(createSubtask),
  };
}

function asTextResult(payload) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}

function asErrorResult(message, extra = {}) {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
    ...extra,
  };
}

function updateHeatForSubtaskChange(task, previousCompletedCount) {
  const subtaskCount = Array.isArray(task.subtasks) ? task.subtasks.length : 0;
  const completedAfter = Array.isArray(task.subtasks)
    ? task.subtasks.filter(subtask => subtask.completed).length
    : 0;
  const completionDelta = completedAfter - previousCompletedCount;
  const subtaskWeight = subtaskCount > 0 ? SUBTASK_COMPLETION_CAP / subtaskCount : 0;
  const currentHeat = typeof task.heatCurrent === "number" ? task.heatCurrent : task.heatBase;
  const nextHeat = Math.min(100, Math.max(0, currentHeat + completionDelta * subtaskWeight));

  return {
    ...task,
    heatBase: nextHeat,
    heatCurrent: nextHeat,
    lastUpdated: Date.now(),
  };
}

function createServer() {
  const server = new McpServer({
    name: "adhd-planner",
    version: MCP_SERVER_VERSION,
  });

  server.registerTool(
    "get_tasks",
    {
      description: "Return the current Firebase-backed task state for the ADHD planner user.",
    },
    async () => {
      const state = await readUserState();
      return asTextResult({
        ok: true,
        documentExists: state.documentExists,
        score: state.score,
        count: state.tasks.length,
        tasks: state.tasks,
      });
    },
  );

  server.registerTool(
    "get_today_tasks",
    {
      description: "Return active tasks that are pinned for today. If no tasks are pinned, return the active list so AI can still help with today's focus.",
    },
    async () => {
      const state = await readUserState();
      const activeTasks = state.tasks.filter(task => task.status === "active");
      const todayTasks = activeTasks.filter(task => task.isToday);

      return asTextResult({
        ok: true,
        count: todayTasks.length > 0 ? todayTasks.length : activeTasks.length,
        fallback_to_active: todayTasks.length === 0,
        tasks: todayTasks.length > 0 ? todayTasks : activeTasks,
      });
    },
  );

  server.registerTool(
    "capture_note",
    {
      description: "Send a raw note/brain dump to the planner capture pipeline through the public captures API. Dry-run is true by default and does not write Firestore.",
      inputSchema: {
        text: z.string().min(1).max(4000).describe("Raw note or brain dump text."),
        dry_run: z.boolean().optional().describe("Defaults to true. Leave true for smoke tests; set false only for an intentional append-only capture write."),
        include_live_tasks: z.boolean().optional().describe("For dry-runs, only set true when live task context is intentionally needed."),
        idempotency_key: z.string().optional().describe("Required when dry_run=false to prevent duplicate capture writes."),
        source_label: z.string().optional().describe("Optional MCP source suffix. Defaults to mcp:tool."),
        active_tasks: z.array(z.object({
          id: z.string().min(1),
          text: z.string().min(1),
          status: z.string().optional(),
          subtasks: z.array(z.object({
            id: z.string().optional(),
            text: z.string().min(1),
            completed: z.boolean().optional(),
          })).optional(),
          is_today: z.boolean().optional(),
          is_vital: z.boolean().optional(),
          urgency: z.string().optional(),
          resistance: z.string().optional(),
          deadline_at: z.string().optional(),
        })).optional().describe("Optional task snapshot for dry-run context without reading live Firestore tasks."),
        self_test: z.object({
          overloadBefore: z.number().int().min(0).max(10),
          overloadAfter: z.number().int().min(0).max(10),
        }).optional().describe("Optional before/after overload self-test values."),
      },
    },
    async ({ text, dry_run, include_live_tasks, idempotency_key, source_label, active_tasks, self_test }) => {
      try {
        const result = await postPlannerCapture({
          captureApiUrl: config.plannerCaptureApiUrl,
          timeoutMs: config.plannerCaptureApiTimeoutMs,
          text,
          dryRun: dry_run !== false,
          includeLiveTasks: include_live_tasks === true,
          activeTasks: active_tasks,
          idempotencyKey: idempotency_key,
          sourceLabel: source_label,
          selfTest: self_test,
        });

        return asTextResult(result);
      } catch (error) {
        return asErrorResult(error.message || "Capture API request failed.");
      }
    },
  );

  server.registerTool(
    "add_task",
    {
      description: "Add a new task. You can include subtasks and optional planner metadata such as urgency, resistance, today pin, and deadline.",
      inputSchema: {
        text: z.string().min(1).describe("Task text."),
        subtasks: z.array(z.string().min(1)).optional().describe("Optional list of subtask texts."),
        urgency: z.enum(["low", "medium", "high"]).optional().describe("Optional urgency level."),
        resistance: z.enum(["low", "medium", "high"]).optional().describe("Optional emotional resistance level."),
        is_today: z.boolean().optional().describe("Whether the task should be pinned for today."),
        deadline_at: z.string().optional().describe("Optional deadline in YYYY-MM-DD format."),
      },
    },
    async ({ text, subtasks, urgency, resistance, is_today, deadline_at }) => {
      const cleanText = text.trim();
      const cleanSubtasks = Array.isArray(subtasks) ? subtasks.map(item => item.trim()).filter(Boolean) : [];
      const task = normalizeTask({
        ...createTask(cleanText, cleanSubtasks),
        urgency,
        resistance,
        isToday: is_today,
        deadlineAt: typeof deadline_at === "string" ? deadline_at.trim() : "",
      });

      const state = await mutateUserState(current => ({
        tasks: [task, ...current.tasks],
        score: current.score,
        task,
      }));

      return asTextResult({
        ok: true,
        message: `Task added: ${cleanText}`,
        score: state.score,
        task: state.task,
      });
    },
  );

  server.registerTool(
    "add_subtask",
    {
      description: "Append a bullet point to an existing task.",
      inputSchema: {
        task_id: z.string().min(1).describe("Task id."),
        text: z.string().min(1).describe("Subtask text."),
      },
    },
    async ({ task_id, text }) => {
      const cleanText = text.trim();
      const state = await mutateUserState(current => {
        const taskIndex = current.tasks.findIndex(task => task.id === task_id);

        if (taskIndex === -1) {
          return { commit: false, error: `Task not found: ${task_id}` };
        }

        const task = current.tasks[taskIndex];
        const subtask = createSubtask(cleanText);
        const updatedTask = {
          ...task,
          subtasks: [...task.subtasks, subtask],
          lastUpdated: Date.now(),
        };
        const tasks = [...current.tasks];
        tasks[taskIndex] = updatedTask;

        return { tasks, score: current.score, task: updatedTask, subtask };
      });

      if (state.error) {
        return asErrorResult(state.error);
      }

      return asTextResult({
        ok: true,
        message: `Subtask added to ${task_id}`,
        score: state.score,
        task: state.task,
        subtask: state.subtask,
      });
    },
  );

  server.registerTool(
    "set_subtask_completed",
    {
      description: "Mark a bullet point complete or incomplete. This also updates heat values the same way the site does.",
      inputSchema: {
        task_id: z.string().min(1).describe("Task id."),
        subtask_id: z.string().min(1).describe("Subtask id."),
        completed: z.boolean().describe("Whether the subtask should be completed."),
      },
    },
    async ({ task_id, subtask_id, completed }) => {
      const state = await mutateUserState(current => {
        const taskIndex = current.tasks.findIndex(task => task.id === task_id);

        if (taskIndex === -1) {
          return { commit: false, error: `Task not found: ${task_id}` };
        }

        const task = current.tasks[taskIndex];
        const previousCompletedCount = task.subtasks.filter(subtask => subtask.completed).length;
        const subtaskIndex = task.subtasks.findIndex(subtask => subtask.id === subtask_id);

        if (subtaskIndex === -1) {
          return { commit: false, error: `Subtask not found: ${subtask_id}` };
        }

        const subtask = task.subtasks[subtaskIndex];

        if (subtask.completed === completed) {
          return {
            commit: false,
            message: `Subtask already ${completed ? "completed" : "incomplete"}: ${subtask_id}`,
            task,
            subtask,
          };
        }

        const updatedSubtasks = task.subtasks.map(item => (
          item.id === subtask_id ? { ...item, completed } : item
        ));
        const updatedTask = updateHeatForSubtaskChange({
          ...task,
          subtasks: updatedSubtasks,
        }, previousCompletedCount);
        const tasks = [...current.tasks];
        tasks[taskIndex] = updatedTask;

        return {
          tasks,
          score: current.score,
          task: updatedTask,
          subtask: updatedTask.subtasks[subtaskIndex],
        };
      });

      if (state.error) {
        return asErrorResult(state.error);
      }

      return asTextResult({
        ok: true,
        message: state.message ?? `Subtask updated: ${subtask_id}`,
        score: state.score,
        task: state.task,
        subtask: state.subtask,
      });
    },
  );

  server.registerTool(
    "toggle_subtask",
    {
      description: "Toggle a bullet point between complete and incomplete.",
      inputSchema: {
        task_id: z.string().min(1).describe("Task id."),
        subtask_id: z.string().min(1).describe("Subtask id."),
      },
    },
    async ({ task_id, subtask_id }) => {
      const state = await mutateUserState(current => {
        const taskIndex = current.tasks.findIndex(task => task.id === task_id);

        if (taskIndex === -1) {
          return { commit: false, error: `Task not found: ${task_id}` };
        }

        const task = current.tasks[taskIndex];
        const previousCompletedCount = task.subtasks.filter(subtask => subtask.completed).length;
        const subtaskIndex = task.subtasks.findIndex(subtask => subtask.id === subtask_id);

        if (subtaskIndex === -1) {
          return { commit: false, error: `Subtask not found: ${subtask_id}` };
        }

        const nextCompleted = !task.subtasks[subtaskIndex].completed;
        const updatedSubtasks = task.subtasks.map(item => (
          item.id === subtask_id ? { ...item, completed: nextCompleted } : item
        ));
        const updatedTask = updateHeatForSubtaskChange({
          ...task,
          subtasks: updatedSubtasks,
        }, previousCompletedCount);
        const tasks = [...current.tasks];
        tasks[taskIndex] = updatedTask;

        return {
          tasks,
          score: current.score,
          task: updatedTask,
          subtask: updatedTask.subtasks[subtaskIndex],
        };
      });

      if (state.error) {
        return asErrorResult(state.error);
      }

      return asTextResult({
        ok: true,
        message: `Subtask toggled: ${subtask_id}`,
        score: state.score,
        task: state.task,
        subtask: state.subtask,
      });
    },
  );

  server.registerTool(
    "touch_task",
    {
      description: "Mirror the app's remembered action and warm up a task.",
      inputSchema: {
        task_id: z.string().min(1).describe("Task id."),
        boost: z.number().min(1).max(100).optional().describe("Optional heat increase amount. Default is 12."),
      },
    },
    async ({ task_id, boost }) => {
      const amount = typeof boost === "number" ? boost : TOUCH_HEAT_BONUS;
      const state = await mutateUserState(current => {
        const taskIndex = current.tasks.findIndex(task => task.id === task_id);

        if (taskIndex === -1) {
          return { commit: false, error: `Task not found: ${task_id}` };
        }

        const task = current.tasks[taskIndex];
        const currentHeat = typeof task.heatCurrent === "number" ? task.heatCurrent : task.heatBase;
        const nextHeat = Math.min(100, currentHeat + amount);
        const updatedTask = {
          ...task,
          heatBase: nextHeat,
          heatCurrent: nextHeat,
          lastUpdated: Date.now(),
        };
        const tasks = [...current.tasks];
        tasks[taskIndex] = updatedTask;

        return { tasks, score: current.score, task: updatedTask };
      });

      if (state.error) {
        return asErrorResult(state.error);
      }

      return asTextResult({
        ok: true,
        message: `Task warmed up: ${task_id}`,
        score: state.score,
        task: state.task,
      });
    },
  );

  server.registerTool(
    "complete_task",
    {
      description: "Mark a task completed. This also updates score the same way the website does for active tasks.",
      inputSchema: {
        task_id: z.string().min(1).describe("Task id."),
      },
    },
    async ({ task_id }) => {
      const state = await mutateUserState(current => {
        const taskIndex = current.tasks.findIndex(task => task.id === task_id);

        if (taskIndex === -1) {
          return { commit: false, error: `Task not found: ${task_id}` };
        }

        const task = current.tasks[taskIndex];

        if (task.status === "completed") {
          return { commit: false, message: `Task already completed: ${task_id}`, task };
        }

        const updatedTask = { ...task, status: "completed", isToday: false };
        const tasks = [...current.tasks];
        tasks[taskIndex] = updatedTask;
        const score = current.score + (task.status === "active" ? 10 : 0);

        return { tasks, score, task: updatedTask };
      });

      if (state.error) {
        return asErrorResult(state.error);
      }

      return asTextResult({
        ok: true,
        message: state.message ?? `Task completed: ${task_id}`,
        score: state.score,
        task: state.task,
      });
    },
  );

  server.registerTool(
    "kill_task",
    {
      description: "Move a task to the cemetery (dead). This mirrors the website's kill action.",
      inputSchema: {
        task_id: z.string().min(1).describe("Task id."),
      },
    },
    async ({ task_id }) => {
      const state = await mutateUserState(current => {
        const taskIndex = current.tasks.findIndex(task => task.id === task_id);

        if (taskIndex === -1) {
          return { commit: false, error: `Task not found: ${task_id}` };
        }

        const task = current.tasks[taskIndex];

        if (task.status === "dead") {
          return { commit: false, message: `Task already dead: ${task_id}`, task };
        }

        const updatedTask = { ...task, status: "dead", isToday: false };
        const tasks = [...current.tasks];
        tasks[taskIndex] = updatedTask;
        const score = current.score + (task.status === "active" ? -5 : 0);

        return { tasks, score, task: updatedTask };
      });

      if (state.error) {
        return asErrorResult(state.error);
      }

      return asTextResult({
        ok: true,
        message: state.message ?? `Task moved to cemetery: ${task_id}`,
        score: state.score,
        task: state.task,
      });
    },
  );

  server.registerTool(
    "resurrect_task",
    {
      description: "Bring a dead task back to active status with fresh heat.",
      inputSchema: {
        task_id: z.string().min(1).describe("Task id."),
      },
    },
    async ({ task_id }) => {
      const state = await mutateUserState(current => {
        const taskIndex = current.tasks.findIndex(task => task.id === task_id);

        if (taskIndex === -1) {
          return { commit: false, error: `Task not found: ${task_id}` };
        }

        const task = current.tasks[taskIndex];

        if (task.status !== "dead") {
          return { commit: false, message: `Task is not dead: ${task_id}`, task };
        }

        const updatedTask = {
          ...task,
          status: "active",
          heatBase: DEFAULT_TASK_HEAT,
          heatCurrent: DEFAULT_TASK_HEAT,
          isToday: false,
          lastUpdated: Date.now(),
        };
        const tasks = [...current.tasks];
        tasks[taskIndex] = updatedTask;
        const score = current.score - 2;

        return { tasks, score, task: updatedTask };
      });

      if (state.error) {
        return asErrorResult(state.error);
      }

      return asTextResult({
        ok: true,
        message: state.message ?? `Task resurrected: ${task_id}`,
        score: state.score,
        task: state.task,
      });
    },
  );

  server.registerTool(
    "set_task_status",
    {
      description: "Set task status directly for active, completed, or dead states.",
      inputSchema: {
        task_id: z.string().min(1).describe("Task id."),
        status: z.enum(["active", "completed", "dead"]).describe("Target task status."),
      },
    },
    async ({ task_id, status }) => {
      const state = await mutateUserState(current => {
        const taskIndex = current.tasks.findIndex(task => task.id === task_id);

        if (taskIndex === -1) {
          return { commit: false, error: `Task not found: ${task_id}` };
        }

        const task = current.tasks[taskIndex];

        if (task.status === status) {
          return { commit: false, message: `Task already in status ${status}: ${task_id}`, task };
        }

        let updatedTask = { ...task, status };
        let score = current.score;

        if (status === "completed" && task.status === "active") {
          score += 10;
        }

        if (status === "dead" && task.status === "active") {
          score -= 5;
        }

        if (status === "active" && task.status === "dead") {
          score -= 2;
          updatedTask = {
            ...updatedTask,
            heatBase: DEFAULT_TASK_HEAT,
            heatCurrent: DEFAULT_TASK_HEAT,
            isToday: false,
            lastUpdated: Date.now(),
          };
        }

        if (status === "completed" || status === "dead") {
          updatedTask = {
            ...updatedTask,
            isToday: false,
          };
        }

        const tasks = [...current.tasks];
        tasks[taskIndex] = updatedTask;

        return { tasks, score, task: updatedTask };
      });

      if (state.error) {
        return asErrorResult(state.error);
      }

      return asTextResult({
        ok: true,
        message: state.message ?? `Task status updated: ${task_id} -> ${status}`,
        score: state.score,
        task: state.task,
      });
    },
  );

  server.registerTool(
    "set_today",
    {
      description: "Pin or unpin a task for today. Pinned tasks are preferred by today's mission logic.",
      inputSchema: {
        task_id: z.string().min(1).describe("Task id."),
        is_today: z.boolean().describe("Whether the task should be pinned for today."),
      },
    },
    async ({ task_id, is_today }) => {
      const state = await mutateUserState(current => {
        const taskIndex = current.tasks.findIndex(task => task.id === task_id);

        if (taskIndex === -1) {
          return { commit: false, error: `Task not found: ${task_id}` };
        }

        const task = current.tasks[taskIndex];
        const updatedTask = {
          ...task,
          isToday: is_today,
          lastUpdated: Date.now(),
        };
        const tasks = [...current.tasks];
        tasks[taskIndex] = updatedTask;

        return { tasks, score: current.score, task: updatedTask };
      });

      if (state.error) {
        return asErrorResult(state.error);
      }

      return asTextResult({
        ok: true,
        message: `Task ${is_today ? "pinned for today" : "removed from today"}: ${task_id}`,
        score: state.score,
        task: state.task,
      });
    },
  );

  server.registerTool(
    "set_urgency",
    {
      description: "Update task urgency to low, medium, or high.",
      inputSchema: {
        task_id: z.string().min(1).describe("Task id."),
        urgency: z.enum(["low", "medium", "high"]).describe("Task urgency."),
      },
    },
    async ({ task_id, urgency }) => {
      const state = await mutateUserState(current => {
        const taskIndex = current.tasks.findIndex(task => task.id === task_id);

        if (taskIndex === -1) {
          return { commit: false, error: `Task not found: ${task_id}` };
        }

        const task = current.tasks[taskIndex];
        const updatedTask = {
          ...task,
          urgency,
          lastUpdated: Date.now(),
        };
        const tasks = [...current.tasks];
        tasks[taskIndex] = updatedTask;

        return { tasks, score: current.score, task: updatedTask };
      });

      if (state.error) {
        return asErrorResult(state.error);
      }

      return asTextResult({
        ok: true,
        message: `Urgency updated: ${task_id} -> ${urgency}`,
        score: state.score,
        task: state.task,
      });
    },
  );

  server.registerTool(
    "set_resistance",
    {
      description: "Update task emotional resistance to low, medium, or high.",
      inputSchema: {
        task_id: z.string().min(1).describe("Task id."),
        resistance: z.enum(["low", "medium", "high"]).describe("Task resistance."),
      },
    },
    async ({ task_id, resistance }) => {
      const state = await mutateUserState(current => {
        const taskIndex = current.tasks.findIndex(task => task.id === task_id);

        if (taskIndex === -1) {
          return { commit: false, error: `Task not found: ${task_id}` };
        }

        const task = current.tasks[taskIndex];
        const updatedTask = {
          ...task,
          resistance,
          lastUpdated: Date.now(),
        };
        const tasks = [...current.tasks];
        tasks[taskIndex] = updatedTask;

        return { tasks, score: current.score, task: updatedTask };
      });

      if (state.error) {
        return asErrorResult(state.error);
      }

      return asTextResult({
        ok: true,
        message: `Resistance updated: ${task_id} -> ${resistance}`,
        score: state.score,
        task: state.task,
      });
    },
  );

  server.registerTool(
    "set_deadline",
    {
      description: "Set or clear a task deadline in YYYY-MM-DD format.",
      inputSchema: {
        task_id: z.string().min(1).describe("Task id."),
        deadline_at: z.string().optional().describe("Deadline in YYYY-MM-DD format. Empty string clears it."),
      },
    },
    async ({ task_id, deadline_at }) => {
      const deadlineValue = typeof deadline_at === "string" ? deadline_at.trim() : "";

      if (deadlineValue && !/^\d{4}-\d{2}-\d{2}$/.test(deadlineValue)) {
        return asErrorResult("deadline_at must be in YYYY-MM-DD format");
      }

      const state = await mutateUserState(current => {
        const taskIndex = current.tasks.findIndex(task => task.id === task_id);

        if (taskIndex === -1) {
          return { commit: false, error: `Task not found: ${task_id}` };
        }

        const task = current.tasks[taskIndex];
        const updatedTask = {
          ...task,
          deadlineAt: deadlineValue,
          lastUpdated: Date.now(),
        };
        const tasks = [...current.tasks];
        tasks[taskIndex] = updatedTask;

        return { tasks, score: current.score, task: updatedTask };
      });

      if (state.error) {
        return asErrorResult(state.error);
      }

      return asTextResult({
        ok: true,
        message: deadlineValue
          ? `Deadline updated: ${task_id} -> ${deadlineValue}`
          : `Deadline cleared: ${task_id}`,
        score: state.score,
        task: state.task,
      });
    },
  );

  server.registerTool(
    "delete_task",
    {
      description: "Delete a task entirely.",
      inputSchema: {
        task_id: z.string().min(1).describe("Task id."),
      },
    },
    async ({ task_id }) => {
      const state = await mutateUserState(current => {
        const tasks = current.tasks.filter(task => task.id !== task_id);

        if (tasks.length === current.tasks.length) {
          return { commit: false, error: `Task not found: ${task_id}` };
        }

        return { tasks, score: current.score };
      });

      if (state.error) {
        return asErrorResult(state.error);
      }

      return asTextResult({
        ok: true,
        message: `Task deleted: ${task_id}`,
        score: state.score,
      });
    },
  );

  return server;
}

class FileClientsStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.clients = new Map();
    this.load();
  }

  load() {
    if (!existsSync(this.filePath)) {
      writeJsonFile(this.filePath, {}, 0o600);
      return;
    }

    const raw = JSON.parse(readFileSync(this.filePath, "utf8"));

    for (const [clientId, clientInfo] of Object.entries(raw)) {
      this.clients.set(clientId, clientInfo);
    }
  }

  persist() {
    writeJsonFile(this.filePath, Object.fromEntries(this.clients.entries()), 0o600);
  }

  async getClient(clientId) {
    return this.clients.get(clientId);
  }

  async registerClient(clientInfo) {
    this.clients.set(clientInfo.client_id, clientInfo);
    this.persist();
    return clientInfo;
  }
}

class LocalPasswordOAuthProvider {
  constructor() {
    this.clientsStore = new FileClientsStore(config.oauthClientsPath);
    this.codes = new Map();
  }

  cleanupCodes() {
    const now = Date.now();

    for (const [code, codeData] of this.codes.entries()) {
      if (now - codeData.createdAt > AUTH_CODE_TTL_MS) {
        this.codes.delete(code);
      }
    }
  }

  validateResource(resource) {
    if (!resource) {
      return config.mcpUrl;
    }

    if (resource.href !== config.mcpUrl.href) {
      throw new InvalidRequestError("Unsupported resource");
    }

    return resource;
  }

  async authorize(client, params, res) {
    this.cleanupCodes();

    const req = res.req;
    const session = await readSession(req);

    if (!session || session.email !== allowedEmail) {
      const returnTo = encodeURIComponent(req.originalUrl || req.url || "/");
      res.redirect(302, `/login?returnTo=${returnTo}`);
      return;
    }

    const resource = this.validateResource(params.resource);
    const code = randomUUID();
    const scopes = [SUPPORTED_SCOPE];

    this.codes.set(code, {
      clientId: client.client_id,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      createdAt: Date.now(),
      state: params.state,
      scopes,
      resource: resource.href,
      email: session.email,
    });

    const redirectUrl = new URL(params.redirectUri);
    redirectUrl.searchParams.set("code", code);
    if (params.state !== undefined) {
      redirectUrl.searchParams.set("state", params.state);
    }
    res.redirect(302, redirectUrl.toString());
  }

  async challengeForAuthorizationCode(client, authorizationCode) {
    this.cleanupCodes();
    const codeData = this.codes.get(authorizationCode);

    if (!codeData || codeData.clientId !== client.client_id) {
      throw new Error("Invalid authorization code");
    }

    return codeData.codeChallenge;
  }

  async exchangeAuthorizationCode(client, authorizationCode, _codeVerifier, redirectUri, resource) {
    this.cleanupCodes();
    const codeData = this.codes.get(authorizationCode);

    if (!codeData || codeData.clientId !== client.client_id) {
      throw new Error("Invalid authorization code");
    }

    if (redirectUri && redirectUri !== codeData.redirectUri) {
      throw new Error("redirect_uri mismatch");
    }

    const resourceUrl = this.validateResource(resource ? new URL(resource) : new URL(codeData.resource));

    this.codes.delete(authorizationCode);

    return issueTokens({
      clientId: client.client_id,
      email: codeData.email,
      scopes: codeData.scopes,
      resource: resourceUrl,
    });
  }

  async exchangeRefreshToken(client, refreshToken, scopes, resource) {
    const refresh = await verifyRefreshToken(refreshToken);

    if (refresh.clientId !== client.client_id) {
      throw new Error("refresh token client mismatch");
    }

    const nextScopes = Array.isArray(scopes) && scopes.length > 0
      ? scopes.filter(scope => refresh.scopes.includes(scope))
      : refresh.scopes;

    if (!nextScopes.includes(SUPPORTED_SCOPE)) {
      throw new Error("refresh token scopes do not allow mcp access");
    }

    const resourceUrl = this.validateResource(resource ? new URL(resource) : refresh.resource);

    return issueTokens({
      clientId: client.client_id,
      email: refresh.email,
      scopes: nextScopes,
      resource: resourceUrl,
    });
  }

  async verifyAccessToken(token) {
    return verifyAccessToken(token);
  }
}

function parseCookies(req) {
  const raw = req.headers.cookie;
  const cookies = {};

  if (!raw) {
    return cookies;
  }

  for (const part of raw.split(";")) {
    const [name, ...valueParts] = part.trim().split("=");

    if (!name) {
      continue;
    }

    cookies[name] = decodeURIComponent(valueParts.join("="));
  }

  return cookies;
}

function normalizeReturnTo(raw) {
  if (typeof raw !== "string" || !raw) {
    return "/";
  }

  try {
    const candidate = new URL(raw, config.publicBaseUrl);

    if (candidate.origin !== config.publicBaseUrl.origin) {
      return "/";
    }

    return `${candidate.pathname}${candidate.search}`;
  } catch {
    return "/";
  }
}

async function createSessionToken(email) {
  return new SignJWT({ email, type: "session" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(config.publicBaseUrl.origin)
    .setAudience("adhd-mcp-session")
    .setSubject(email)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(authKeys.session);
}

async function readSession(req) {
  const token = parseCookies(req)[SESSION_COOKIE_NAME];

  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, authKeys.session, {
      issuer: config.publicBaseUrl.origin,
      audience: "adhd-mcp-session",
    });

    const email = String(payload.email ?? "").trim().toLowerCase();

    if (!email) {
      return null;
    }

    return { email };
  } catch {
    return null;
  }
}

function buildCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];

  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${options.maxAge}`);
  }

  parts.push(`Path=${options.path ?? "/"}`);
  parts.push("HttpOnly");
  parts.push("Secure");
  parts.push(`SameSite=${options.sameSite ?? "Lax"}`);

  if (options.expires) {
    parts.push(`Expires=${options.expires.toUTCString()}`);
  }

  return parts.join("; ");
}

function setSessionCookie(res, token) {
  res.append("Set-Cookie", buildCookie(SESSION_COOKIE_NAME, token, {
    maxAge: 7 * 24 * 60 * 60,
  }));
}

function clearSessionCookie(res) {
  res.append("Set-Cookie", buildCookie(SESSION_COOKIE_NAME, "", {
    maxAge: 0,
    expires: new Date(0),
  }));
}

function verifyPassword(password) {
  const derived = scryptSync(password, authSecrets.passwordSalt, 64).toString("hex");
  return timingSafeEqual(Buffer.from(derived, "hex"), Buffer.from(authSecrets.passwordHash, "hex"));
}

function hashPassword(password, salt = randomUUID()) {
  return {
    passwordSalt: salt,
    passwordHash: scryptSync(password, salt, 64).toString("hex"),
  };
}

function buildAuthSecretsBackupPath(date = new Date()) {
  const stamp = date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "");
  let backupPath = `${config.authSecretsPath}.backup-${stamp}`;

  while (existsSync(backupPath)) {
    backupPath = `${config.authSecretsPath}.backup-${stamp}-${randomUUID()}`;
  }

  return backupPath;
}

function changeLoginPassword({ currentPassword, newPassword }) {
  if (!verifyPassword(currentPassword)) {
    return {
      ok: false,
      error: "Current password is incorrect.",
    };
  }

  if (newPassword.length < 12) {
    return {
      ok: false,
      error: "New password must be at least 12 characters.",
    };
  }

  if (newPassword.length > 200) {
    return {
      ok: false,
      error: "New password is too long.",
    };
  }

  const backupPath = buildAuthSecretsBackupPath();
  const currentRaw = readFileSync(config.authSecretsPath, "utf8");
  writeFileSync(backupPath, currentRaw, { mode: 0o600, flag: "wx" });

  const nextSecrets = {
    ...authSecrets,
    ...hashPassword(newPassword),
  };

  writeJsonFile(config.authSecretsPath, nextSecrets, 0o600);
  authSecrets = nextSecrets;

  return {
    ok: true,
    backupPath,
  };
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function renderLoginPage({ error = "", returnTo = "/", email = allowedEmail }) {
  const safeError = error ? `<p class="error">${escapeHtml(error)}</p>` : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ADHD Planner MCP Login</title>
  <style>
    :root { color-scheme: light dark; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      font-family: ui-sans-serif, system-ui, sans-serif;
      background: radial-gradient(circle at top, #1f2937, #0f172a 58%);
      color: #e5e7eb;
    }
    .card {
      width: min(420px, calc(100vw - 32px));
      background: rgba(15, 23, 42, 0.88);
      border: 1px solid rgba(148, 163, 184, 0.2);
      border-radius: 18px;
      padding: 28px;
      box-shadow: 0 24px 80px rgba(15, 23, 42, 0.5);
    }
    h1 { margin: 0 0 8px; font-size: 1.5rem; }
    p { margin: 0 0 18px; color: #cbd5e1; line-height: 1.5; }
    label { display: block; margin: 14px 0 6px; font-size: 0.95rem; color: #cbd5e1; }
    input {
      width: 100%;
      box-sizing: border-box;
      padding: 12px 14px;
      border-radius: 12px;
      border: 1px solid #334155;
      background: #020617;
      color: #f8fafc;
      font-size: 1rem;
    }
    button {
      width: 100%;
      margin-top: 18px;
      padding: 12px 14px;
      border: 0;
      border-radius: 12px;
      background: linear-gradient(135deg, #38bdf8, #22c55e);
      color: #04111d;
      font-size: 1rem;
      font-weight: 700;
      cursor: pointer;
    }
    .hint { margin-top: 12px; font-size: 0.92rem; color: #94a3b8; }
    .error {
      margin: 12px 0 0;
      color: #fecaca;
      background: rgba(127, 29, 29, 0.45);
      border: 1px solid rgba(248, 113, 113, 0.35);
      border-radius: 10px;
      padding: 10px 12px;
    }
  </style>
</head>
<body>
  <main class="card">
    <h1>ADHD Planner MCP</h1>
    <p>Sign in to authorize Claude or ChatGPT to access your tasks.</p>
    ${safeError}
    <form method="post" action="/login">
      <input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}" />
      <label for="email">Email</label>
      <input id="email" name="email" type="email" autocomplete="username" value="${escapeHtml(email)}" required />
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required />
      <button type="submit">Continue</button>
    </form>
    <p class="hint">Only the allowed owner account can authorize this connector.</p>
  </main>
</body>
</html>`;
}

function renderChangePasswordPage({ error = "", success = "" } = {}) {
  const safeError = error ? `<p class="error">${escapeHtml(error)}</p>` : "";
  const safeSuccess = success ? `<p class="success">${escapeHtml(success)}</p>` : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Change MCP Password</title>
  <style>
    :root { color-scheme: light dark; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      font-family: ui-sans-serif, system-ui, sans-serif;
      background: radial-gradient(circle at top, #1f2937, #0f172a 58%);
      color: #e5e7eb;
    }
    .card {
      width: min(460px, calc(100vw - 32px));
      background: rgba(15, 23, 42, 0.88);
      border: 1px solid rgba(148, 163, 184, 0.2);
      border-radius: 18px;
      padding: 28px;
      box-shadow: 0 24px 80px rgba(15, 23, 42, 0.5);
    }
    h1 { margin: 0 0 8px; font-size: 1.5rem; }
    p { margin: 0 0 18px; color: #cbd5e1; line-height: 1.5; }
    label { display: block; margin: 14px 0 6px; font-size: 0.95rem; color: #cbd5e1; }
    input {
      width: 100%;
      box-sizing: border-box;
      padding: 12px 14px;
      border-radius: 12px;
      border: 1px solid #334155;
      background: #020617;
      color: #f8fafc;
      font-size: 1rem;
    }
    button {
      width: 100%;
      margin-top: 18px;
      padding: 12px 14px;
      border: 0;
      border-radius: 12px;
      background: linear-gradient(135deg, #38bdf8, #22c55e);
      color: #04111d;
      font-size: 1rem;
      font-weight: 700;
      cursor: pointer;
    }
    a { color: #7dd3fc; }
    .hint { margin-top: 12px; font-size: 0.92rem; color: #94a3b8; }
    .error,
    .success {
      margin: 12px 0 0;
      border-radius: 10px;
      padding: 10px 12px;
    }
    .error {
      color: #fecaca;
      background: rgba(127, 29, 29, 0.45);
      border: 1px solid rgba(248, 113, 113, 0.35);
    }
    .success {
      color: #bbf7d0;
      background: rgba(20, 83, 45, 0.45);
      border: 1px solid rgba(74, 222, 128, 0.35);
    }
  </style>
</head>
<body>
  <main class="card">
    <h1>Change MCP password</h1>
    <p>This changes the login password for ${escapeHtml(allowedEmail)}.</p>
    ${safeError}
    ${safeSuccess}
    <form method="post" action="/change-password">
      <label for="currentPassword">Current password</label>
      <input id="currentPassword" name="currentPassword" type="password" autocomplete="current-password" required />
      <label for="newPassword">New password</label>
      <input id="newPassword" name="newPassword" type="password" autocomplete="new-password" minlength="12" required />
      <label for="confirmPassword">Confirm new password</label>
      <input id="confirmPassword" name="confirmPassword" type="password" autocomplete="new-password" minlength="12" required />
      <button type="submit">Change password</button>
    </form>
    <p class="hint">Known password changes do not require SSH. If the current password is lost, use the admin reset helper.</p>
    <p class="hint"><a href="/">Back to MCP status</a></p>
  </main>
</body>
</html>`;
}

async function issueTokens({ clientId, email, scopes, resource }) {
  const now = Math.floor(Date.now() / 1000);
  const scope = scopes.join(" ");

  const access_token = await new SignJWT({
    type: "access",
    client_id: clientId,
    scope,
    resource: resource.href,
    email,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(config.publicBaseUrl.origin)
    .setAudience(resource.href)
    .setSubject(email)
    .setIssuedAt(now)
    .setExpirationTime(now + ACCESS_TOKEN_TTL_SECONDS)
    .setJti(randomUUID())
    .sign(authKeys.access);

  const refresh_token = await new SignJWT({
    type: "refresh",
    client_id: clientId,
    scope,
    resource: resource.href,
    email,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(config.publicBaseUrl.origin)
    .setAudience(resource.href)
    .setSubject(email)
    .setIssuedAt(now)
    .setExpirationTime(now + REFRESH_TOKEN_TTL_SECONDS)
    .setJti(randomUUID())
    .sign(authKeys.refresh);

  return {
    access_token,
    token_type: "bearer",
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    refresh_token,
    scope,
  };
}

async function verifyAccessToken(token) {
  const { payload } = await jwtVerify(token, authKeys.access, {
    issuer: config.publicBaseUrl.origin,
    audience: config.mcpUrl.href,
  });

  if (payload.type !== "access") {
    throw new Error("Invalid access token type");
  }

  return {
    token,
    clientId: String(payload.client_id),
    scopes: String(payload.scope ?? "").split(" ").filter(Boolean),
    expiresAt: Number(payload.exp),
    resource: new URL(String(payload.resource ?? config.mcpUrl.href)),
    extra: {
      email: payload.email,
    },
  };
}

async function verifyRefreshToken(token) {
  const { payload } = await jwtVerify(token, authKeys.refresh, {
    issuer: config.publicBaseUrl.origin,
    audience: config.mcpUrl.href,
  });

  if (payload.type !== "refresh") {
    throw new Error("Invalid refresh token type");
  }

  return {
    clientId: String(payload.client_id),
    scopes: String(payload.scope ?? "").split(" ").filter(Boolean),
    resource: new URL(String(payload.resource ?? config.mcpUrl.href)),
    email: String(payload.email ?? ""),
  };
}

const oauthProvider = new LocalPasswordOAuthProvider();
const app = express();

app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));

app.get("/", async (req, res) => {
  const session = await readSession(req);
  res.status(200).type("html").send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ADHD Planner MCP</title>
</head>
<body style="font-family: ui-sans-serif, system-ui, sans-serif; padding: 32px;">
  <h1>ADHD Planner MCP</h1>
  <p>Resource endpoint: <code>${escapeHtml(config.mcpUrl.href)}</code></p>
  <p>Authentication: OAuth 2.1 with password login for <strong>${escapeHtml(allowedEmail)}</strong></p>
  <p>Session: ${session ? `signed in as ${escapeHtml(session.email)}` : "not signed in"}</p>
  <p><a href="/login">Login</a>${session ? ' · <a href="/change-password">Change password</a>' : ""}</p>
</body>
</html>`);
});

app.get("/login", async (req, res) => {
  const returnTo = normalizeReturnTo(req.query.returnTo);
  const session = await readSession(req);

  if (session) {
    res.redirect(302, returnTo);
    return;
  }

  res.status(200).type("html").send(renderLoginPage({ returnTo }));
});

app.post("/login", async (req, res) => {
  const email = String(req.body.email ?? "").trim().toLowerCase();
  const password = String(req.body.password ?? "");
  const returnTo = normalizeReturnTo(req.body.returnTo);

  if (email !== allowedEmail) {
    res.status(401).type("html").send(renderLoginPage({
      error: "This account is not allowed for the MCP connector.",
      returnTo,
      email,
    }));
    return;
  }

  if (!verifyPassword(password)) {
    res.status(401).type("html").send(renderLoginPage({
      error: "Incorrect password.",
      returnTo,
      email,
    }));
    return;
  }

  const sessionToken = await createSessionToken(email);
  setSessionCookie(res, sessionToken);
  res.redirect(302, returnTo);
});

app.post("/logout", (_req, res) => {
  clearSessionCookie(res);
  res.redirect(302, "/");
});

app.get("/change-password", async (req, res) => {
  const session = await readSession(req);

  if (!session || session.email !== allowedEmail) {
    res.redirect(302, "/login?returnTo=%2Fchange-password");
    return;
  }

  res.status(200).type("html").send(renderChangePasswordPage());
});

app.post("/change-password", async (req, res) => {
  const session = await readSession(req);

  if (!session || session.email !== allowedEmail) {
    res.redirect(302, "/login?returnTo=%2Fchange-password");
    return;
  }

  const currentPassword = String(req.body.currentPassword ?? "");
  const newPassword = String(req.body.newPassword ?? "");
  const confirmPassword = String(req.body.confirmPassword ?? "");

  if (newPassword !== confirmPassword) {
    res.status(400).type("html").send(renderChangePasswordPage({
      error: "New password and confirmation do not match.",
    }));
    return;
  }

  const result = changeLoginPassword({ currentPassword, newPassword });

  if (!result.ok) {
    res.status(400).type("html").send(renderChangePasswordPage({
      error: result.error,
    }));
    return;
  }

  console.log(`MCP login password changed for ${allowedEmail}; auth backup: ${result.backupPath}`);
  res.status(200).type("html").send(renderChangePasswordPage({
    success: "Password changed. Existing MCP OAuth tokens were not revoked.",
  }));
});

app.use(mcpAuthRouter({
  provider: oauthProvider,
  issuerUrl: config.publicBaseUrl,
  resourceServerUrl: config.mcpUrl,
  scopesSupported: [SUPPORTED_SCOPE],
  resourceName: "ADHD Planner MCP",
}));

app.get("/healthz", (_req, res) => {
  res.json({
    ok: true,
    name: "adhd-planner",
    version: MCP_SERVER_VERSION,
    transport: ["streamable-http"],
    auth: "oauth-password",
  });
});

app.all(
  "/mcp",
  requireBearerAuth({
    verifier: oauthProvider,
    requiredScopes: [SUPPORTED_SCOPE],
    resourceMetadataUrl: config.resourceMetadataUrl,
  }),
  async (req, res) => {
    try {
      const sessionId = typeof req.headers["mcp-session-id"] === "string"
        ? req.headers["mcp-session-id"]
        : undefined;

      let session = sessionId ? streamableSessions.get(sessionId) : undefined;

      if (!session) {
        if (req.method !== "POST" || !isInitializeRequest(req.body)) {
          res.status(400).json({
            jsonrpc: "2.0",
            error: {
              code: -32000,
              message: "Bad Request: initialize via POST is required before using this MCP session.",
            },
            id: null,
          });
          return;
        }

        const server = createServer();
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: newSessionId => {
            streamableSessions.set(newSessionId, { server, transport });
          },
        });

        transport.onclose = () => {
          if (transport.sessionId) {
            streamableSessions.delete(transport.sessionId);
          }
          server.close();
        };

        await server.connect(transport);
        session = { server, transport };
      }

      await session.transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("Error handling /mcp request:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal server error",
          },
          id: null,
        });
      }
    }
  },
);

app.listen(config.port, "127.0.0.1", () => {
  console.log(`adhd-planner MCP server listening on 127.0.0.1:${config.port}`);
  console.log(`Public MCP URL: ${config.mcpUrl.href}`);
  console.log(`OAuth issuer: ${config.publicBaseUrl.href}`);
  console.log(`Allowed login email: ${allowedEmail}`);
});
