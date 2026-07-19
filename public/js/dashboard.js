import { auth } from "./firebase.js";

import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

onAuthStateChanged(auth, (user) => {

    if (!user) {

        location.href = "index.html";
        return;

    }

    document.getElementById("welcomeName").textContent =
        `Welcome, ${user.displayName ?? "User"} 👋`;

    document.getElementById("userEmail").textContent =
        user.email;

});

document
    .getElementById("logout")
    .addEventListener("click", () => {

        signOut(auth);

    });