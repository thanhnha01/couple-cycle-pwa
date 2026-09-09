import { openDatabase, requestResult, transactionDone, type StoreName } from "./database";

export interface Entity {
  id: string;
}

export interface Repository<T extends Entity> {
  get(id: string): Promise<T | undefined>;
  list(): Promise<T[]>;
  save(entity: T): Promise<void>;
  remove(id: string): Promise<void>;
}

export class IndexedDbRepository<T extends Entity> implements Repository<T> {
  constructor(private readonly storeName: StoreName) {}

  async get(id: string): Promise<T | undefined> {
    const database = await openDatabase();
    const transaction = database.transaction(this.storeName, "readonly");
    return requestResult<T | undefined>(transaction.objectStore(this.storeName).get(id));
  }

  async list(): Promise<T[]> {
    const database = await openDatabase();
    const transaction = database.transaction(this.storeName, "readonly");
    return requestResult<T[]>(transaction.objectStore(this.storeName).getAll());
  }

  async save(entity: T): Promise<void> {
    const database = await openDatabase();
    const transaction = database.transaction(this.storeName, "readwrite");
    transaction.objectStore(this.storeName).put(entity);
    await transactionDone(transaction);
  }

  async remove(id: string): Promise<void> {
    const database = await openDatabase();
    const transaction = database.transaction(this.storeName, "readwrite");
    transaction.objectStore(this.storeName).delete(id);
    await transactionDone(transaction);
  }
}
