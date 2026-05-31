const PLANNER_WORKER_RESPONSE_CONTRACT_VERSION = 1;
const PLANNER_WORKER_RESPONSE_SHAPE = "planner_worker_result_v1";

function withPlannerWorkerResponseContract(payload = {}) {
  return {
    ...payload,
    ok: payload.ok !== false,
    contractVersion: PLANNER_WORKER_RESPONSE_CONTRACT_VERSION,
    responseShape: PLANNER_WORKER_RESPONSE_SHAPE,
    worker: payload.worker || "planner-engine",
    action: payload.action || "",
  };
}

function buildPlannerWorkerErrorResponse({
  action = "",
  error = "Planner worker request failed",
  extra = {},
} = {}) {
  return withPlannerWorkerResponseContract({
    ok: false,
    action,
    error: String(error || "Planner worker request failed"),
    ...extra,
  });
}

function buildPlannerWorkerSuccessResponse({
  action = "",
  extra = {},
} = {}) {
  return withPlannerWorkerResponseContract({
    ok: true,
    action,
    ...extra,
  });
}

module.exports = {
  PLANNER_WORKER_RESPONSE_CONTRACT_VERSION,
  PLANNER_WORKER_RESPONSE_SHAPE,
  buildPlannerWorkerErrorResponse,
  buildPlannerWorkerSuccessResponse,
  withPlannerWorkerResponseContract,
};
