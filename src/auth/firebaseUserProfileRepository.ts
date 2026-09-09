import { ref, serverTimestamp, set } from "firebase/database";
import { getFirebaseDatabase } from "../firebase/database";
import type { UserProfileRepository } from "./contracts";

export class FirebaseUserProfileRepository implements UserProfileRepository {
  async create(uid: string, profile: { displayName: string; email: string }): Promise<void> {
    await set(ref(getFirebaseDatabase(), `users/${uid}/profile`), {
      displayName: profile.displayName,
      email: profile.email,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}
