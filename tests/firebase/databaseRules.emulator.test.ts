import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import rules from "../../database.rules.json";

const PROJECT_ID = "demo-couple-cycle";
const OWNER_A = { uid: "owner-a", email: "a@example.com" };
const OWNER_B = { uid: "owner-b", email: "b@example.com" };
const JOINER_B = { uid: "joiner-b", email: "joiner-b@example.com" };
const JOINER_C = { uid: "joiner-c", email: "joiner-c@example.com" };
const OUTSIDER = { uid: "outsider", email: "outsider@example.com" };
const TOKEN_A = "A".repeat(43);
const TOKEN_B = "B".repeat(43);
const TOKEN_C = "C".repeat(43);
const serverTimestamp = { ".sv": "timestamp" } as const;

type TestUser = { uid: string; email: string };

let testEnvironment: RulesTestEnvironment;

function databaseFor(user?: TestUser) {
  return user
    ? testEnvironment.authenticatedContext(user.uid, { email: user.email }).database()
    : testEnvironment.unauthenticatedContext().database();
}

function profile(displayName = "Alice", email = OWNER_A.email): Record<string, unknown> {
  return { displayName, email, createdAt: serverTimestamp, updatedAt: serverTimestamp };
}

function activeInvite(code: string, expiresAt: number): Record<string, unknown> {
  return { code, active: true, createdAt: serverTimestamp, expiresAt };
}

function activeLookup(coupleId: string, expiresAt: number): Record<string, unknown> {
  return { coupleId, active: true, createdAt: serverTimestamp, expiresAt };
}

async function createCouple(owner: TestUser, token = TOKEN_A, name = "Our space"): Promise<number> {
  const expiresAt = Date.now() + 60 * 60 * 1_000;
  const database = databaseFor(owner);
  await assertSucceeds(database.ref().update({
    [`couples/${owner.uid}`]: {
      profile: { name, createdAt: serverTimestamp, ownerUid: owner.uid, memberCount: 1 },
      members: { [owner.uid]: { role: "owner", joinedAt: serverTimestamp } },
      invite: activeInvite(token, expiresAt),
    },
    [`inviteLookups/${token}`]: activeLookup(owner.uid, expiresAt),
  }));
  await assertSucceeds(database.ref(`users/${owner.uid}/coupleId`).set(owner.uid));
  return expiresAt;
}

async function createClaim(user: TestUser, coupleId: string, token: string): Promise<void> {
  await assertSucceeds(databaseFor(user).ref(`inviteClaims/${user.uid}`).set({
    coupleId,
    code: token,
    createdAt: serverTimestamp,
  }));
}

function redemptionUpdate(user: TestUser, coupleId: string, token: string, role = "member") {
  return databaseFor(user).ref().update({
    [`couples/${coupleId}/profile/memberCount`]: 2,
    [`couples/${coupleId}/members/${user.uid}`]: { role, joinedAt: serverTimestamp },
    [`couples/${coupleId}/invite/active`]: false,
    [`couples/${coupleId}/invite/redeemedBy`]: user.uid,
    [`couples/${coupleId}/invite/redeemedAt`]: serverTimestamp,
    [`couples/${coupleId}/invite/redemptionProof`]: token,
  });
}

async function redeem(user: TestUser, coupleIdValue: string, token: string): Promise<void> {
  await createClaim(user, coupleIdValue, token);
  await assertSucceeds(redemptionUpdate(user, coupleIdValue, token));
  await assertSucceeds(databaseFor(user).ref(`users/${user.uid}/coupleId`).set(coupleIdValue));
  const redeemedAt = await databaseFor(user).ref(`couples/${coupleIdValue}/invite/redeemedAt`).once("value");
  await assertSucceeds(databaseFor(user).ref(`inviteLookups/${token}`).update({
    active: false,
    redeemedBy: user.uid,
    redeemedAt: redeemedAt.val(),
  }));
}

async function seed(path: string, value: unknown): Promise<void> {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await context.database().ref(path).set(value);
  });
}

