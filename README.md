# Solace — a small team dashboard

Auth-gated dashboard for up to 5 people: tasks, notes, time + location reminders,
synced live across devices via Firestore.

## What actually works, and what doesn't

**Works, cross-device, real-time:** tasks, notes, reminders — every signed-in
device sees the same data instantly (Firestore `onSnapshot` listeners).

**Time reminders that fire even when Solace is fully closed:** yes, via
Firebase Cloud Messaging. A scheduled Cloud Function (`functions/index.js`)
checks every 5 minutes for reminders coming due and pushes a system
notification to your phone/laptop. Requires: notifications enabled once
(Settings → Enable Notifications) and the Cloud Function deployed (needs the
Blaze plan — still effectively free at this scale, see below).

**Location reminders:** work reliably while the Solace tab is open, including
backgrounded (switched away, screen off on some devices) — the browser's
`watchPosition` keeps reporting your position and Solace checks distance to
each saved location. **They will not fire if the tab/browser is fully
closed.** No website can do that on any platform — background location access
without an open tab is an OS-level permission that only native mobile apps
can hold. If you need true "closed app" location triggers, that requires
building a native Android/iOS app instead of a website; a web dashboard
can't do it. This build gives you the honest maximum for a website.

## What's in the UI now

- **Kanban board** for tasks (To do / In progress / Done) with drag-and-drop
  between columns, priority dots, due-date chips (overdue/today highlighted)
- **Edit everything** — click any task, reminder, or note to edit it in
  place, not just create/delete
- **Search** on both the Tasks and Notes views
- **Light/dark mode**, toggle in the sidebar or Settings, remembered per
  device
- **Toasts** instead of browser `alert()` popups, plus a proper confirm
  dialog before deletes
- **Week strip** on the dashboard showing which of the next 7 days have
  tasks or reminders due
- **Stat pills + sync indicator** so you always know it's live and how much
  is on your plate
- Fully responsive: collapsible sidebar drawer on mobile, touch-friendly
  targets

## Project structure

```
firebase.json                 hosting/firestore/functions config
firestore.rules                security rules (owner-only data access)
functions/index.js              scheduled Cloud Function for push reminders
public/
├── index.html                  login
├── register.html                sign up (capped at 5 accounts)
├── dashboard.html                main app (dashboard/tasks/reminders/notes/settings)
├── style.css                     design system — tokens, light/dark theme, motion
├── manifest.json                  PWA manifest (lets you "install" it on phone)
├── firebase-messaging-sw.js        service worker, handles push when tab is closed
└── js/
    ├── firebase.js                 Firebase config — put your keys here
    ├── toast.js                     shared toast notification helper
    ├── auth.js, register.js, dashboard.js
```

`firebase.json` points hosting at the `public/` folder — keep every
browser-facing file inside it, since anything outside `public/` won't be
deployed or reachable by the browser.

## Setup

1. **Create a Firebase project** at console.firebase.google.com.
2. **Enable Authentication** → Email/Password and Google sign-in.
3. **Create a Firestore database** (production mode, any region).
4. **Register a Web App** in Project Settings → copy the config object into
   `js/firebase.js` (and mirror the same keys into
   `firebase-messaging-sw.js`).
5. **Cloud Messaging** → Web Push certificates → generate a key pair → paste
   into `VAPID_KEY` in `js/firebase.js`.
6. **Deploy:**
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase init   # select Hosting, Firestore, Functions in an existing project
   firebase deploy
   ```
7. **Upgrade to the Blaze plan** if you want the scheduled push-notification
   function — it's pay-as-you-go but for 5 users checking every 5 minutes
   you'll stay inside Firebase's free monthly quota (2M function
   invocations/month free). Skip this step and everything else (tasks,
   notes, foreground/location reminders) still works fully on the free
   Spark plan.

## The 5-account cap

`register.js` checks the `users` collection count before allowing a new
sign-up. It's enforced client-side for simplicity — fine for a small trusted
group of friends. If you want it server-enforced too, add a Cloud Function
`beforeUserCreated` Auth blocking trigger that rejects the 6th account.

## Extending it

- **App integrations** (Google Calendar, Notion, etc.) — each would be its
  own OAuth flow + Cloud Function; not included here, but the data model
  (uid-scoped Firestore collections) is ready to hang more collections off.
- **Shared/team tasks** — currently everything is owner-only per
  `firestore.rules`. To share a task across the group, add a `sharedWith:
  [uid, uid]` array field and update the rule to `resource.data.uid ==
  request.auth.uid || request.auth.uid in resource.data.sharedWith`.
