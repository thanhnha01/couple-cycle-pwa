import type { User } from "../auth/types";
import type { Couple, Invite, Member, Presence } from "../couple/types";
import type { CyclePrediction, Period } from "../cycle/types";
import type { SyncOperation } from "../sync/types";
import { IndexedDbRepository, type Repository } from "./repository";

export interface Repositories {
  users: Repository<User>;
  couples: Repository<Couple>;
  members: Repository<Member>;
  periods: Repository<Period>;
  invites: Repository<Invite>;
  presence: Repository<Presence>;
  syncOperations: Repository<SyncOperation>;
  cyclePredictions: Repository<CyclePrediction>;
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
    cyclePredictions: new IndexedDbRepository("cyclePredictions"),
  };
}
