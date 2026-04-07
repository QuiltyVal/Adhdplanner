const { exchangeCodeForTokens, storeGoogleCalendarRefreshToken, verifyState } = require("./_lib/google-calendar");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).send("Method not allowed");
  }

  const code = req.query?.code;
  const state = req.query?.state;
  const error = req.query?.error;

  if (error) {
    return res.redirect(302, `https://planner.valquilty.com/?calendar=error&reason=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return res.status(400).send("Missing code or state");
  }

  try {
    const payload = verifyState(state);
    const tokens = await exchangeCodeForTokens(code);

    if (!tokens.refresh_token) {
      return res.redirect(302, "https://planner.valquilty.com/?calendar=missing_refresh_token");
    }

    await storeGoogleCalendarRefreshToken(payload.userId, tokens.refresh_token, {
      scope: tokens.scope,
      tokenType: tokens.token_type,
    });

    return res.redirect(302, "https://planner.valquilty.com/?calendar=connected");
  } catch (callbackError) {
    console.error("[google-calendar-callback]", callbackError);
    return res.redirect(
      302,
      `https://planner.valquilty.com/?calendar=error&reason=${encodeURIComponent(callbackError.message || "callback_failed")}`,
    );
  }
};
