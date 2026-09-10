import { getToken, isSupported, onMessage } from "firebase/messaging";
import { ref, serverTimestamp, set } from "firebase/database";
import { getFirebaseApp } from "../firebase/app";
import { getFirebaseDatabase } from "../firebase/database";

function tokenKey(token: string): string {
  return btoa(encodeURIComponent(token)).replaceAll("=", "").replaceAll("+", "-").replaceAll("/", "_");
}

export async function enableFirebasePush(coupleId: string, uid: string): Promise<"enabled" | "unsupported" | "missing-vapid"> {
  if (!await isSupported()) return "unsupported";
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;
  if (!vapidKey) return "missing-vapid";
  const registration = await navigator.serviceWorker.ready;
  const { getMessaging } = await import("firebase/messaging");
  const messaging = getMessaging(getFirebaseApp());
  const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
  if (!token) throw new Error("Không thể tạo mã nhận thông báo cho thiết bị này.");
  await set(ref(getFirebaseDatabase(), `couples/${coupleId}/notificationTokens/${uid}/${tokenKey(token)}`), {
    token, updatedAt: serverTimestamp(),
  });
  onMessage(messaging, (payload) => {
    const title = payload.notification?.title ?? "Nhịp Đôi";
    const body = payload.notification?.body ?? "Bạn có một lời nhắc mới.";
    if (Notification.permission === "granted") new Notification(title, { body, icon: "./icons/icon-192.svg" });
  });
  return "enabled";
}
