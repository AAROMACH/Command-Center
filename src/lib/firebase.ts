
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

/**
 * @fileOverview Firebase Client SDK Initialization.
 * Connects the Aaromach Command Center to the 'aaromach-command-center' project.
 */

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSy-PLACEHOLDER", // Fill in from Firebase Console
  authDomain: "aaromach-command-center.firebaseapp.com",
  projectId: "aaromach-command-center",
  storageBucket: "aaromach-command-center.firebasestorage.app",
  messagingSenderId: "222038994379",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:222038994379:web:PLACEHOLDER", // Fill in from Firebase Console
};

// Initialize Firebase
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export { app, db, auth };
