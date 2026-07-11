import { initializeApp } from 'firebase/app';

// Firebase configuration — loaded from .env (Vite exposes VITE_* via import.meta.env)
// These values point to the REAL Firebase project — no emulator connections here.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Initialize Firebase (real cloud project, no emulator)
const app = initializeApp(firebaseConfig);

export { app };
