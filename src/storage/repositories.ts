import type { User } from "../auth/types";
import type { Couple, Invite, Member, Presence } from "../couple/types";
import type { Period } from "../cycle/types";
import type { SyncOperation } from "../sync/types";
import { IndexedDbRepository, type Repository } from "./repository";

export class StorageUnavailableError extends Error {
  constructor(cause: unknown) {
    super("Local storage is unavailable. Changes cannot be safely saved yet.", { cause });
    this.name = "StorageUnavailableError";
  }
}

export interface Repositories {
  users: Repository<User>;
  couples: Repository<Couple>;
  members: Repository<Member>;
  periods: Repository<Period>;
  invites: Repository<Invite>;
  presence: Repository<Presence>;
  syncOperations: Repository<SyncOperation>;
}

export function createRepositories(): Repositories {
  return {
    users: new IndexedDbRepository("users"),
    couples: new IndexedDbRepository("couples"),
    members: new IndexedDbRepository("members"),
    periods: new IndexedDbRepository("periods"),
    invites: new IndexedDbRepository("invites"),
    presence: new IndexedDbRepository("presence"),
    syncOperations: new IndexedDbRepository("syncOperations"),
  };
}
