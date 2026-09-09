import {
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type User as FirebaseUser,
} from "firebase/auth";
import { getFirebaseAuth } from "../firebase/auth";
import type { AuthErrorObserver, AuthProvider, AuthStateObserver, Unsubscribe } from "./contracts";
import type { AuthUser } from "./types";

function toAuthUser(user: FirebaseUser): AuthUser {
  return {
    uid: user.uid,
    email: user.email ?? "",
    displayName: user.displayName,
  };
}

export class FirebaseAuthProvider implements AuthProvider {
  async register(email: string, password: string): Promise<AuthUser> {
    const credential = await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
    return toAuthUser(credential.user);
  }

  async login(email: string, password: string): Promise<AuthUser> {
    const credential = await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
    return toAuthUser(credential.user);
  }

  async logout(): Promise<void> {
    await signOut(getFirebaseAuth());
  }

  async requestPasswordReset(email: string): Promise<void> {
    await sendPasswordResetEmail(getFirebaseAuth(), email);
  }

  async deleteCurrentUser(): Promise<void> {
    const user = getFirebaseAuth().currentUser;
    if (user) await deleteUser(user);
  }

  observeAuthState(observer: AuthStateObserver, onError: AuthErrorObserver): Unsubscribe {
    return onAuthStateChanged(getFirebaseAuth(), (user) => observer(user ? toAuthUser(user) : null), onError);
  }
}
