// firebaseConfig.js
import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator  } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCwuUMadFGOj26LtDBMaA9W060tsYDfM2U",
  authDomain: "linenotify-app.firebaseapp.com",
  projectId: "linenotify-app",
  storageBucket: "linenotify-app.firebasestorage.app",
  messagingSenderId: "578515560905",
  appId: "1:578515560905:web:4f4170b21970a80c2c2018",
  measurementId: "G-P3WF4HJPW8"
};


const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };
