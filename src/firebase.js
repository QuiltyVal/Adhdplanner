// src/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAcutIjmjWQl6m0nHro1R7B9TiOUmezDp4",
  authDomain: "telegrammadhd.firebaseapp.com",
  projectId: "telegrammadhd",
  storageBucket: "telegrammadhd.firebasestorage.app",
  messagingSenderId: "173912522406",
  appId: "1:173912522406:web:9a0ac9a50f229bb040fe67",
  measurementId: "G-XJTYHD9ZCL"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
