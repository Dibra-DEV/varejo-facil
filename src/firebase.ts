import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCV6Du3AOwcISPygaJ5ZpLWVLLwHhWdUOE",
  authDomain: "consultas-manels.firebaseapp.com",
  projectId: "consultas-manels",
  storageBucket: "consultas-manels.firebasestorage.app",
  messagingSenderId: "123413701183",
  appId: "1:123413701183:web:6089546018d01ba9ec8e8a",
  measurementId: "G-SEV672TEL0",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
