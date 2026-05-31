export function formatPlannerReportMessage(event = {}, language = "ru") {
  const isEnglish = language === "en";
  const messageKey = String(event.payload?.messageKey || "");
  if (!messageKey) return "";

  const params = event.payload?.params && typeof event.payload.params === "object"
    ? event.payload.params
    : {};
  const taskText = String(params.taskText || "").trim();
  const quotedTask = taskText ? `“${taskText}”` : (isEnglish ? "the task" : "задачу");
  const count = Number(params.count || 0);
  const bonus = Number(params.bonus || 0);
  const explanation = String(params.explanation || "").trim();

  if (messageKey === "devil_auto_clean") {
    return isEnglish
      ? `I moved ${quotedTask} out of the active list. It was stale clutter, not today's fight.`
      : `Я убрал ${quotedTask} из активного списка. Это был залежавшийся хвост, не сегодняшняя битва.`;
  }

  if (messageKey === "devil_auto_buried") {
    return isEnglish
      ? `I buried ${quotedTask} because it went cold. If I was too harsh, restore it from Cemetery.`
      : `Я похоронил ${quotedTask}, потому что задача остыла. Если я перегнул, верни её из кладбища.`;
  }

  if (messageKey === "angel_mission_selected") {
    return isEnglish
      ? `I put ${quotedTask} in the spotlight.${explanation ? ` ${explanation}` : ""}`
      : `Я поставил ${quotedTask} в фокус дня.${explanation ? ` ${explanation}` : ""}`;
  }

  if (messageKey === "angel_rescue_prepared") {
    return isEnglish
      ? `If you get stuck, I will pull ${quotedTask} first.${explanation ? ` ${explanation}` : ""}`
      : `Если ты застрянешь, я сначала вытащу ${quotedTask}.${explanation ? ` ${explanation}` : ""}`;
  }

  if (messageKey === "devil_tasks_at_risk") {
    return taskText
      ? (isEnglish
        ? `${count} task(s) are getting cold. Start with ${quotedTask} before I start digging.`
        : `${count} задач(и) остывают. Начни с ${quotedTask}, пока я не начал копать.`)
      : (isEnglish
        ? `${count} task(s) are close to Cemetery. I am watching them.`
        : `${count} задач(и) близко к кладбищу. Я за ними присматриваю.`);
  }

  if (messageKey === "scheduled_nudge") {
    const slot = String(params.slot || "").trim();
    const slotLabel = slot === "morning"
      ? (isEnglish ? "morning" : "утренний")
      : slot === "evening"
        ? (isEnglish ? "evening" : "вечерний")
        : (isEnglish ? "planner" : "плановый");
    return taskText
      ? (isEnglish
        ? `I sent a ${slotLabel} nudge about ${quotedTask}.`
        : `Я отправил ${slotLabel} пинок про ${quotedTask}.`)
      : (isEnglish
        ? `I sent a ${slotLabel} planner nudge.`
        : `Я отправил ${slotLabel} пинок планера.`);
  }

  if (messageKey === "engine_run_summary") {
    const summary = event.payload?.projection?.summary && typeof event.payload.projection.summary === "object"
      ? event.payload.projection.summary
      : null;
    const stats = summary?.stats && typeof summary.stats === "object" ? summary.stats : {};
    const meaningfulChangeCount = Number(
      summary?.meaningfulChangeCount ?? params.meaningfulChangeCount ?? 0,
    );
    const angelCount = Number(stats.angelCount ?? params.angelCount ?? 0);
    const devilCount = Number(stats.devilCount ?? params.devilCount ?? 0);
    const deliveryCount = Number(stats.deliveryCount ?? params.deliveryCount ?? 0);
    const cemeteryMoved = Number(stats.cemeteryMoved ?? params.cemeteryMoved ?? 0);
    const outboxQueued = Number(stats.outboxQueued ?? params.outboxQueued ?? 0);
    const heatUpdated = Number(stats.heatUpdated ?? params.heatUpdated ?? 0);

    const parts = [];
    if (cemeteryMoved > 0) parts.push(isEnglish
      ? `${cemeteryMoved} cold task${cemeteryMoved === 1 ? "" : "s"} moved to Cemetery`
      : `${cemeteryMoved} остывш. задач(и) ушли на кладбище`);
    if (angelCount > 0) parts.push(isEnglish
      ? `${angelCount} focus/rescue update${angelCount === 1 ? "" : "s"}`
      : `${angelCount} обновл. фокуса/спасения`);
    if (devilCount > 0) parts.push(isEnglish
      ? `${devilCount} devil warning${devilCount === 1 ? "" : "s"}`
      : `${devilCount} сигнал(а) от чертика`);
    if (outboxQueued > 0) parts.push(isEnglish
      ? `${outboxQueued} message${outboxQueued === 1 ? "" : "s"} queued`
      : `${outboxQueued} сообщ. поставлено в очередь`);
    if (deliveryCount > 0) parts.push(isEnglish
      ? `${deliveryCount} delivery update${deliveryCount === 1 ? "" : "s"}`
      : `${deliveryCount} обновл. доставки`);
    if (parts.length === 0 && heatUpdated > 0) parts.push(isEnglish
      ? `${heatUpdated} task pulse${heatUpdated === 1 ? "" : "s"} refreshed`
      : `${heatUpdated} пульс(ов) задач обновлено`);

    if (parts.length === 0) {
      return isEnglish
        ? "Planner engine checked the state. Nothing needed a visible change."
        : "Движок планера проверил состояние. Видимых изменений не понадобилось.";
    }

    if (cemeteryMoved > 0 || devilCount > 0) {
      return isEnglish
        ? `I cleaned up the cold stuff: ${parts.join(" · ")}.`
        : `Я прибрал остывшие хвосты: ${parts.join(" · ")}.`;
    }

    if (angelCount > 0) {
      return isEnglish
        ? `I refreshed the plan: ${parts.join(" · ")}.`
        : `Я обновил план: ${parts.join(" · ")}.`;
    }

    return isEnglish
      ? `Planner engine made ${meaningfulChangeCount || parts.length} visible change(s): ${parts.join(" · ")}.`
      : `Движок планера сделал ${meaningfulChangeCount || parts.length} видим. изменен.: ${parts.join(" · ")}.`;
  }

  if (messageKey === "angel_overdue_completed") {
    return isEnglish
      ? `You finished ${quotedTask} after it was overdue. I counted the win and added +${bonus} extra points.`
      : `Ты закрыла ${quotedTask} после просрочки. Я засчитал победу и добавил +${bonus} бонусных очков.`;
  }

  if (messageKey === "angel_task_created") {
    return isEnglish
      ? `I captured ${quotedTask} as an active task.`
      : `Я записал ${quotedTask} как активную задачу.`;
  }

  if (messageKey === "user_task_created") {
    return isEnglish
      ? `You created ${quotedTask}.`
      : `Ты создала ${quotedTask}.`;
  }

  if (messageKey === "angel_task_moved") {
    return isEnglish
      ? `Movement recorded on ${quotedTask}. One tiny shift counts.`
      : `Сдвиг по ${quotedTask} засчитан. Даже маленькое движение считается.`;
  }

  if (messageKey === "user_task_moved") {
    return isEnglish
      ? `You recorded movement on ${quotedTask}.`
      : `Ты отметила сдвиг по ${quotedTask}.`;
  }

  if (messageKey === "angel_task_completed") {
    return isEnglish
      ? `You finished ${quotedTask}. I counted it, no extra drama required.`
      : `Ты закрыла ${quotedTask}. Я засчитал, без лишней драмы.`;
  }

  if (messageKey === "user_task_completed") {
    return isEnglish
      ? `You finished ${quotedTask}.`
      : `Ты закрыла ${quotedTask}.`;
  }

  if (messageKey === "angel_task_reopened") {
    return isEnglish
      ? `${quotedTask} is back in the active list. Second chances are allowed here.`
      : `${quotedTask} снова в активном списке. Здесь можно давать задачам второй шанс.`;
  }

  if (messageKey === "user_task_reopened") {
    return isEnglish
      ? `You returned ${quotedTask} to the active list.`
      : `Ты вернула ${quotedTask} в активный список.`;
  }

  if (messageKey === "devil_task_moved_cemetery") {
    return isEnglish
      ? `I moved ${quotedTask} to Cemetery so it stops poisoning the active list.`
      : `Я отправил ${quotedTask} на кладбище, чтобы она не отравляла активный список.`;
  }

  if (messageKey === "user_task_moved_cemetery") {
    return isEnglish
      ? `You moved ${quotedTask} to Cemetery.`
      : `Ты отправила ${quotedTask} на кладбище.`;
  }

  if (messageKey === "neutral_task_moved_cemetery") {
    return isEnglish
      ? `${quotedTask} left the active list. You can restore it from Cemetery if needed.`
      : `${quotedTask} ушла из активного списка. Если нужно, её можно вернуть из кладбища.`;
  }

  if (messageKey === "neutral_heaven_cleanup") {
    return isEnglish
      ? `Moved ${count} completed task(s) from Heaven to Cemetery. Finished things still counted; now the list is lighter.`
      : `Перенесла ${count} завершённых задач(и) из Рая на кладбище. Победы засчитаны, список стал легче.`;
  }

  if (messageKey === "neutral_snapshot_restored") {
    return isEnglish
      ? `Restored ${count} task(s) from snapshot. The planner state rolled back to a saved point.`
      : `Восстановила ${count} задач(и) из снапшота. Планер откатился к сохранённой точке.`;
  }

  if (messageKey === "angel_protected_task_repaired") {
    return count === 1 && taskText
      ? (isEnglish
        ? `I returned ${quotedTask} to active because protected tasks should not silently disappear.`
        : `Я вернул ${quotedTask} в активные, потому что защищённые задачи не должны тихо исчезать.`)
      : (isEnglish
        ? `I returned ${count} protected task(s) to active because protected tasks should not silently disappear.`
        : `Я вернул ${count} защищённых задач(и) в активные, потому что они не должны тихо исчезать.`);
  }

  if (messageKey === "neutral_deleted_forever") {
    return count === 1 && taskText
      ? (isEnglish
        ? `Deleted ${quotedTask} forever. This is not in Cemetery anymore.`
        : `Удалила ${quotedTask} навсегда. Этого больше нет даже на кладбище.`)
      : (isEnglish
        ? `Deleted ${count} task(s) forever. They are not in Cemetery anymore.`
        : `Удалила ${count} задач(и) навсегда. Их больше нет даже на кладбище.`);
  }

  return "";
}
