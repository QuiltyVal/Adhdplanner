const { createCalendarEvent } = require("./_lib/google-calendar");

const DEFAULT_USER_ID = process.env.PLANNER_DEFAULT_USER_ID;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!DEFAULT_USER_ID) {
    return res.status(500).json({ error: "PLANNER_DEFAULT_USER_ID is not configured" });
  }

  try {
    const { title, date, startTime, durationMinutes = 60, description = "" } = req.body || {};

    if (!String(title || "").trim()) {
      return res.status(400).json({ error: "Missing event title" });
    }

    const event = await createCalendarEvent(DEFAULT_USER_ID, {
      title: String(title).trim(),
      date,
      startTime,
      durationMinutes,
      description,
    });

    return res.status(200).json({ ok: true, event });
  } catch (error) {
    console.error("[google-calendar-event]", error);
    return res.status(500).json({ error: error.message || "Calendar event creation failed" });
  }
};
