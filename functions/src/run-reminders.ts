import { sendDueEventReminders } from "./reminders.js";

void sendDueEventReminders()
  .then(({ sent, skipped }) => console.log(`Nhịp Đôi reminders complete: ${sent} sent, ${skipped} duplicate runs skipped.`))
  .catch((error: unknown) => {
    console.error("Nhịp Đôi reminder run failed.", error);
    process.exitCode = 1;
  });
