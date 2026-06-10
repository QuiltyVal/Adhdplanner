const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MIN_PLANNER_DEADLINE_YEAR = 2020;
const MAX_PLANNER_DEADLINE_YEAR = 2100;

function normalizeDeadlineText(value = "") {
  return String(value || "").trim();
}

function validatePlannerDeadline(value = "", { allowEmpty = true, fieldName = "deadlineAt" } = {}) {
  const deadlineAt = normalizeDeadlineText(value);
  if (!deadlineAt) {
    return allowEmpty
      ? { ok: true, deadlineAt: "" }
      : { ok: false, deadlineAt: "", reason: "required", error: `${fieldName} is required` };
  }

  if (!ISO_DATE_RE.test(deadlineAt)) {
    return {
      ok: false,
      deadlineAt,
      reason: "format",
      error: `${fieldName} must be empty or a YYYY-MM-DD date with year between 2020 and 2100`,
    };
  }

  const [year, month, day] = deadlineAt.split("-").map(Number);
  if (year < MIN_PLANNER_DEADLINE_YEAR || year > MAX_PLANNER_DEADLINE_YEAR) {
    return {
      ok: false,
      deadlineAt,
      reason: "year_out_of_range",
      year,
      error: `${fieldName} year must be between 2020 and 2100`,
    };
  }

  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return {
      ok: false,
      deadlineAt,
      reason: "invalid_calendar_date",
      error: `${fieldName} must be a real calendar date`,
    };
  }

  return {
    ok: true,
    deadlineAt,
    year,
    month,
    day,
  };
}

function assertValidPlannerDeadline(value = "", options = {}) {
  const validation = validatePlannerDeadline(value, options);
  if (!validation.ok) {
    throw new Error(validation.error);
  }
  return validation.deadlineAt;
}

function normalizePlannerDeadlineForStorage(value = "") {
  const validation = validatePlannerDeadline(value, { allowEmpty: true });
  return validation.ok ? validation.deadlineAt : "";
}

function buildInvalidPlannerDeadlineWarning(value = "", { fieldName = "deadlineAt" } = {}) {
  const validation = validatePlannerDeadline(value, { allowEmpty: true, fieldName });
  if (validation.ok) return null;
  return {
    type: "ignored_invalid_deadlineAt",
    field: fieldName,
    value: validation.deadlineAt,
    reason: validation.reason,
    message: validation.error,
  };
}

module.exports = {
  ISO_DATE_RE,
  MAX_PLANNER_DEADLINE_YEAR,
  MIN_PLANNER_DEADLINE_YEAR,
  assertValidPlannerDeadline,
  buildInvalidPlannerDeadlineWarning,
  normalizeDeadlineText,
  normalizePlannerDeadlineForStorage,
  validatePlannerDeadline,
};
