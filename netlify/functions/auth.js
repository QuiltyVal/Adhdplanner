const crypto = require("crypto");

exports.handler = async (event) => {
  const TELEGRAM_BOT_TOKEN = "ВАШ_ТОКЕН_БОТА";

  try {
    // Получаем параметры из URL (Telegram отправляет их как GET-параметры)
    const params = new URLSearchParams(event.queryStringParameters);
    const hash = params.get("hash");

    if (!hash) {
      return { statusCode: 400, body: "Missing hash parameter" };
    }

    // Проверяем подпись (безопасность!)
    const secret = crypto.createHmac("sha256", "WebAppData").update(TELEGRAM_BOT_TOKEN).digest();
    const dataCheckString = [...params.entries()]
      .filter(([key]) => key !== "hash")
      .map(([key, value]) => `${key}=${value}`)
      .sort()
      .join("\n");

    const hmac = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");

    if (hmac !== hash) {
      return { statusCode: 403, body: "Invalid data" };
    }

    // Всё ок! Сохраняем пользователя в Firebase
    const { getFirestore, doc, setDoc } = require("firebase-admin/firestore");
    const admin = require("firebase-admin");

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_CREDENTIALS)),
      });
    }

    const db = getFirestore();
    const userId = params.get("id");
    const username = params.get("username") || "NoUsername";

    await setDoc(doc(db, "users", userId), { username });

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, userId, username }),
    };
  } catch (error) {
    return { statusCode: 500, body: `Server error: ${error.message}` };
  }
};
