import { sendDueEventReminders } from "./reminders.js";
import { deleteApp, getApps } from "firebase-admin/app";

void sendDueEventReminders()
  .then(async ({ sent, skipped }) => {
    console.log(`Nhịp Đôi reminders complete: ${sent} sent, ${skipped} duplicate runs skipped.`);
    await Promise.all(getApps().map((app) => deleteApp(app)));
  })
  .catch(async (error: unknown) => {
    console.error("Nhịp Đôi reminder run failed.", error);
    await Promise.all(getApps().map((app) => deleteApp(app)));
    process.exitCode = 1;
  });
