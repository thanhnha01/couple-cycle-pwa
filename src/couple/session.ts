import type { Unsubscribe } from "../auth/contracts";
import type { CoupleApplicationService } from "./contracts";
import type { CoupleMembership } from "./types";
import type { CoupleProfile } from "./types";

export type CoupleSessionState =
  | { status: "initializing" }
  | { status: "unlinked" }
  | { status: "linked"; membership: CoupleMembership }
  | { status: "error" };

export class CoupleSessionStore {
  private state: CoupleSessionState = { status: "initializing" };
  private readonly listeners = new Set<(state: CoupleSessionState) => void>();
  private loadSequence = 0;

  constructor(private readonly couples: CoupleApplicationService) {}

  get snapshot(): CoupleSessionState {
    return this.state;
  }

  async load(uid: string): Promise<void> {
    const sequence = ++this.loadSequence;
    this.update({ status: "initializing" });
    try {
      const membership = await this.couples.findMembership(uid);
      if (sequence !== this.loadSequence) return;
      this.update(membership ? { status: "linked", membership } : { status: "unlinked" });
    } catch {
      if (sequence === this.loadSequence) this.update({ status: "error" });
    }
  }

  setMembership(membership: CoupleMembership): void {
    this.loadSequence += 1;
    this.update({ status: "linked", membership });
  }

  updateProfile(profile: CoupleProfile): void {
    if (this.state.status !== "linked") return;
    this.update({ status: "linked", membership: { ...this.state.membership, profile } });
  }

  reset(): void {
    this.loadSequence += 1;
    this.update({ status: "initializing" });
  }

  subscribe(listener: (state: CoupleSessionState) => void): Unsubscribe {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private update(state: CoupleSessionState): void {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }
}
