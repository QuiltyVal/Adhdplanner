// netlify/functions/auth.js
const crypto = require("crypto");
const { getFirestore } = require("firebase-admin/firestore");
const admin = require("firebase-admin");

exports.handler = async (event) => {
  const TELEGRAM_BOT_TOKEN = "8002603933:AAHawX2-DfShfNw-0iUGgjUtZGBngOjBKgM";

  try {
    const params = new URLSearchParams(event.queryStringParameters);
    const hash = params.get("hash");

    if (!hash) {
      return { statusCode: 400, body: "Missing hash parameter" };
    }

    const dataCheckString = [...params.entries()]
      .filter(([key]) => key !== "hash")
      .map(([key, value]) => `${key}=${value}`)
      .sort()
      .join("\n");

    const secretKey = crypto.createHash("sha256").update(TELEGRAM_BOT_TOKEN).digest();
    const hmac = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

    if (hmac !== hash) {
      return { statusCode: 403, body: "Invalid hash" };
    }

    if (!admin.apps.length) {
      let firebaseCredentials;
      try {
        firebaseCredentials = JSON.parse(process.env.FIREBASE_CREDENTIALS);
      } catch (jsonError) {
        console.error("Ошибка парсинга FIREBASE_CREDENTIALS:", jsonError);
        return { statusCode: 500, body: "Ошибка конфигурации Firebase" };
      }

      admin.initializeApp({
        credential: admin.credential.cert({
          ...firebaseCredentials,
          private_key: firebaseCredentials.private_key.replace(/\\n/g, "\n"),
        }),
      });
    }

    const db = getFirestore();
    const userId = params.get("id");
    const username = params.get("username") || "NoUsername";

    await db.doc(`users/${userId}`).set({ username }, { merge: true });

    const queryString = new URLSearchParams(event.queryStringParameters).toString();
    console.log("Redirecting with query:", queryString);

    // Перенаправляем на /main с GET-параметрами
    return {
      statusCode: 302,
      headers: {
        Location: `https://dulcet-yeot-cb2d95.netlify.app/main?${queryString}`,
        "Cache-Control": "no-cache"
      },
      body: ""
    };

  } catch (error) {
    console.error("Server error:", error);
    return { statusCode: 500, body: `Server error: ${error.message}` };
  }
};
