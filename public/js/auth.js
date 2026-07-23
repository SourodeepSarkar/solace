import { auth, googleProvider } from "./firebase.js";
import { toast } from "./toast.js";

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
    if (user) location.href = "dashboard.html";
});

const form = document.getElementById("loginForm");
const loginBtn = document.getElementById("loginBtn");

function setLoading(btn, loading, label) {
    btn.disabled = loading;
    btn.textContent = loading ? "One moment…" : label;
}

form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    const remember = document.getElementById("remember").checked;

    setLoading(loginBtn, true, "Log in");
    try {
        await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
        await signInWithEmailAndPassword(auth, email, password);
        location.href = "dashboard.html";
    } catch (err) {
        toast(friendlyAuthError(err), "error");
        setLoading(loginBtn, false, "Log in");
    }
});

document.getElementById("googleLogin").addEventListener("click", async () => {
    try {
        await signInWithPopup(auth, googleProvider);
        location.href = "dashboard.html";
    } catch (err) {
        toast(friendlyAuthError(err), "error");
    }
});

document.getElementById("forgotPassword").addEventListener("click", async (e) => {
    e.preventDefault();

    const email = document.getElementById("email").value;
    if (!email) { toast("Enter your email first.", "info"); return; }

    try {
        await sendPasswordResetEmail(auth, email);
        toast("Password reset email sent.", "success");
    } catch (err) {
        toast(friendlyAuthError(err), "error");
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
