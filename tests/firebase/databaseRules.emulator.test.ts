import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import rules from "../../database.rules.json";

const PROJECT_ID = "demo-couple-cycle";
const USER_A = { uid: "A", email: "a@example.com" };
const USER_B = { uid: "B", email: "b@example.com" };
const serverTimestamp = { ".sv": "timestamp" } as const;

let testEnvironment: RulesTestEnvironment;

function profile(displayName = "Alice", email = USER_A.email): Record<string, unknown> {
  return {
    displayName,
    email,
    createdAt: serverTimestamp,
    updatedAt: serverTimestamp,
  };
}

function databaseFor(user?: { uid: string; email: string }) {
  return user
    ? testEnvironment.authenticatedContext(user.uid, { email: user.email }).database()
    : testEnvironment.unauthenticatedContext().database();
}

async function seedProfile(uid: string, value: Record<string, unknown>): Promise<void> {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await context.database().ref(`users/${uid}/profile`).set(value);
  });
}

beforeAll(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    database: {
      host: "127.0.0.1",
      port: 9000,
      rules: JSON.stringify(rules),
    },
  });
});

afterEach(async () => {
  await testEnvironment.clearDatabase();
});

afterAll(async () => {
  await testEnvironment.cleanup();
});

describe("Realtime Database authorization", () => {
  it("denies anonymous reads and writes under users", async () => {
    const anonymous = databaseFor();
    await assertFails(anonymous.ref("users/A/profile").once("value"));
    await assertFails(anonymous.ref("users/A/profile").set(profile()));
  });

  it("allows User A to read their own profile", async () => {
    await seedProfile("A", { displayName: "Alice", email: USER_A.email, createdAt: 1, updatedAt: 1 });
    const snapshot = await assertSucceeds(databaseFor(USER_A).ref("users/A/profile").once("value"));
    expect(snapshot.val()).toMatchObject({ displayName: "Alice", email: USER_A.email });
  });

  it("allows User A to write valid profile data with server timestamps", async () => {
    const reference = databaseFor(USER_A).ref("users/A/profile");
    await assertSucceeds(reference.set(profile()));
    const value = (await reference.once("value")).val() as Record<string, unknown>;
    expect(value.displayName).toBe("Alice");
    expect(value.createdAt).toEqual(expect.any(Number));
    expect(value.updatedAt).toEqual(expect.any(Number));
  });

  it("prevents User A from reading or writing User B's profile", async () => {
    await seedProfile("B", { displayName: "Bob", email: USER_B.email, createdAt: 1, updatedAt: 1 });
    const userA = databaseFor(USER_A);
    await assertFails(userA.ref("users/B/profile").once("value"));
    await assertFails(userA.ref("users/B/profile").set(profile("Alice", USER_A.email)));
  });
});

describe("Realtime Database profile schema", () => {
  it("rejects unknown fields", async () => {
    await assertFails(databaseFor(USER_A).ref("users/A/profile").set({ ...profile(), role: "owner" }));
  });

  it.each([
    ["displayName", 42],
    ["email", 42],
    ["createdAt", "not-a-timestamp"],
    ["updatedAt", "not-a-timestamp"],
  ])("rejects an invalid %s type", async (field, value) => {
    await assertFails(databaseFor(USER_A).ref("users/A/profile").set({ ...profile(), [field]: value }));
  });

  it("enforces server-controlled creation timestamps", async () => {
    const reference = databaseFor(USER_A).ref("users/A/profile");
    await assertFails(reference.set({ ...profile(), createdAt: 1 }));
    await assertSucceeds(reference.set(profile()));
    await assertFails(reference.update({ createdAt: 1, updatedAt: serverTimestamp }));
  });

  it("enforces a server-controlled timestamp on updates", async () => {
    const reference = databaseFor(USER_A).ref("users/A/profile");
    await assertSucceeds(reference.set(profile()));
    await assertSucceeds(reference.update({ displayName: "Alice Updated", updatedAt: serverTimestamp }));
    await assertFails(reference.update({ updatedAt: 1 }));
  });

  it("requires the profile email to match the authenticated email claim", async () => {
    const reference = databaseFor(USER_A).ref("users/A/profile");
    await assertFails(reference.set(profile("Alice", "other@example.com")));
    const withoutEmailClaim = testEnvironment.authenticatedContext(USER_A.uid).database();
    await assertFails(withoutEmailClaim.ref("users/A/profile").set(profile()));
    await assertSucceeds(reference.set(profile()));
  });
});
