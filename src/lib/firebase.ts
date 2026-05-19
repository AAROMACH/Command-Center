import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

/**
 * @fileOverview Firebase Client SDK Initialization.
 * Reverted to neutral placeholders. Connection to a specific Firebase project must be re-established.
 */

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSy-PLACEHOLDER", 
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "SENDER_ID_PLACEHOLDER",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:SENDER_ID_PLACEHOLDER:web:PLACEHOLDER",
};

// Initialize Firebase
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export { app, db, auth };
