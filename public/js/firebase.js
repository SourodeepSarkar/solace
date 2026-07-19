import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";

import {
    getAuth,
    GoogleAuthProvider
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyDXGucVOsaCKsL_KuYrUBYjIH5yBvYqt3I",
    authDomain: "solace-21d29.firebaseapp.com",
    projectId: "solace-21d29",
    storageBucket: "solace-21d29.firebasestorage.app",
    messagingSenderId: "589692348041",
    appId: "1:589692348041:web:c1fc3ed7c40c6a57e3c858",
    measurementId: "G-1DMT95DSFF"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

export const googleProvider = new GoogleAuthProvider();