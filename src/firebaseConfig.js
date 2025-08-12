import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";

const firebaseConfig = {
    apiKey: "AIzaSyC2v3XN1T5ncYEDMNUTWkH3kYeVmIkwf0g",
    authDomain: "task-manager-3824f.firebaseapp.com",
    projectId: "task-manager-3824f",
    storageBucket: "task-manager-3824f.firebasestorage.app",
    messagingSenderId: "880003477835",
    appId: "1:880003477835:web:51363869de7aa7847438ce",
    measurementId: "G-Y7PGCQ7K25"
  };

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const storage = getStorage(app);

export { db, auth, provider, storage, storageRef, uploadBytes, getDownloadURL, deleteObject, signInWithPopup, signOut };
