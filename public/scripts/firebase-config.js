import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import {
  getFirestore, collection, doc, onSnapshot, getDoc, setDoc, updateDoc, getDocs, deleteDoc, writeBatch
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";
import {
    getAuth,
    signInAnonymously,
    onAuthStateChanged
  } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyCuKCjZI_HeriA9OYswJm3a3X98g596n-g",
    authDomain: "byepoker888.firebaseapp.com",
    projectId: "byepoker888",
    storageBucket: "byepoker888.firebasestorage.app",
    messagingSenderId: "86624031899",
    appId: "1:86624031899:web:8fa04432e641495a49e23e",
    measurementId: "G-FKDJWHZKTW"
};
  
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const auth = getAuth(app);
signInAnonymously(auth).catch((error) => {
  console.error("Anonymous sign-in failed:", error);
});


export {
    db,
    doc,
    firebaseConfig,
    collection,
    onSnapshot,
    getDoc,
    setDoc,
    updateDoc,
    getDocs,
    deleteDoc,
    auth,
    getAuth,
    signInAnonymously,
    writeBatch
};