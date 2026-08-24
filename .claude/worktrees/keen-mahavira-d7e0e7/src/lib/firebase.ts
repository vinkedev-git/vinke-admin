// src/lib/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyA0XurSRhvzlvHJVzJ1n9jigeTvXEdGlI0",
  authDomain: "estudoquiz-e23ef.firebaseapp.com",
  projectId: "estudoquiz-e23ef",
  storageBucket: "estudoquiz-e23ef.firebasestorage.app",
  messagingSenderId: "835077403238",
  appId: "1:835077403238:web:13c4307ceb1e2de2b473a7"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);