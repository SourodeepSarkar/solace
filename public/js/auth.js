import { auth, googleProvider } from "./firebase.js";

import {
    signInWithEmailAndPassword,
    signInWithPopup,
    setPersistence,
    browserLocalPersistence,
    browserSessionPersistence,
    sendPasswordResetEmail,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

onAuthStateChanged(auth, (user) => {
    if (user) {
        location.href = "dashboard.html";
    }
});

const form = document.getElementById("loginForm");

form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    const remember = document.getElementById("remember").checked;

    try {
        await setPersistence(
            auth,
            remember ? browserLocalPersistence : browserSessionPersistence
        );

        await signInWithEmailAndPassword(auth, email, password);
        location.href = "dashboard.html";
    } catch (err) {
        alert(friendlyAuthError(err));
    }
});

document.getElementById("googleLogin").addEventListener("click", async () => {
    try {
        await signInWithPopup(auth, googleProvider);
        location.href = "dashboard.html";
    } catch (err) {
        alert(friendlyAuthError(err));
    }
});

document.getElementById("forgotPassword").addEventListener("click", async (e) => {
    e.preventDefault();

    const email = document.getElementById("email").value;
    if (!email) {
        alert("Enter your email first.");
        return;
    }

    try {
        await sendPasswordResetEmail(auth, email);
        alert("Password reset email sent.");
    } catch (err) {
        alert(friendlyAuthError(err));
    }
});

function friendlyAuthError(err) {
    const map = {
        "auth/invalid-credential": "Incorrect email or password.",
        "auth/user-not-found": "No account with that email.",
        "auth/wrong-password": "Incorrect password.",
        "auth/too-many-requests": "Too many attempts. Try again later.",
        "auth/popup-closed-by-user": "Google sign-in was cancelled."
    };
    return map[err.code] || err.message;
}
