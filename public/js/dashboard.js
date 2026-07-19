import { auth, db, messaging, VAPID_KEY } from "./firebase.js";

import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

import {
    collection,
    query,
    where,
    orderBy,
    onSnapshot,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

import { getToken } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-messaging.js";

let currentUser = null;
let tasks = [];
let reminders = [];
let notes = [];
let watchId = null;
const notifiedLocationReminders = new Set();

// ---------- Auth guard ----------
onAuthStateChanged(auth, (user) => {
    if (!user) {
        location.href = "index.html";
        return;
    }
    currentUser = user;

    document.getElementById("welcomeName").textContent = `Welcome, ${user.displayName ?? "there"} 👋`;
    document.getElementById("userEmail").textContent = user.email;

    subscribeToCollections(user.uid);
    startLocationWatch();
    registerServiceWorker();
});

document.getElementById("logout").addEventListener("click", () => {
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    signOut(auth);
});

// ---------- Navigation ----------
document.querySelectorAll(".nav-link").forEach((link) => {
    link.addEventListener("click", () => {
        document.querySelectorAll(".nav-link").forEach((l) => l.classList.remove("active"));
        link.classList.add("active");
        const target = link.dataset.view;
        document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
        document.getElementById(`view-${target}`).classList.remove("hidden");
    });
});

document.getElementById("menuToggle")?.addEventListener("click", () => {
    document.getElementById("sidebar").classList.toggle("open");
});

// ---------- Firestore subscriptions ----------
function subscribeToCollections(uid) {
    const tasksQ = query(collection(db, "tasks"), where("uid", "==", uid), orderBy("createdAt", "desc"));
    onSnapshot(tasksQ, (snap) => {
        tasks = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        renderTasks();
    });

    const remindersQ = query(collection(db, "reminders"), where("uid", "==", uid), orderBy("createdAt", "desc"));
    onSnapshot(remindersQ, (snap) => {
        reminders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        renderReminders();
    });

    const notesQ = query(collection(db, "notes"), where("uid", "==", uid), orderBy("updatedAt", "desc"));
    onSnapshot(notesQ, (snap) => {
        notes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        renderNotes();
    });
}

// ---------- Rendering ----------
function renderTasks() {
    const preview = document.getElementById("taskPreview");
    const full = document.getElementById("taskFullList");
    preview.innerHTML = "";
    full.innerHTML = "";

    if (tasks.length === 0) {
        preview.innerHTML = `<li class="empty">No tasks yet.</li>`;
    }

    tasks.forEach((t, i) => {
        const li = buildTaskItem(t);
        if (i < 4) preview.appendChild(li.cloneNode(true));
        full.appendChild(li);
    });

    // preview clones need their own listeners re-bound
    bindItemActions(preview);
    bindItemActions(full);

    updateHero();
}

function buildTaskItem(t) {
    const li = document.createElement("li");
    li.className = `item priority-${t.priority || "medium"}`;
    li.dataset.id = t.id;
    li.innerHTML = `
        <label class="check">
            <input type="checkbox" data-action="toggle-task" ${t.status === "done" ? "checked" : ""}>
            <span class="${t.status === "done" ? "done" : ""}">${escapeHtml(t.title)}</span>
        </label>
        <div class="item-meta">
            ${t.dueDate ? `<span><i class='bx bx-calendar'></i> ${t.dueDate}</span>` : ""}
            <button class="icon-btn" data-action="delete-task"><i class='bx bx-trash'></i></button>
        </div>`;
    return li;
}

function renderReminders() {
    const preview = document.getElementById("reminderPreview");
    const full = document.getElementById("reminderFullList");
    preview.innerHTML = "";
    full.innerHTML = "";

    if (reminders.length === 0) {
        preview.innerHTML = `<li class="empty">No reminders yet.</li>`;
    }

    reminders.forEach((r, i) => {
        const li = buildReminderItem(r);
        if (i < 4) preview.appendChild(li.cloneNode(true));
        full.appendChild(li);
    });

    bindItemActions(preview);
    bindItemActions(full);
    updateHero();
}

function buildReminderItem(r) {
    const li = document.createElement("li");
    li.className = "item";
    li.dataset.id = r.id;
    const badge = r.type === "time" ? "🕒 Time" : r.type === "location" ? "📍 Location" : "🕒📍 Time + Location";
    const when = r.datetime ? new Date(r.datetime).toLocaleString() : "";
    li.innerHTML = `
        <div>
            <strong>${escapeHtml(r.title)}</strong>
            <div class="item-sub">${badge}${when ? " · " + when : ""}${r.location?.label ? " · " + escapeHtml(r.location.label) : ""}</div>
        </div>
        <div class="item-meta">
            <button class="icon-btn" data-action="delete-reminder"><i class='bx bx-trash'></i></button>
        </div>`;
    return li;
}

function renderNotes() {
    const grid = document.getElementById("noteGrid");
    grid.innerHTML = "";

    if (notes.length === 0) {
        grid.innerHTML = `<p class="hint-text">No notes yet.</p>`;
    }

    notes.forEach((n) => {
        const card = document.createElement("div");
        card.className = "card note-card";
        card.dataset.id = n.id;
        card.innerHTML = `
            <div class="card-head">
                <h3>${escapeHtml(n.title)}</h3>
                <button class="icon-btn" data-action="delete-note"><i class='bx bx-trash'></i></button>
            </div>
            <p class="note-content">${escapeHtml(n.content || "")}</p>`;
        grid.appendChild(card);
    });
    bindItemActions(grid);

    const notePreview = document.getElementById("notePreview");
    notePreview.innerHTML = notes.length
        ? notes.slice(0, 4).map((n) => `<li>${escapeHtml(n.title)}</li>`).join("")
        : `<li class="empty">No notes yet.</li>`;
}

function bindItemActions(container) {
    container.querySelectorAll('[data-action="toggle-task"]').forEach((el) => {
        el.addEventListener("change", async (e) => {
            const id = e.target.closest(".item").dataset.id;
            await updateDoc(doc(db, "tasks", id), {
                status: e.target.checked ? "done" : "pending"
            });
        });
    });
    container.querySelectorAll('[data-action="delete-task"]').forEach((el) => {
        el.addEventListener("click", async (e) => {
            const id = e.target.closest(".item").dataset.id;
            await deleteDoc(doc(db, "tasks", id));
        });
    });
    container.querySelectorAll('[data-action="delete-reminder"]').forEach((el) => {
        el.addEventListener("click", async (e) => {
            const id = e.target.closest(".item").dataset.id;
            await deleteDoc(doc(db, "reminders", id));
        });
    });
    container.querySelectorAll('[data-action="delete-note"]').forEach((el) => {
        el.addEventListener("click", async (e) => {
            const id = e.target.closest(".note-card, .item").dataset.id;
            await deleteDoc(doc(db, "notes", id));
        });
    });
}

function updateHero() {
    const pendingTasks = tasks.filter((t) => t.status !== "done").length;
    const nextReminder = [...reminders]
        .filter((r) => r.datetime)
        .sort((a, b) => new Date(a.datetime) - new Date(b.datetime))[0];

    document.getElementById("heroHeadline").textContent = `You have ${pendingTasks} open task${pendingTasks === 1 ? "" : "s"}`;
    document.getElementById("heroSub").textContent = nextReminder
        ? `Next up: ${nextReminder.title} · ${new Date(nextReminder.datetime).toLocaleString()}`
        : "Nothing scheduled yet.";
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
}

// ---------- Modal handling ----------
const overlay = document.getElementById("modalOverlay");
const forms = {
    task: document.getElementById("taskForm"),
    reminder: document.getElementById("reminderForm"),
    note: document.getElementById("noteForm")
};

document.querySelectorAll("[data-open-modal]").forEach((btn) => {
    btn.addEventListener("click", () => openModal(btn.dataset.openModal));
});
document.getElementById("modalClose").addEventListener("click", closeModal);
overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });

