export const PLANNER_ACTIONS = Object.freeze({
  ADD_TASK: "add_task",
  ADD_SUBTASK: "add_subtask",
  ADD_TIME: "add_time",
  BULK_MOVE_COMPLETED_TO_CEMETERY: "bulk_move_completed_to_cemetery",
  COMPLETE_TASK: "complete_task",
  CREATE_SNAPSHOT: "create_snapshot",
  DELETE_SUBTASK: "delete_subtask",
  DELETE_TASK_FOREVER: "delete_task_forever",
  EDIT_SUBTASK: "edit_subtask",
  EDIT_TASK: "edit_task",
  KILL_TASK: "kill_task",
  MARK_NOT_YOUR_MOVE: "mark_not_your_move",
  REOPEN_TASK: "reopen_task",
  REORDER_TASK: "reorder_task",
  REPAIR_PROTECTED_TASKS: "repair_protected_tasks",
  RESCUE_ABORTED: "rescue_aborted",
  RESCUE_CLOSED_LATER: "rescue_closed_later",
  RESCUE_SHIFT_RECORDED: "rescue_shift_recorded",
  RESCUE_STARTED: "rescue_started",
  RESTORE_SNAPSHOT: "restore_snapshot",
  SET_DEADLINE: "set_deadline",
  SET_HEAT_ZONE: "set_heat_zone",
  SET_CHECKIN: "set_checkin",
  SET_RESISTANCE: "set_resistance",
  SET_TODAY: "set_today",
  SET_URGENCY: "set_urgency",
  TOGGLE_SUBTASK: "toggle_subtask",
  TOUCH_TASK: "touch_task",
  CLEAR_NOT_YOUR_MOVE: "clear_not_your_move",
});

export const PLANNER_CLIENT_MODES = Object.freeze({
  BOOTSTRAP: "planner_bootstrap",
  DEBUG_RUN: "planner_debug_run",
  REPORT_ACK: "report_ack",
  CLARIFY_STEP: "clarify_step",
  RESCUE_INTENT: "rescue_intent",
});

export const PLANNER_DEBUG_TARGETS = Object.freeze({
  ENGINE: "engine",
  OUTBOX: "outbox",
});