async function readValueAsAdmin(path: string): Promise<unknown> {
  let value: unknown;
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    value = (await context.database().ref(path).once("value")).val();
  });
  return value;
}

beforeAll(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    database: { host: "127.0.0.1", port: 9000, rules: JSON.stringify(rules) },
  });
});

afterEach(async () => {
  await testEnvironment.clearDatabase();
});

afterAll(async () => {
  await testEnvironment.cleanup();
});

describe("profile authorization and schema", () => {
  it("denies anonymous profile reads and writes", async () => {
    const anonymous = databaseFor();
    await assertFails(anonymous.ref("users/owner-a/profile").once("value"));
    await assertFails(anonymous.ref("users/owner-a/profile").set(profile()));
  });

  it("allows an authenticated user to manage only their valid profile", async () => {
    const own = databaseFor(OWNER_A).ref(`users/${OWNER_A.uid}/profile`);
    await assertSucceeds(own.set(profile()));
    await assertSucceeds(own.once("value"));
    await assertFails(databaseFor(OWNER_A).ref(`users/${OWNER_B.uid}/profile`).once("value"));
    await assertFails(own.set({ ...profile(), role: "owner" }));
  });

  it("keeps profile email and timestamps server-controlled", async () => {
    const own = databaseFor(OWNER_A).ref(`users/${OWNER_A.uid}/profile`);
    await assertFails(own.set(profile("Alice", "other@example.com")));
    await assertFails(own.set({ ...profile(), createdAt: 1 }));
    await assertSucceeds(own.set(profile()));
    await assertFails(own.update({ createdAt: 1, updatedAt: serverTimestamp }));
    await assertFails(own.update({ updatedAt: 1 }));
    await assertSucceeds(own.update({ displayName: "Alice Updated", updatedAt: serverTimestamp }));
  });
});

describe("couple creation", () => {
  it("creates a couple with its creator as the only owner and validates the association", async () => {
    await createCouple(OWNER_A);
    const value = await readValueAsAdmin(`couples/${OWNER_A.uid}`) as Record<string, unknown>;
    expect(value.members).toMatchObject({ [OWNER_A.uid]: { role: "owner" } });
    expect(await databaseFor(OWNER_A).ref(`users/${OWNER_A.uid}/coupleId`).once("value").then((snapshot) => snapshot.val())).toBe(OWNER_A.uid);
  });

  it("denies anonymous creation", async () => {
    const expiresAt = Date.now() + 60_000;
    await assertFails(databaseFor().ref(`couples/${OWNER_A.uid}`).set({
      profile: { name: "Our space", createdAt: serverTimestamp, ownerUid: OWNER_A.uid, memberCount: 1 },
      members: { [OWNER_A.uid]: { role: "owner", joinedAt: serverTimestamp } },
      invite: activeInvite(TOKEN_A, expiresAt),
    }));
  });

  it("does not accept a client-selected creator role or additional fields", async () => {
    const expiresAt = Date.now() + 60_000;
    const base = {
      profile: { name: "Our space", createdAt: serverTimestamp, ownerUid: OWNER_A.uid, memberCount: 1 },
      invite: activeInvite(TOKEN_A, expiresAt),
    };
    await assertFails(databaseFor(OWNER_A).ref(`couples/${OWNER_A.uid}`).set({
      ...base,
      members: { [OWNER_A.uid]: { role: "member", joinedAt: serverTimestamp } },
    }));
    await assertFails(databaseFor(OWNER_A).ref(`couples/${OWNER_A.uid}`).set({
      ...base,
      members: { [OWNER_A.uid]: { role: "owner", joinedAt: serverTimestamp, admin: true } },
    }));
    await assertFails(databaseFor(OWNER_A).ref(`couples/${OWNER_A.uid}`).set({
      ...base,
      members: {
        [OWNER_A.uid]: { role: "owner", joinedAt: serverTimestamp },
        outsider: { role: "member", joinedAt: serverTimestamp },
      },
    }));
  });

  it("rejects duplicate creation without leaving an orphaned lookup", async () => {
    await createCouple(OWNER_A);
    const expiresAt = Date.now() + 60_000;
    await assertFails(databaseFor(OWNER_A).ref().update({
      [`couples/${OWNER_A.uid}`]: {
        profile: { name: "Duplicate", createdAt: serverTimestamp, ownerUid: OWNER_A.uid, memberCount: 1 },
        members: { [OWNER_A.uid]: { role: "owner", joinedAt: serverTimestamp } },
        invite: activeInvite(TOKEN_B, expiresAt),
      },
      [`inviteLookups/${TOKEN_B}`]: activeLookup(OWNER_A.uid, expiresAt),
    }));
    expect(await readValueAsAdmin(`inviteLookups/${TOKEN_B}`)).toBeNull();
  });

  it("prevents assigning an arbitrary couple association", async () => {
    await assertFails(databaseFor(OUTSIDER).ref(`users/${OUTSIDER.uid}/coupleId`).set(OWNER_A.uid));
  });
});