function openModal(kind) {
    Object.values(forms).forEach((f) => { f.classList.add("hidden"); f.reset(); });
    forms[kind].classList.remove("hidden");
    document.getElementById("modalTitle").textContent =
        kind === "task" ? "New Task" : kind === "reminder" ? "New Reminder" : "New Note";
    overlay.classList.remove("hidden");
}
function closeModal() { overlay.classList.add("hidden"); }

document.getElementById("reminderType").addEventListener("change", (e) => {
    const type = e.target.value;
    document.getElementById("reminderTimeWrap").classList.toggle("hidden", type === "location");
    document.getElementById("reminderLocationWrap").classList.toggle("hidden", type === "time");
});

document.getElementById("useCurrentLocation").addEventListener("click", () => {
    if (!navigator.geolocation) { alert("Geolocation isn't supported in this browser."); return; }
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            document.getElementById("reminderLat").value = pos.coords.latitude;
            document.getElementById("reminderLng").value = pos.coords.longitude;
        },
        (err) => alert("Couldn't get location: " + err.message)
    );
});

// ---------- Form submissions ----------
forms.task.addEventListener("submit", async (e) => {
    e.preventDefault();
    await addDoc(collection(db, "tasks"), {
        uid: currentUser.uid,
        title: document.getElementById("taskTitle").value.trim(),
        description: document.getElementById("taskDesc").value.trim(),
        dueDate: document.getElementById("taskDue").value || null,
        priority: document.getElementById("taskPriority").value,
        status: "pending",
        createdAt: serverTimestamp()
    });
    closeModal();
});

