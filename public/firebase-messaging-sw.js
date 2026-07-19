// Must live at the site root. Handles push notifications when
// no Solace tab is open. Uses the "compat" SDK because service
// workers can't use ES module imports the same way.

importScripts("https://www.gstatic.com/firebasejs/12.0.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.0.0/firebase-messaging-compat.js");

// Keep this in sync with js/firebase.js
firebase.initializeApp({
    apiKey: "AIzaSyDXGucVOsaCKsL_KuYrUBYjIH5yBvYqt3I",
    authDomain: "solace-21d29.firebaseapp.com",
    projectId: "solace-21d29",
    storageBucket: "solace-21d29.firebasestorage.app",
    messagingSenderId: "589692348041",
    appId: "1:589692348041:web:c1fc3ed7c40c6a57e3c858",
    measurementId: "G-1DMT95DSFF"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    const title = payload.notification?.title || "Solace reminder";
    const options = {
        body: payload.notification?.body || "",
        icon: payload.notification?.icon || undefined,
        data: payload.data || {}
    };
    self.registration.showNotification(title, options);
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    event.waitUntil(clients.openWindow("/dashboard.html"));
});
