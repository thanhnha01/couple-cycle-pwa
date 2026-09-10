const preferenceKey = "nhip-doi:notification-permission-asked";

export function notificationState(): NotificationPermission | "unsupported" {
  return "Notification" in window ? Notification.permission : "unsupported";
}

export async function askForNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!("Notification" in window)) return "unsupported";
  localStorage.setItem(preferenceKey, "true");
  return Notification.requestPermission();
}

export function hasAskedForNotifications(): boolean {
  try { return localStorage.getItem(preferenceKey) === "true"; } catch { return false; }
}
