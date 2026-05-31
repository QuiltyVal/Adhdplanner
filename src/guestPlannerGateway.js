export function createGuestPlannerGateways({
  isCloudUser = false,
  language = "ru",
  setNudgeStatus = () => {},
  mutateSingleTask = () => null,
} = {}) {
  const blockCloudLocalFallback = (operation, taskId, message = "") => {
    if (!isCloudUser) return false;
    console.warn("[Planner] Cloud local fallback blocked. Backend command did not start.", {
      operation,
      taskId,
    });
    setNudgeStatus(
      message ||
        (language === "en"
          ? "Backend command did not start. Refresh and try again."
          : "Backend-команда не стартовала. Обнови страницу и попробуй ещё раз."),
    );
    return true;
  };

  const mutateGuestSingleTask = (operation, taskId, mutator, message = "") => {
    if (blockCloudLocalFallback(operation, taskId, message)) return null;
    return mutateSingleTask(taskId, mutator);
  };

  const runGuestOnlyBulkOperation = (operation, runner, taskId = "bulk", message = "") => {
    if (blockCloudLocalFallback(operation, taskId, message)) return null;
    return typeof runner === "function" ? runner() : null;
  };

  return {
    blockCloudLocalFallback,
    mutateGuestSingleTask,
    runGuestOnlyBulkOperation,
  };
}
