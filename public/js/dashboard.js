import { auth, db, messaging, VAPID_KEY } from "./firebase.js";
import { toast } from "./toast.js";

import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

import {
    collection, query, where, orderBy, onSnapshot,
    addDoc, updateDoc, deleteDoc, doc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

import { getToken } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-messaging.js";

let currentUser = null;
let tasks = [];
let reminders = [];
let notes = [];
let taskSearchTerm = "";
let noteSearchTerm = "";
let watchId = null;
const notifiedLocationReminders = new Set();

/* ============================================================
   THEME
   ============================================================ */

function initTheme() {
    const saved = localStorage.getItem("solace-theme");
    const preferred = saved || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    applyTheme(preferred);
}

function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("solace-theme", theme);
    const label = theme === "dark" ? "<i class='bx bx-sun'></i> Light mode" : "<i class='bx bx-moon'></i> Dark mode";
    const el = document.getElementById("themeLabel");
    if (el) el.innerHTML = label;
}

function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme") || "light";
    applyTheme(current === "dark" ? "light" : "dark");
}

initTheme();
document.getElementById("themeToggle").addEventListener("click", toggleTheme);
document.getElementById("themeToggleSettings").addEventListener("click", toggleTheme);

/* ============================================================
   AUTH GUARD
   ============================================================ */

onAuthStateChanged(auth, (user) => {
    if (!user) { location.href = "index.html"; return; }
    currentUser = user;

    const name = user.displayName || user.email.split("@")[0];
    document.getElementById("welcomeName").textContent = name;
    document.getElementById("userEmail").textContent = user.email;
    document.getElementById("avatar").textContent = name.trim().charAt(0).toUpperCase();

    subscribeToCollections(user.uid);
    startLocationWatch();
    registerServiceWorker();
    renderWeekStrip();
});

document.getElementById("logout").addEventListener("click", () => {
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    signOut(auth);
});

/* ============================================================
   NAVIGATION
   ============================================================ */

const viewTitles = {
    dashboard: ["Dashboard", "Here's what's going on."],
    tasks: ["Tasks", "Everything on your plate, organized by status."],
    reminders: ["Reminders", "Time and place-based nudges."],
    notes: ["Notes", "Everything worth remembering."],
    settings: ["Settings", "Notifications and appearance."]
};

document.querySelectorAll(".nav-link").forEach((link) => {
    link.addEventListener("click", () => {
        document.querySelectorAll(".nav-link").forEach((l) => l.classList.remove("active"));
        link.classList.add("active");
        const target = link.dataset.view;
        document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
        document.getElementById(`view-${target}`).classList.remove("hidden");
        const [title, sub] = viewTitles[target];
        document.getElementById("topHeading").textContent = title;
        document.getElementById("topSub").textContent = sub;
        document.getElementById("sidebar").classList.remove("open");
    });
});

document.getElementById("menuToggle").addEventListener("click", () => {
    document.getElementById("sidebar").classList.toggle("open");
});

/* ============================================================
   FIRESTORE SUBSCRIPTIONS
   ============================================================ */

function subscribeToCollections(uid) {
    const tasksQ = query(collection(db, "tasks"), where("uid", "==", uid), orderBy("createdAt", "desc"));
    onSnapshot(tasksQ, (snap) => {
        tasks = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        renderAll();
        pulseSync();
    }, () => setSyncState(false));

    const remindersQ = query(collection(db, "reminders"), where("uid", "==", uid), orderBy("createdAt", "desc"));
    onSnapshot(remindersQ, (snap) => {
        reminders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        renderAll();
        pulseSync();
    }, () => setSyncState(false));

    const notesQ = query(collection(db, "notes"), where("uid", "==", uid), orderBy("updatedAt", "desc"));
    onSnapshot(notesQ, (snap) => {
        notes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        renderAll();
        pulseSync();
    }, () => setSyncState(false));
}

function setSyncState(ok) {
    const pill = document.getElementById("syncPill");
    pill.classList.toggle("offline", !ok);
    pill.innerHTML = ok ? "<i class='bx bx-cloud'></i> Synced" : "<i class='bx bx-cloud-lightning'></i> Offline";
}
let syncTimer = null;
function pulseSync() {
    setSyncState(true);
    clearTimeout(syncTimer);
}

