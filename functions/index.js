// Deploy with: firebase deploy --only functions
// Requires the Blaze (pay-as-you-go) plan — scheduled functions don't run
// on the free Spark plan. For 5 users checking every 5 minutes, real-world
// cost is effectively $0/month; it stays inside Firebase's free quota.

const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();
const db = getFirestore();

// Runs every 5 minutes. Finds time-based reminders due in the next 5
// minutes that haven't been notified yet, and pushes an FCM notification
// to the owning user's registered device token.
exports.checkReminders = onSchedule("every 5 minutes", async () => {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + 5 * 60 * 1000);

    const snap = await db
        .collection("reminders")
        .where("type", "in", ["time", "both"])
        .where("notified", "==", false)
        .get();

    const due = snap.docs.filter((docSnap) => {
        const dt = docSnap.data().datetime;
        if (!dt) return false;
        const when = new Date(dt);
        return when >= now && when <= windowEnd;
    });

    if (due.length === 0) return;

    const userCache = new Map();

    for (const reminderDoc of due) {
        const reminder = reminderDoc.data();

        if (!userCache.has(reminder.uid)) {
            const userDoc = await db.collection("users").doc(reminder.uid).get();
            userCache.set(reminder.uid, userDoc.exists ? userDoc.data() : null);
        }
        const user = userCache.get(reminder.uid);

        if (user?.fcmToken) {
            try {
                await getMessaging().send({
                    token: user.fcmToken,
                    notification: {
                        title: "Solace reminder",
                        body: reminder.title
                    },
                    data: { reminderId: reminderDoc.id }
                });
            } catch (err) {
                console.error(`Push failed for ${reminder.uid}:`, err.message);
            }
        }

        await reminderDoc.ref.update({ notified: true });
    }
});
