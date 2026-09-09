import type { Period } from "../cycle/types";
import { openDatabase, requestResult, transactionDone } from "../storage/database";
import type { SyncOperation } from "./types";
import type { OfflinePeriodStore } from "./offlinePeriodService";

/** IndexedDB adapter. Each user action writes its local projection and outbox item in one transaction. */
export class IndexedDbPeriodStore implements OfflinePeriodStore {
  async listPeriods(coupleId: string): Promise<Period[]> {
    const database = await openDatabase();
    const transaction = database.transaction("periods", "readonly");
    const records = await requestResult<Period[]>(transaction.objectStore("periods").getAll());
    return records.filter((period) => period.coupleId === coupleId);
  }

  async savePeriod(period: Period): Promise<void> { await this.write("periods", (store) => store.put(period)); }
  async removePeriod(id: string): Promise<void> { await this.write("periods", (store) => store.delete(id)); }

  async listOperations(coupleId: string): Promise<SyncOperation[]> {
    const database = await openDatabase();
    const transaction = database.transaction("syncOperations", "readonly");
    const store = transaction.objectStore("syncOperations");
    const records = store.indexNames.contains("byCoupleCreated")
      ? await requestResult<SyncOperation[]>(store.index("byCoupleCreated").getAll(IDBKeyRange.bound([coupleId, -Infinity], [coupleId, Infinity])))
      : await requestResult<SyncOperation[]>(store.getAll());
    return records.filter((operation) => operation.coupleId === coupleId);
  }

  async saveOperation(operation: SyncOperation): Promise<void> { await this.write("syncOperations", (store) => store.put(operation)); }
  async removeOperation(id: string): Promise<void> { await this.write("syncOperations", (store) => store.delete(id)); }

  async persistMutation(period: Period | undefined, removedPeriodId: string | undefined, operation: SyncOperation): Promise<void> {
    const database = await openDatabase();
    const transaction = database.transaction(["periods", "syncOperations"], "readwrite");
    const periods = transaction.objectStore("periods");
    if (period) periods.put(period);
    if (removedPeriodId) periods.delete(removedPeriodId);
    transaction.objectStore("syncOperations").put(operation);
    await transactionDone(transaction);
  }

  private async write(storeName: "periods" | "syncOperations", write: (store: IDBObjectStore) => void): Promise<void> {
    const database = await openDatabase();
    const transaction = database.transaction(storeName, "readwrite");
    write(transaction.objectStore(storeName));
    await transactionDone(transaction);
  }
}