describe("invite redemption", () => {
  it("accepts a valid invite, forces member role, and preserves the owner", async () => {
    await createCouple(OWNER_A);
    await redeem(JOINER_B, OWNER_A.uid, TOKEN_A);
    const value = await readValueAsAdmin(`couples/${OWNER_A.uid}`) as {
      members: Record<string, { role: string }>;
      invite: { active: boolean; redeemedBy: string };
    };
    expect(value.members[OWNER_A.uid]?.role).toBe("owner");
    expect(value.members[JOINER_B.uid]?.role).toBe("member");
    expect(value.invite.active).toBe(false);
    expect(value.invite.redeemedBy).toBe(JOINER_B.uid);
  });

  it("denies joiner attempts to self-assign owner or add arbitrary JSON", async () => {
    await createCouple(OWNER_A);
    await createClaim(JOINER_B, OWNER_A.uid, TOKEN_A);
    await assertFails(redemptionUpdate(JOINER_B, OWNER_A.uid, TOKEN_A, "owner"));
    await assertFails(databaseFor(JOINER_B).ref().update({
      [`couples/${OWNER_A.uid}/profile/memberCount`]: 2,
      [`couples/${OWNER_A.uid}/members/${JOINER_B.uid}`]: { role: "member", joinedAt: serverTimestamp, admin: true },
      [`couples/${OWNER_A.uid}/invite/active`]: false,
      [`couples/${OWNER_A.uid}/invite/redeemedBy`]: JOINER_B.uid,
      [`couples/${OWNER_A.uid}/invite/redeemedAt`]: serverTimestamp,
      [`couples/${OWNER_A.uid}/invite/redemptionProof`]: TOKEN_A,
      [`inviteLookups/${TOKEN_A}/active`]: false,
      [`inviteLookups/${TOKEN_A}/redeemedBy`]: JOINER_B.uid,
      [`inviteLookups/${TOKEN_A}/redeemedAt`]: serverTimestamp,
    }));
  });

  it("rejects wrong, expired, inactive, and replayed invites", async () => {
    await createCouple(OWNER_A);
    await assertFails(databaseFor(JOINER_B).ref(`inviteClaims/${JOINER_B.uid}`).set({ coupleId: OWNER_B.uid, code: TOKEN_A, createdAt: serverTimestamp }));

    await seed(`couples/${OWNER_A.uid}/invite/expiresAt`, Date.now() - 1_000);
    await seed(`inviteLookups/${TOKEN_A}/expiresAt`, Date.now() - 1_000);
    await assertFails(databaseFor(JOINER_B).ref(`inviteClaims/${JOINER_B.uid}`).set({ coupleId: OWNER_A.uid, code: TOKEN_A, createdAt: serverTimestamp }));

    await seed(`couples/${OWNER_A.uid}/invite`, { code: TOKEN_A, active: false, createdAt: 1, expiresAt: 2, redeemedBy: JOINER_C.uid, redeemedAt: 2, redemptionProof: TOKEN_A });
    await seed(`inviteLookups/${TOKEN_A}`, { coupleId: OWNER_A.uid, active: false, createdAt: 1, expiresAt: 2, redeemedBy: JOINER_C.uid, redeemedAt: 2 });
    await assertFails(databaseFor(JOINER_B).ref(`inviteClaims/${JOINER_B.uid}`).set({ coupleId: OWNER_A.uid, code: TOKEN_A, createdAt: serverTimestamp }));
    await assertFails(redemptionUpdate(JOINER_B, OWNER_A.uid, TOKEN_A));
  });

  it("denies anonymous redemption", async () => {
    await createCouple(OWNER_A);
    await assertFails(databaseFor().ref(`inviteClaims/${JOINER_B.uid}`).set({ coupleId: OWNER_A.uid, code: TOKEN_A, createdAt: serverTimestamp }));
    await assertFails(databaseFor().ref().update({
      [`couples/${OWNER_A.uid}/members/${JOINER_B.uid}`]: { role: "member", joinedAt: serverTimestamp },
      [`couples/${OWNER_A.uid}/invite/active`]: false,
    }));
  });

  it("allows exactly one of two concurrent redemptions", async () => {
    await createCouple(OWNER_A);
    await Promise.all([createClaim(JOINER_B, OWNER_A.uid, TOKEN_A), createClaim(JOINER_C, OWNER_A.uid, TOKEN_A)]);
    const results = await Promise.allSettled([
      redemptionUpdate(JOINER_B, OWNER_A.uid, TOKEN_A),
      redemptionUpdate(JOINER_C, OWNER_A.uid, TOKEN_A),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const members = await readValueAsAdmin(`couples/${OWNER_A.uid}/members`) as Record<string, unknown>;
    expect(Object.keys(members)).toHaveLength(2);
    const invite = await readValueAsAdmin(`couples/${OWNER_A.uid}/invite`) as { redeemedBy: string };
    expect([JOINER_B.uid, JOINER_C.uid]).toContain(invite.redeemedBy);
  });

  it("rejects a third member even with a matching active invite", async () => {
    await createCouple(OWNER_A);
    await redeem(JOINER_B, OWNER_A.uid, TOKEN_A);
    const expiresAt = Date.now() + 60_000;
    await seed(`couples/${OWNER_A.uid}/invite`, { code: TOKEN_C, active: true, createdAt: Date.now(), expiresAt });
    await seed(`inviteLookups/${TOKEN_C}`, { coupleId: OWNER_A.uid, active: true, createdAt: Date.now(), expiresAt });
    await createClaim(JOINER_C, OWNER_A.uid, TOKEN_C);
    await assertFails(redemptionUpdate(JOINER_C, OWNER_A.uid, TOKEN_C));
    const members = await readValueAsAdmin(`couples/${OWNER_A.uid}/members`) as Record<string, unknown>;
    expect(Object.keys(members)).toHaveLength(2);
  });
});

describe("role immutability and invite ownership", () => {
  it("prevents a member changing either role through direct SDK writes", async () => {
    await createCouple(OWNER_A);
    await redeem(JOINER_B, OWNER_A.uid, TOKEN_A);
    const memberDatabase = databaseFor(JOINER_B);
    await assertFails(memberDatabase.ref(`couples/${OWNER_A.uid}/members/${JOINER_B.uid}/role`).set("owner"));
    await assertFails(memberDatabase.ref(`couples/${OWNER_A.uid}/members/${OWNER_A.uid}/role`).set("member"));
  });

  it("lets the owner regenerate and atomically invalidates the old invite", async () => {
    const expiresAt = await createCouple(OWNER_A);
    const nextExpiry = expiresAt + 1_000;
    await assertSucceeds(databaseFor(OWNER_A).ref().update({
      [`couples/${OWNER_A.uid}/invite`]: activeInvite(TOKEN_B, nextExpiry),
      [`inviteLookups/${TOKEN_A}/active`]: false,
      [`inviteLookups/${TOKEN_A}/invalidatedBy`]: OWNER_A.uid,
      [`inviteLookups/${TOKEN_A}/invalidatedAt`]: serverTimestamp,
      [`inviteLookups/${TOKEN_B}`]: activeLookup(OWNER_A.uid, nextExpiry),
    }));
    const oldLookup = await databaseFor(JOINER_B).ref(`inviteLookups/${TOKEN_A}`).once("value");
    expect(oldLookup.child("active").val()).toBe(false);
    await assertFails(databaseFor(JOINER_B).ref(`inviteClaims/${JOINER_B.uid}`).set({ coupleId: OWNER_A.uid, code: TOKEN_A, createdAt: serverTimestamp }));
    await assertSucceeds(databaseFor(JOINER_B).ref(`inviteClaims/${JOINER_B.uid}`).set({ coupleId: OWNER_A.uid, code: TOKEN_B, createdAt: serverTimestamp }));
  });

  it("does not let a non-owner regenerate an invite", async () => {
    await createCouple(OWNER_A);
    await redeem(JOINER_B, OWNER_A.uid, TOKEN_A);
    const expiresAt = Date.now() + 60_000;
    await seed(`couples/${OWNER_A.uid}/invite`, { code: TOKEN_B, active: true, createdAt: Date.now(), expiresAt });
    await seed(`inviteLookups/${TOKEN_B}`, { coupleId: OWNER_A.uid, active: true, createdAt: Date.now(), expiresAt });
    await assertFails(databaseFor(JOINER_B).ref(`couples/${OWNER_A.uid}/invite`).set(activeInvite(TOKEN_C, expiresAt)));
  });
});

describe("cross-couple authorization", () => {
  it("denies reads, writes, and invite changes across couples", async () => {
    await createCouple(OWNER_A, TOKEN_A, "Couple A");
    await createCouple(OWNER_B, TOKEN_B, "Couple B");
    const userA = databaseFor(OWNER_A);
    await assertFails(userA.ref(`couples/${OWNER_B.uid}/profile`).once("value"));
    await assertFails(userA.ref(`couples/${OWNER_B.uid}/members`).once("value"));
    await assertFails(userA.ref(`couples/${OWNER_B.uid}/profile/name`).set("Compromised"));
    await assertFails(userA.ref(`couples/${OWNER_B.uid}/invite/active`).set(false));
    await assertSucceeds(userA.ref(`couples/${OWNER_A.uid}/profile`).once("value"));
  });
});

describe("shared period permissions", () => {
  const periodValue = (uid: string) => ({
    startDate: "2026-09-09",
    endDate: "2026-09-13",
    createdAt: serverTimestamp,
    createdBy: uid,
    updatedAt: serverTimestamp,
    updatedBy: uid,
    revision: 1,
    mutationId: "period:p1:create:1",
  });

  it("allows both members to create, read, update, and delete periods while denying outsiders", async () => {
    await createCouple(OWNER_A);
    await redeem(JOINER_B, OWNER_A.uid, TOKEN_A);
    const path = `couples/${OWNER_A.uid}/periods/p1`;
    await assertSucceeds(databaseFor(OWNER_A).ref(path).set(periodValue(OWNER_A.uid)));
    await assertSucceeds(databaseFor(JOINER_B).ref(path).once("value"));
    await assertSucceeds(databaseFor(JOINER_B).ref(path).update({ updatedAt: serverTimestamp, updatedBy: JOINER_B.uid, revision: 2, mutationId: "period:p1:update:2" }));
    await assertSucceeds(databaseFor(JOINER_B).ref(path).remove());
    await assertFails(databaseFor(OUTSIDER).ref(`couples/${OWNER_A.uid}/periods/p2`).set(periodValue(OUTSIDER.uid)));
    await assertFails(databaseFor(OUTSIDER).ref(`couples/${OWNER_A.uid}/periods`).once("value"));
  });
});
