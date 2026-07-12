import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

// Public client-safe config. Inlined to prevent missing values on Render build servers.
const firebaseConfig = {
  apiKey: "AIzaSyBXrdASMSBQfurGF2Y1LehMgU-G4eBAzoo",
  authDomain: "rift-2ef56.firebaseapp.com",
  projectId: "rift-2ef56",
  storageBucket: "rift-2ef56.firebasestorage.app",
  messagingSenderId: "215422185703",
  appId: "1:215422185703:web:c6a754aa71ec821573b242",
  measurementId: "G-2HQN6PJLZ0"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export { app, auth, googleProvider };