function renderAll() {
    renderHero();
    renderTaskPreview();
    renderKanban();
    renderReminders();
    renderNotes();
    renderWeekStrip();
}

/* ============================================================
   HERO / STATS / WEEK STRIP
   ============================================================ */

function renderHero() {
    const openTasks = tasks.filter((t) => t.status !== "done").length;
    const todayStr = new Date().toISOString().slice(0, 10);
    const dueToday = tasks.filter((t) => t.dueDate === todayStr && t.status !== "done").length;

    document.getElementById("statOpenTasks").textContent = `${openTasks} open`;
    document.getElementById("statDueToday").textContent = `${dueToday} due today`;
    document.getElementById("statNotes").textContent = `${notes.length} note${notes.length === 1 ? "" : "s"}`;

    document.getElementById("taskBadge").textContent = openTasks;
    document.getElementById("taskBadge").classList.toggle("hidden", openTasks === 0);

    const nextReminder = [...reminders]
        .filter((r) => r.datetime)
        .sort((a, b) => new Date(a.datetime) - new Date(b.datetime))
        .find((r) => new Date(r.datetime) >= new Date());

    document.getElementById("heroHeadline").textContent =
        openTasks === 0 ? "You're all caught up" : `You have ${openTasks} open task${openTasks === 1 ? "" : "s"}`;
    document.getElementById("heroSub").textContent = nextReminder
        ? `Next up: ${nextReminder.title} · ${new Date(nextReminder.datetime).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`
        : "Nothing scheduled yet.";
}

function renderWeekStrip() {
    const strip = document.getElementById("weekStrip");
    if (!strip) return;
    strip.innerHTML = "";
    const today = new Date();

    for (let i = 0; i < 7; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        const dateStr = d.toISOString().slice(0, 10);

        const hasTask = tasks.some((t) => t.dueDate === dateStr && t.status !== "done");
        const hasReminder = reminders.some((r) => r.datetime && r.datetime.slice(0, 10) === dateStr);

        const cell = document.createElement("div");
        cell.className = "week-day" + (i === 0 ? " is-today" : "");
        cell.innerHTML = `
            <div class="dow">${d.toLocaleDateString([], { weekday: "short" })}</div>
            <div class="dom">${d.getDate()}</div>
            <div class="dots">${hasTask ? "<span class='dot'></span>" : ""}${hasReminder ? "<span class='dot'></span>" : ""}</div>`;
        strip.appendChild(cell);
    }
}

/* ============================================================
   TASKS — dashboard preview + kanban board
   ============================================================ */

function renderTaskPreview() {
    const preview = document.getElementById("taskPreview");
    const openOnes = tasks.filter((t) => t.status !== "done").slice(0, 5);

    preview.innerHTML = openOnes.length ? "" : emptyRow("No tasks yet — add your first one.");
    openOnes.forEach((t) => preview.appendChild(buildTaskRow(t)));
}

function buildTaskRow(t) {
    const li = document.createElement("li");
    li.className = "item";
    li.innerHTML = `
        <span style="font-size:13.5px;font-weight:500">${escapeHtml(t.title)}</span>
        ${t.dueDate ? `<span class="chip ${dueChipClass(t.dueDate)}">${formatDue(t.dueDate)}</span>` : ""}`;
    return li;
}

function renderKanban() {
    const cols = { todo: [], in_progress: [], done: [] };
    const filtered = tasks.filter((t) => matchesSearch(t.title, t.description, taskSearchTerm));
    filtered.forEach((t) => {
        const status = ["todo", "in_progress", "done"].includes(t.status) ? t.status : "todo";
        cols[status].push(t);
    });

    document.getElementById("countTodo").textContent = cols.todo.length;
    document.getElementById("countProgress").textContent = cols.in_progress.length;
    document.getElementById("countDone").textContent = cols.done.length;

    Object.keys(cols).forEach((status) => {
        const container = document.getElementById(`col-${status}`);
        container.innerHTML = "";
        if (cols[status].length === 0) {
            container.innerHTML = `<div class="empty-col">No tasks</div>`;
            return;
        }
        cols[status].forEach((t) => container.appendChild(buildTaskCard(t)));
    });
}

