function escapeHtml(value = "") {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function quoteTask(taskText = "") {
  const title = String(taskText || "").trim();
  return title ? `“${title}”` : "the task";
}

function formatReportMessage({ messageKey = "", params = {} } = {}) {
  const key = String(messageKey || "").trim();
  const taskText = String(params.taskText || "").trim();
  const task = quoteTask(taskText);
  const count = Number(params.count || 0);
  const bonus = Number(params.bonus || 0);
  const explanation = String(params.explanation || "").trim();

  if (key === "devil_auto_clean") {
    return `I moved ${task} out of the active list. It was stale clutter, not today's fight.`;
  }

  if (key === "devil_auto_buried") {
    return `I buried ${task} because it went cold. If I was too harsh, restore it from Cemetery.`;
  }

  if (key === "angel_mission_selected") {
    return `I put ${task} in the spotlight.${explanation ? ` ${explanation}` : ""}`;
  }

  if (key === "angel_rescue_prepared") {
    return `If you get stuck, I will pull ${task} first.${explanation ? ` ${explanation}` : ""}`;
  }

  if (key === "devil_tasks_at_risk") {
    return taskText
      ? `${count} task(s) are getting cold. Start with ${task} before I start digging.`
      : `${count} task(s) are close to Cemetery. I am watching them.`;
  }

  if (key === "engine_run_summary") {
    const angelCount = Number(params.angelCount || 0);
    const devilCount = Number(params.devilCount || 0);
    const deliveryCount = Number(params.deliveryCount || 0);
    const parts = [];
    if (angelCount > 0) parts.push(`${angelCount} angel update${angelCount === 1 ? "" : "s"}`);
    if (devilCount > 0) parts.push(`${devilCount} devil warning${devilCount === 1 ? "" : "s"}`);
    if (deliveryCount > 0) parts.push(`${deliveryCount} delivery item${deliveryCount === 1 ? "" : "s"}`);
    return parts.length > 0
      ? `Planner engine ran: ${parts.join(" · ")}.`
      : "Planner engine checked the state.";
  }

  if (key === "angel_overdue_completed") {
    return `You finished ${task} after it was overdue. I counted the win and added +${bonus} extra points.`;
  }

  if (key === "angel_task_completed") {
    return `You finished ${task}. I counted it, no extra drama required.`;
  }

  if (key === "angel_task_reopened") {
    return `${task} is back in the active list. Second chances are allowed here.`;
  }

  if (key === "devil_task_moved_cemetery") {
    return `I moved ${task} to Cemetery so it stops poisoning the active list.`;
  }

  if (key === "neutral_task_moved_cemetery") {
    return `${task} left the active list. You can restore it from Cemetery if needed.`;
  }

  if (key === "neutral_heaven_cleanup") {
    return `Moved ${count} completed task(s) from Heaven to Cemetery. Finished things still counted; now the list is lighter.`;
  }

  if (key === "neutral_snapshot_restored") {
    return `Restored ${count} task(s) from snapshot. The planner state rolled back to a saved point.`;
  }

  if (key === "angel_protected_task_repaired") {
    return count === 1 && taskText
      ? `I returned ${task} to active because protected tasks should not silently disappear.`
      : `I returned ${count} protected task(s) to active because protected tasks should not silently disappear.`;
  }

  if (key === "neutral_deleted_forever") {
    return count === 1 && taskText
      ? `Deleted ${task} forever. This is not in Cemetery anymore.`
      : `Deleted ${count} task(s) forever. They are not in Cemetery anymore.`;
  }

  return "";
}

function buildDeathMessageSpec(task = {}, source = "auto_death") {
  const taskText = String(task?.text || "Untitled task");
  const messageKey = source === "auto_clean" ? "devil_auto_clean" : "devil_auto_buried";
  const params = { taskText };
  const body = formatReportMessage({ messageKey, params });
  const headline = source === "auto_clean" ? "I cleaned up a cold task" : "A task went cold";
  return { messageKey, params, body, headline, persona: "devil" };
}

function buildDeathTelegramText(task = {}, source = "auto_death") {
  const spec = buildDeathMessageSpec(task, source);
  return [
    `😈 ${spec.body}`,
    "If this was wrong, open Cemetery and return it to active.",
  ].join("\n");
}

function buildDeathEmailHtml(task = {}, source = "auto_death") {
  const spec = buildDeathMessageSpec(task, source);
  const taskText = String(task?.text || "Untitled task");

  return `
    <div style="margin:0;padding:32px;background:#fff5f1;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#2a211d;">
      <div style="max-width:680px;margin:0 auto;background:#fffdfa;border:1px solid #f0d9cf;border-radius:34px;overflow:hidden;box-shadow:0 24px 70px rgba(70,35,24,.13);">
        <div style="padding:34px 34px 20px;background:linear-gradient(135deg,#fff2cf 0%,#ffe6e7 48%,#f4edff 100%);">
          <div style="font-size:12px;letter-spacing:.22em;text-transform:uppercase;color:#9a7564;margin-bottom:18px;">ADHD Planner Devil</div>
          <h1 style="margin:0;font-size:42px;line-height:.96;letter-spacing:-.055em;color:#261d19;">${escapeHtml(spec.headline)}</h1>
          <p style="margin:18px 0 0;font-size:20px;line-height:1.42;color:#5f5149;">${escapeHtml(spec.body)}</p>
        </div>
        <div style="padding:28px 34px 36px;">
          <div style="margin:0 0 18px;padding:16px 18px;border:1px solid #f0d0c5;border-radius:20px;background:#fff7f3;">
            <div style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#b08778;margin-bottom:8px;">Moved task</div>
            <strong style="font-size:18px;color:#2a211d;">${escapeHtml(taskText)}</strong>
          </div>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.5;color:#76675e;">If this was too harsh, return it from Cemetery. Finished and buried things still count as history; they just stop poisoning the active list.</p>
          <a href="https://planner.valquilty.com" style="display:inline-block;padding:15px 22px;border-radius:999px;background:#241c18;color:#fff;text-decoration:none;font-weight:800;">Open planner</a>
        </div>
      </div>
    </div>
  `;
}

function buildScheduledNudgeSpec(task = {}, slot = "checkin", base = "", reason = "") {
  const taskText = String(task?.text || "");
  const slotName = slot === "morning" ? "Morning nudge" : slot === "evening" ? "Evening nudge" : "Planner check-in";
  const mascotLine = slot === "evening"
    ? "If energy is low, tap “I’m stuck” and do one crooked step."
    : "Pick one visible move before the day gets loud.";
  return {
    messageKey: "scheduled_nudge",
    params: { taskText, slot },
    text: [slot === "morning" ? "🌅" : slot === "evening" ? "🌙" : "☁️", slotName + ".", base, reason, mascotLine]
      .filter(Boolean)
      .join("\n"),
  };
}

module.exports = {
  buildDeathEmailHtml,
  buildDeathMessageSpec,
  buildDeathTelegramText,
  buildScheduledNudgeSpec,
  formatReportMessage,
};
