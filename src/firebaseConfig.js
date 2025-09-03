import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut, 
  setPersistence, 
  browserLocalPersistence,
  inMemoryPersistence
} from "firebase/auth";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";

// Initialize Firebase with error handling
let app;
let db;
let auth;
let storage;

const firebaseConfig = {
  apiKey: "AIzaSyC2v3XN1T5ncYEDMNUTWkH3kYeVmIkwf0g",
  authDomain: "task-manager-3824f.firebaseapp.com",
  projectId: "task-manager-3824f",
  storageBucket: "task-manager-3824f.firebasestorage.app",
  messagingSenderId: "880003477835",
  appId: "1:880003477835:web:51363869de7aa7847438ce",
  measurementId: "G-Y7PGCQ7K25"
};

try {
  // Initialize Firebase
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
  storage = getStorage(app);
  
  // Configure authentication persistence
  setPersistence(auth, browserLocalPersistence)
    .catch((error) => {
      console.warn('Could not set persistence, falling back to memory:', error);
      return setPersistence(auth, inMemoryPersistence);
    });
} catch (error) {
  console.error('Firebase initialization error:', error);
  throw new Error('Failed to initialize Firebase');
}

// Configure Google Auth Provider
const provider = new GoogleAuthProvider();
provider.setCustomParameters({
  prompt: 'select_account',
  login_hint: ''
});

// Add error boundaries for Firebase operations
const safeSignInWithPopup = async () => {
  try {
    return await signInWithPopup(auth, provider);
  } catch (error) {
    console.error('Authentication error:', error);
    throw error;
  }
};

const safeSignOut = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Sign out error:', error);
    throw error;
  }
};

export { 
  db, 
  auth, 
  provider, 
  storage, 
  storageRef, 
  uploadBytes, 
  getDownloadURL, 
  deleteObject, 
  safeSignInWithPopup as signInWithPopup, 
  safeSignOut as signOut 
};
