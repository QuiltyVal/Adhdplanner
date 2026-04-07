const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");

function getFirebaseCredentials() {
  const raw = process.env.FIREBASE_CREDENTIALS;
  if (!raw) {
    throw new Error("FIREBASE_CREDENTIALS is not configured");
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error("FIREBASE_CREDENTIALS is not valid JSON");
  }

  return {
    ...parsed,
    private_key: parsed.private_key?.replace(/\\n/g, "\n"),
  };
}

function getAdminApp() {
  if (!admin.apps.length) {
    const credentials = getFirebaseCredentials();
    admin.initializeApp({
      credential: admin.credential.cert(credentials),
    });
  }

  return admin.app();
}

function getDb() {
  getAdminApp();
  return getFirestore();
}

module.exports = {
  admin,
  getAdminApp,
  getDb,
};
