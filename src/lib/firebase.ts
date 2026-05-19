import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCZ3jd1i_QKskjeq2kJSjGV0n7Z4uQYzH0",
  authDomain: "aaromach-command-center.firebaseapp.com",
  databaseURL: "https://aaromach-command-center-default-rtdb.firebaseio.com",
  projectId: "aaromach-command-center",
  storageBucket: "aaromach-command-center.firebasestorage.app",
  messagingSenderId: "222038994379",
  appId: "1:222038994379:web:fb3d2e5e9e587fa5f59a4e",
  measurementId: "G-FVR8PFVBTC",
};

const app = !getApps().length
  ? initializeApp(firebaseConfig)
  : getApp();

export const auth = getAuth(app);
export const db = getFirestore(app);