function buildTaskCard(t) {
    const card = document.createElement("div");
    card.className = `task-card priority-${t.priority || "medium"}`;
    card.draggable = true;
    card.dataset.id = t.id;

    card.innerHTML = `
        <div class="task-card-top">
            <span class="priority-dot"></span>
            <span class="task-card-title ${t.status === "done" ? "done" : ""}" style="flex:1">${escapeHtml(t.title)}</span>
        </div>
        ${t.description ? `<div class="task-card-desc">${escapeHtml(t.description)}</div>` : ""}
        <div class="task-card-foot">
            ${t.dueDate ? `<span class="chip ${dueChipClass(t.dueDate)}">${formatDue(t.dueDate)}</span>` : "<span></span>"}
            <div class="task-card-actions">
                <button class="icon-btn" data-action="edit-task"><i class='bx bx-edit-alt'></i></button>
                <button class="icon-btn danger" data-action="delete-task"><i class='bx bx-trash'></i></button>
            </div>
        </div>`;

    card.addEventListener("dragstart", () => card.classList.add("dragging"));
    card.addEventListener("dragend", () => card.classList.remove("dragging"));
    card.addEventListener("click", (e) => {
        if (e.target.closest("[data-action]")) return;
        openTaskModal(t);
    });
    card.querySelector('[data-action="edit-task"]').addEventListener("click", () => openTaskModal(t));
    card.querySelector('[data-action="delete-task"]').addEventListener("click", async () => {
        const ok = await confirmDialog("Delete task", `Delete "${t.title}"? This can't be undone.`);
        if (ok) {
            await deleteDoc(doc(db, "tasks", t.id));
            toast("Task deleted", "success");
        }
    });

    return card;
}

document.querySelectorAll(".kanban-col").forEach((col) => {
    col.addEventListener("dragover", (e) => { e.preventDefault(); col.classList.add("drag-over"); });
    col.addEventListener("dragleave", () => col.classList.remove("drag-over"));
    col.addEventListener("drop", async (e) => {
        e.preventDefault();
        col.classList.remove("drag-over");
        const dragging = document.querySelector(".task-card.dragging");
        if (!dragging) return;
        const id = dragging.dataset.id;
        const newStatus = col.dataset.status;
        await updateDoc(doc(db, "tasks", id), { status: newStatus });
        toast(newStatus === "done" ? "Nice — task marked done" : "Task moved", "success");
    });
});

document.getElementById("taskSearch").addEventListener("input", (e) => {
    taskSearchTerm = e.target.value.trim().toLowerCase();
    renderKanban();
});

/* ============================================================
   REMINDERS
   ============================================================ */

function renderReminders() {
    const preview = document.getElementById("reminderPreview");
    const full = document.getElementById("reminderFullList");

    const upcoming = [...reminders].sort((a, b) => new Date(a.datetime || 0) - new Date(b.datetime || 0));

    preview.innerHTML = upcoming.length ? "" : emptyRow("No reminders yet.");
    upcoming.slice(0, 5).forEach((r) => preview.appendChild(buildReminderRow(r, false)));

    full.innerHTML = upcoming.length ? "" : `<div class="empty-state"><i class='bx bx-bell-off'></i><p>No reminders yet. Add one to get started.</p></div>`;
    upcoming.forEach((r) => full.appendChild(buildReminderRow(r, true)));
}

