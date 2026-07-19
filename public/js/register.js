import { auth, googleProvider, db } from "./firebase.js";

import {
    createUserWithEmailAndPassword,
    signInWithPopup,
    updateProfile
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

import {
    doc,
    setDoc,
    getDoc,
    serverTimestamp,
    collection,
    getCountFromServer
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

const MAX_ACCOUNTS = 5;

async function seatsAvailable() {
    const snap = await getCountFromServer(collection(db, "users"));
    return snap.data().count < MAX_ACCOUNTS;
}

async function createProfileIfMissing(user, name) {
    const ref = doc(db, "users", user.uid);
    const existing = await getDoc(ref);
    if (!existing.exists()) {
        await setDoc(ref, {
            name: name || user.displayName || "New user",
            email: user.email,
            createdAt: serverTimestamp()
        });
    }
}

const form = document.getElementById("registerForm");

form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = document.getElementById("name").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    try {
        if (!(await seatsAvailable())) {
            document.getElementById("formHint").textContent =
                `All ${MAX_ACCOUNTS} seats are taken. Ask an existing member for access.`;
            return;
        }

        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(cred.user, { displayName: name });
        await createProfileIfMissing(cred.user, name);

        location.href = "dashboard.html";
    } catch (err) {
        alert(friendlyAuthError(err));
    }
});

document.getElementById("googleRegister").addEventListener("click", async () => {
    try {
        if (!(await seatsAvailable())) {
            document.getElementById("formHint").textContent =
                `All ${MAX_ACCOUNTS} seats are taken. Ask an existing member for access.`;
            return;
        }

        const cred = await signInWithPopup(auth, googleProvider);
        await createProfileIfMissing(cred.user);

        location.href = "dashboard.html";
    } catch (err) {
        alert(friendlyAuthError(err));
    }
});

function friendlyAuthError(err) {
    const map = {
        "auth/email-already-in-use": "An account with that email already exists.",
        "auth/weak-password": "Password should be at least 6 characters.",
        "auth/invalid-email": "That email address looks invalid.",
        "auth/popup-closed-by-user": "Google sign-in was cancelled."
    };
    return map[err.code] || err.message;
}
