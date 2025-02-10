const crypto = require("crypto");
const { getFirestore } = require("firebase-admin/firestore");
const admin = require("firebase-admin");

// Переопределение eval для отладки
const originalEval = global.eval;
global.eval = function (...args) {
  console.warn("Eval called with:", args);
  return originalEval(...args);
};

exports.handler = async (event) => {
  const TELEGRAM_BOT_TOKEN = "8002603933:AAHawX2-DfShfNw-0iUGgjUtZGBngOjBKgM";

  try {
    // Получаем параметры из URL (Telegram отправляет их как GET-параметры)
    const params = new URLSearchParams(event.queryStringParameters);
    const hash = params.get("hash");

    if (!hash) {
      return { statusCode: 400, body: "Missing hash parameter" };
    }

    // Проверяем подпись (безопасность!)
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

    // Инициализация Firebase (если ещё не сделано)
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(
          JSON.parse(process.env.FIREBASE_CREDENTIALS.replace(/\\n/g, '\n'))
        ),
      });
    }

    const db = getFirestore(); // Получаем доступ к Firestore

    // Сохраняем данные пользователя
    const userId = params.get("id"); // ID пользователя
    const username = params.get("username") || "NoUsername"; // Имя пользователя (или значение по умолчанию)

    // Используем коллекцию "users" и документ с ID пользователя
    await db.doc(`users/${userId}`).set({ username });

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, userId, username }),
    };
  } catch (error) {
    console.error("Server error:", error);
    return { statusCode: 500, body: `Server error: ${error.message}` };
  }
};