function buildReminderRow(r, interactive) {
    const li = document.createElement("li");
    li.className = "item";
    const badge = r.type === "time" ? "🕒 Time" : r.type === "location" ? "📍 Location" : "🕒📍 Both";
    const when = r.datetime ? new Date(r.datetime).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "";

    li.innerHTML = `
        <div>
            <strong style="font-size:14px">${escapeHtml(r.title)}</strong>
            <div class="item-sub">${badge}${when ? " · " + when : ""}${r.location?.label ? " · " + escapeHtml(r.location.label) : ""}</div>
        </div>
        <div class="item-meta">
            ${interactive ? `<button class="icon-btn" data-action="edit-reminder"><i class='bx bx-edit-alt'></i></button>` : ""}
            <button class="icon-btn danger" data-action="delete-reminder"><i class='bx bx-trash'></i></button>
        </div>`;

    li.querySelector('[data-action="delete-reminder"]').addEventListener("click", async () => {
        const ok = await confirmDialog("Delete reminder", `Delete "${r.title}"?`);
        if (ok) { await deleteDoc(doc(db, "reminders", r.id)); toast("Reminder deleted", "success"); }
    });
    const editBtn = li.querySelector('[data-action="edit-reminder"]');
    if (editBtn) editBtn.addEventListener("click", () => openReminderModal(r));

    return li;
}

/* ============================================================
   NOTES
   ============================================================ */

function renderNotes() {
    const grid = document.getElementById("noteGrid");
    const filtered = notes.filter((n) => matchesSearch(n.title, n.content, noteSearchTerm));

    grid.innerHTML = filtered.length ? "" : `<div class="empty-state"><i class='bx bx-note'></i><p>No notes match yet.</p></div>`;

    filtered.forEach((n) => {
        const card = document.createElement("div");
        card.className = "card note-card";
        card.innerHTML = `
            <div class="card-head">
                <h3>${escapeHtml(n.title)}</h3>
                <button class="icon-btn danger" data-action="delete-note"><i class='bx bx-trash'></i></button>
            </div>
            <p class="note-content">${escapeHtml(n.content || "")}</p>
            <span class="note-date">${n.updatedAt?.toDate ? n.updatedAt.toDate().toLocaleDateString() : ""}</span>`;

        card.addEventListener("click", (e) => {
            if (e.target.closest("[data-action]")) return;
            openNoteModal(n);
        });
        card.querySelector('[data-action="delete-note"]').addEventListener("click", async (e) => {
            e.stopPropagation();
            const ok = await confirmDialog("Delete note", `Delete "${n.title}"? This can't be undone.`);
            if (ok) { await deleteDoc(doc(db, "notes", n.id)); toast("Note deleted", "success"); }
        });
        grid.appendChild(card);
    });

    const notePreview = document.getElementById("notePreview");
    notePreview.innerHTML = notes.length
        ? notes.slice(0, 5).map((n) => `<li class="item"><span style="font-size:13.5px">${escapeHtml(n.title)}</span></li>`).join("")
        : emptyRow("No notes yet.");
}

document.getElementById("noteSearch").addEventListener("input", (e) => {
    noteSearchTerm = e.target.value.trim().toLowerCase();
    renderNotes();
});

/* ============================================================
   MODALS — create / edit
   ============================================================ */

const overlay = document.getElementById("modalOverlay");
const forms = {
    task: document.getElementById("taskForm"),
    reminder: document.getElementById("reminderForm"),
    note: document.getElementById("noteForm")
};
let editing = { kind: null, id: null };

document.querySelectorAll("[data-open-modal]").forEach((btn) => {
    btn.addEventListener("click", () => {
        const kind = btn.dataset.openModal;
        if (kind === "task") openTaskModal(null);
        if (kind === "reminder") openReminderModal(null);
        if (kind === "note") openNoteModal(null);
    });
});
document.getElementById("modalClose").addEventListener("click", closeModal);
overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeModal(); closeConfirm(); } });

function showModal(kind, title) {
    Object.values(forms).forEach((f) => f.classList.add("hidden"));
    forms[kind].classList.remove("hidden");
    document.getElementById("modalTitle").textContent = title;
    overlay.classList.remove("hidden");
}
function closeModal() { overlay.classList.add("hidden"); editing = { kind: null, id: null }; }

function openTaskModal(t) {
    forms.task.reset();
    editing = { kind: "task", id: t?.id || null };
    document.getElementById("taskId").value = t?.id || "";
    document.getElementById("taskTitle").value = t?.title || "";
    document.getElementById("taskDesc").value = t?.description || "";
    document.getElementById("taskDue").value = t?.dueDate || "";
    document.getElementById("taskStatus").value = t?.status || "todo";
    setPriority(t?.priority || "medium");
    document.getElementById("taskDeleteBtn").classList.toggle("hidden", !t);
    showModal("task", t ? "Edit task" : "New task");
}

