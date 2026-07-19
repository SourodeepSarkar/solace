// ============================================================
// Firebase initialization for Solace
// Replace firebaseConfig with the values from:
// Firebase Console → Project Settings → General → Your apps → SDK setup
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";
import { getMessaging, isSupported } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-messaging.js";

const firebaseConfig = {
    apiKey: "AIzaSyDXGucVOsaCKsL_KuYrUBYjIH5yBvYqt3I",
    authDomain: "solace-21d29.firebaseapp.com",
    projectId: "solace-21d29",
    storageBucket: "solace-21d29.firebasestorage.app",
    messagingSenderId: "589692348041",
    appId: "1:589692348041:web:c1fc3ed7c40c6a57e3c858",
    measurementId: "G-1DMT95DSFF"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);

// Messaging only works on https/localhost + supported browsers, so guard it.
export let messaging = null;
isSupported().then((supported) => {
    if (supported) {
        messaging = getMessaging(app);
    }
});

// VAPID key from Firebase Console → Project Settings → Cloud Messaging → Web Push certificates
export const VAPID_KEY = "YOUR_VAPID_KEY";
