import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { firebaseConfig, isFirebaseConfigured } from "./config";

let firebaseApp: FirebaseApp | undefined;

export function getFirebaseApp(): FirebaseApp {
  if (!isFirebaseConfigured) {
    throw new Error("Firebase web configuration is incomplete.");
  }

  firebaseApp ??= getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  return firebaseApp;
}