function openReminderModal(r) {
    forms.reminder.reset();
    editing = { kind: "reminder", id: r?.id || null };
    document.getElementById("reminderId").value = r?.id || "";
    document.getElementById("reminderTitle").value = r?.title || "";
    document.getElementById("reminderType").value = r?.type || "time";
    document.getElementById("reminderTime").value = r?.datetime || "";
    document.getElementById("reminderPlaceLabel").value = r?.location?.label || "";
    document.getElementById("reminderLat").value = r?.location?.lat ?? "";
    document.getElementById("reminderLng").value = r?.location?.lng ?? "";
    document.getElementById("reminderRadius").value = r?.location?.radius ?? 150;
    toggleReminderFields(r?.type || "time");
    document.getElementById("reminderDeleteBtn").classList.toggle("hidden", !r);
    showModal("reminder", r ? "Edit reminder" : "New reminder");
}

function openNoteModal(n) {
    forms.note.reset();
    editing = { kind: "note", id: n?.id || null };
    document.getElementById("noteId").value = n?.id || "";
    document.getElementById("noteTitle").value = n?.title || "";
    document.getElementById("noteContent").value = n?.content || "";
    document.getElementById("noteDeleteBtn").classList.toggle("hidden", !n);
    showModal("note", n ? "Edit note" : "New note");
}

function setPriority(p) {
    document.getElementById("taskPriority").value = p;
    document.querySelectorAll(".priority-opt").forEach((el) => el.classList.toggle("selected", el.dataset.p === p));
}
document.querySelectorAll(".priority-opt").forEach((el) => {
    el.addEventListener("click", () => setPriority(el.dataset.p));
});

function toggleReminderFields(type) {
    document.getElementById("reminderTimeWrap").classList.toggle("hidden", type === "location");
    document.getElementById("reminderLocationWrap").classList.toggle("hidden", type === "time");
}
document.getElementById("reminderType").addEventListener("change", (e) => toggleReminderFields(e.target.value));

document.getElementById("useCurrentLocation").addEventListener("click", () => {
    if (!navigator.geolocation) { toast("Geolocation isn't supported in this browser.", "error"); return; }
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            document.getElementById("reminderLat").value = pos.coords.latitude;
            document.getElementById("reminderLng").value = pos.coords.longitude;
            toast("Location captured", "success");
        },
        (err) => toast("Couldn't get location: " + err.message, "error")
    );
});

/* ---------- form submits ---------- */

forms.task.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
        uid: currentUser.uid,
        title: document.getElementById("taskTitle").value.trim(),
        description: document.getElementById("taskDesc").value.trim(),
        dueDate: document.getElementById("taskDue").value || null,
        status: document.getElementById("taskStatus").value,
        priority: document.getElementById("taskPriority").value
    };

    if (editing.id) {
        await updateDoc(doc(db, "tasks", editing.id), payload);
        toast("Task updated", "success");
    } else {
        await addDoc(collection(db, "tasks"), { ...payload, createdAt: serverTimestamp() });
        toast("Task added", "success");
    }
    closeModal();
});

document.getElementById("taskDeleteBtn").addEventListener("click", async () => {
    const id = editing.id;
    const ok = await confirmDialog("Delete task", "This can't be undone.");
    if (ok) { await deleteDoc(doc(db, "tasks", id)); toast("Task deleted", "success"); closeModal(); }
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
        notified: false
    };

    if (editing.id) {
        await updateDoc(doc(db, "reminders", editing.id), payload);
        toast("Reminder updated", "success");
    } else {
        await addDoc(collection(db, "reminders"), { ...payload, createdAt: serverTimestamp() });
        toast("Reminder added", "success");
    }
    closeModal();
});

