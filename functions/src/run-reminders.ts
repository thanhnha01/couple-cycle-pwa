import { sendDailyAndMilestoneReminders, sendDueEventReminders } from "./reminders.js";
import { deleteApp, getApps } from "firebase-admin/app";

void Promise.all([sendDueEventReminders(), sendDailyAndMilestoneReminders()])
  .then(async ([events, daily]) => {
    console.log(`Nhịp Đôi reminders complete: ${events.sent + daily.sent} sent, ${events.skipped} duplicate runs skipped.`);
    await Promise.all(getApps().map((app) => deleteApp(app)));
  })
  .catch(async (error: unknown) => {
    console.error("Nhịp Đôi reminder run failed.", error);
    await Promise.all(getApps().map((app) => deleteApp(app)));
    process.exitCode = 1;
  });