forms.reminder.addEventListener("submit", async (e) => {
    e.preventDefault();
    const type = document.getElementById("reminderType").value;

    const payload = {
        uid: currentUser.uid,
        title: document.getElementById("reminderTitle").value.trim(),
        type,
        datetime: type !== "location" ? document.getElementById("reminderTime").value : null,
        location: type !== "time" ? {
            label: document.getElementById("reminderPlaceLabel").value.trim(),
            lat: parseFloat(document.getElementById("reminderLat").value),
            lng: parseFloat(document.getElementById("reminderLng").value),
            radius: parseFloat(document.getElementById("reminderRadius").value) || 150
        } : null,
        notified: false,
        createdAt: serverTimestamp()
    };

    await addDoc(collection(db, "reminders"), payload);
    closeModal();
});

forms.note.addEventListener("submit", async (e) => {
    e.preventDefault();
    await addDoc(collection(db, "notes"), {
        uid: currentUser.uid,
        title: document.getElementById("noteTitle").value.trim(),
        content: document.getElementById("noteContent").value.trim(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });
    closeModal();
});

// ---------- Location-based reminders (foreground / backgrounded tab) ----------
function startLocationWatch() {
    if (!navigator.geolocation) return;

    watchId = navigator.geolocation.watchPosition(
        (pos) => checkLocationReminders(pos.coords.latitude, pos.coords.longitude),
        (err) => console.warn("Location watch error:", err.message),
        { enableHighAccuracy: false, maximumAge: 60000, timeout: 20000 }
    );
}

function checkLocationReminders(lat, lng) {
    reminders
        .filter((r) => (r.type === "location" || r.type === "both") && r.location && !notifiedLocationReminders.has(r.id))
        .forEach((r) => {
            const distance = haversineMeters(lat, lng, r.location.lat, r.location.lng);
            if (distance <= (r.location.radius || 150)) {
                notifiedLocationReminders.add(r.id);
                fireNotification(r.title, `You're near ${r.location.label || "a saved location"}.`);
            }
        });
}

function haversineMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
}

function fireNotification(title, body) {
    if (Notification.permission === "granted") {
        new Notification(title, { body });
    } else {
        alert(`${title}\n${body}`);
    }
}

// ---------- Push notifications (works even when Solace is closed, via Cloud Function) ----------
async function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    try {
        await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    } catch (err) {
        console.warn("Service worker registration failed:", err);
    }
}

async function enableNotifications() {
    if (!("Notification" in window)) {
        alert("This browser doesn't support notifications.");
        return;
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
        alert("Notifications weren't enabled.");
        return;
    }

    if (!messaging) {
        alert("Push messaging isn't available in this browser yet — this still works for foreground/location reminders.");
        return;
    }

    try {
        const token = await getToken(messaging, { vapidKey: VAPID_KEY });
        if (token) {
            await setDoc(doc(db, "users", currentUser.uid), { fcmToken: token }, { merge: true });
            document.getElementById("notifStatus").textContent = "Notifications enabled ✅";
        }
    } catch (err) {
        console.error(err);
        alert("Couldn't enable push notifications: " + err.message);
    }
}

document.getElementById("enableNotifs").addEventListener("click", enableNotifications);
document.getElementById("enableNotifsSettings").addEventListener("click", enableNotifications);
