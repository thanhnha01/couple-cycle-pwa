export const DATABASE_NAME = "couple-cycle";
export const DATABASE_VERSION = 2;
const LEGACY_CYCLE_PREDICTIONS_STORE = "cyclePredictions";

export const STORE_NAMES = [
  "users",
  "couples",
  "members",
  "periods",
  "invites",
  "presence",
  "syncOperations",
] as const;

export type StoreName = (typeof STORE_NAMES)[number];

let databasePromise: Promise<IDBDatabase> | undefined;

export function openDatabase(): Promise<IDBDatabase> {
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

      request.addEventListener("upgradeneeded", () => {
        const database = request.result;
        // V2 predictions are derived client-side and are no longer persisted.
        // This removes only the obsolete derived-data store from existing installs.
        if (database.objectStoreNames.contains(LEGACY_CYCLE_PREDICTIONS_STORE)) {
          database.deleteObjectStore(LEGACY_CYCLE_PREDICTIONS_STORE);
        }
        for (const storeName of STORE_NAMES) {
          if (!database.objectStoreNames.contains(storeName)) {
            database.createObjectStore(storeName, { keyPath: "id" });
          }
        }
      });

      request.addEventListener("success", () => {
        const database = request.result;
        database.addEventListener("versionchange", () => database.close());
        resolve(database);
      });
      request.addEventListener("error", () => reject(request.error ?? new Error("Could not open IndexedDB.")));
      request.addEventListener("blocked", () => reject(new Error("IndexedDB upgrade is blocked by another tab.")));
    });
  }

  return databasePromise;
}

export function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve());
    transaction.addEventListener("abort", () => reject(transaction.error ?? new Error("IndexedDB transaction aborted.")));
    transaction.addEventListener("error", () => reject(transaction.error ?? new Error("IndexedDB transaction failed.")));
  });
}

export function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error ?? new Error("IndexedDB request failed.")));
  });
}