document.getElementById("reminderDeleteBtn").addEventListener("click", async () => {
    const id = editing.id;
    const ok = await confirmDialog("Delete reminder", "This can't be undone.");
    if (ok) { await deleteDoc(doc(db, "reminders", id)); toast("Reminder deleted", "success"); closeModal(); }
});

forms.note.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
        uid: currentUser.uid,
        title: document.getElementById("noteTitle").value.trim(),
        content: document.getElementById("noteContent").value.trim(),
        updatedAt: serverTimestamp()
    };

    if (editing.id) {
        await updateDoc(doc(db, "notes", editing.id), payload);
        toast("Note updated", "success");
    } else {
        await addDoc(collection(db, "notes"), { ...payload, createdAt: serverTimestamp() });
        toast("Note added", "success");
    }
    closeModal();
});

document.getElementById("noteDeleteBtn").addEventListener("click", async () => {
    const id = editing.id;
    const ok = await confirmDialog("Delete note", "This can't be undone.");
    if (ok) { await deleteDoc(doc(db, "notes", id)); toast("Note deleted", "success"); closeModal(); }
});

/* ============================================================
   CONFIRM DIALOG (promise-based)
   ============================================================ */

const confirmOverlay = document.getElementById("confirmOverlay");
let confirmResolve = null;

function confirmDialog(title, body) {
    document.getElementById("confirmTitle").textContent = title;
    document.getElementById("confirmBody").textContent = body;
    confirmOverlay.classList.remove("hidden");
    return new Promise((resolve) => { confirmResolve = resolve; });
}
function closeConfirm(result = false) {
    confirmOverlay.classList.add("hidden");
    if (confirmResolve) { confirmResolve(result); confirmResolve = null; }
}
document.getElementById("confirmOk").addEventListener("click", () => closeConfirm(true));
document.getElementById("confirmCancel").addEventListener("click", () => closeConfirm(false));
confirmOverlay.addEventListener("click", (e) => { if (e.target === confirmOverlay) closeConfirm(false); });

/* ============================================================
   HELPERS
   ============================================================ */

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
}

function matchesSearch(a, b, term) {
    if (!term) return true;
    return `${a || ""} ${b || ""}`.toLowerCase().includes(term);
}

function emptyRow(text) {
    return `<li class="empty">${text}</li>`;
}

function dueChipClass(dueDate) {
    const today = new Date().toISOString().slice(0, 10);
    if (dueDate < today) return "overdue";
    if (dueDate === today) return "soon";
    return "";
}

function formatDue(dueDate) {
    const today = new Date().toISOString().slice(0, 10);
    if (dueDate === today) return "Today";
    const d = new Date(dueDate + "T00:00:00");
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (dueDate === tomorrow.toISOString().slice(0, 10)) return "Tomorrow";
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

/* ============================================================
   LOCATION-BASED REMINDERS (foreground / backgrounded tab)
   ============================================================ */

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
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
}

function fireNotification(title, body) {
    if (Notification.permission === "granted") {
        new Notification(title, { body });
    } else {
        toast(`${title} — ${body}`, "info");
    }
}

/* ============================================================
   PUSH NOTIFICATIONS (works even when Solace is closed)
   ============================================================ */

async function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    try { await navigator.serviceWorker.register("/firebase-messaging-sw.js"); }
    catch (err) { console.warn("Service worker registration failed:", err); }
}

async function enableNotifications() {
    if (!("Notification" in window)) { toast("This browser doesn't support notifications.", "error"); return; }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") { toast("Notifications weren't enabled.", "info"); return; }

    if (!messaging) {
        toast("Push messaging isn't available in this browser — foreground and location reminders still work.", "info");
        return;
    }

    try {
        const token = await getToken(messaging, { vapidKey: VAPID_KEY });
        if (token) {
            await setDoc(doc(db, "users", currentUser.uid), { fcmToken: token }, { merge: true });
            document.getElementById("notifStatus").textContent = "Notifications enabled ✅";
            toast("Notifications enabled", "success");
        }
    } catch (err) {
        console.error(err);
        toast("Couldn't enable push notifications: " + err.message, "error");
    }
}

document.getElementById("enableNotifsSettings").addEventListener("click", enableNotifications);
