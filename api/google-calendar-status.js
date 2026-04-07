const { hasGoogleCalendarConnection } = require("./_lib/google-calendar");

const DEFAULT_USER_ID = process.env.PLANNER_DEFAULT_USER_ID;

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!DEFAULT_USER_ID) {
    return res.status(500).json({ error: "PLANNER_DEFAULT_USER_ID is not configured" });
  }

  try {
    const connected = await hasGoogleCalendarConnection(DEFAULT_USER_ID);
    return res.status(200).json({ connected });
  } catch (error) {
    console.error("[google-calendar-status]", error);
    return res.status(500).json({ error: error.message || "Status check failed" });
  }
};
