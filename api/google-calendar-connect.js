const { buildGoogleCalendarConnectUrl } = require("./_lib/google-calendar");

const DEFAULT_USER_ID = process.env.PLANNER_DEFAULT_USER_ID;

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).send("Method not allowed");
  }

  if (!DEFAULT_USER_ID) {
    return res.status(500).send("PLANNER_DEFAULT_USER_ID is not configured");
  }

  try {
    return res.redirect(302, buildGoogleCalendarConnectUrl(DEFAULT_USER_ID));
  } catch (error) {
    console.error("[google-calendar-connect]", error);
    return res.status(500).send(error.message || "Calendar connect failed");
  }
};
