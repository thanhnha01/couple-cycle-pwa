import { getDatabase, type Database } from "firebase/database";
import { getFirebaseApp } from "./app";

let firebaseDatabase: Database | undefined;

export function getFirebaseDatabase(): Database {
  firebaseDatabase ??= getDatabase(getFirebaseApp());
  return firebaseDatabase;
}
