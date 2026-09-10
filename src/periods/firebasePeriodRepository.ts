import { get, ref, runTransaction, serverTimestamp, type DataSnapshot } from "firebase/database";
import type { Period } from "../cycle/types";
import { getFirebaseDatabase } from "../firebase/database";
import { calendarDate, timestamp } from "../utils/date";
import type { PeriodInput, PeriodRepository } from "./types";

export class FirebasePeriodRepository implements PeriodRepository {
  async list(coupleId: string): Promise<Period[]> {
    const snapshot = await get(ref(getFirebaseDatabase(), `couples/${coupleId}/periods`));
    const records: Period[] = [];
    snapshot.forEach((child) => { records.push(parsePeriod(coupleId, child)); });
    return records.sort((left, right) => right.startDate.localeCompare(left.startDate) || right.id.localeCompare(left.id));
  }

  async create(period: Period, operationId?: string): Promise<void> {
    const target = ref(getFirebaseDatabase(), `couples/${period.coupleId}/periods/${period.id}`);
    const mutationId = operationId ?? `period:${period.id}:create:1`;
    const result = await runTransaction(target, (current: unknown) => {
      if (current === null) return storedPeriod(period, mutationId);
      if (isStoredPeriod(current) && current.mutationId === mutationId) return current;
      return;
    });
    if (!result.committed && !(isStoredPeriod(result.snapshot.val()) && result.snapshot.val().mutationId === mutationId)) {
      throw new Error("Dữ liệu chu kỳ này đã được cập nhật theo cách khác. Hãy tải lại để xem phiên bản mới nhất.");
    }
  }

  async update(coupleId: string, periodId: string, input: PeriodInput, expectedRevision: number, updatedBy: string, operationId?: string): Promise<Period> {
    const target = ref(getFirebaseDatabase(), `couples/${coupleId}/periods/${periodId}`);
    const mutationId = operationId ?? `period:${periodId}:update:${expectedRevision + 1}`;
    const result = await runTransaction(target, (current: unknown) => {
      if (!isStoredPeriod(current)) return;
      if (current.mutationId === mutationId) return current;
      if (current.revision !== expectedRevision) return;
      return {
        ...current,
        startDate: input.startDate,
        endDate: input.endDate,
        updatedAt: serverTimestamp(),
        updatedBy,
        revision: expectedRevision + 1,
        mutationId,
      };
    });
    if (!result.committed && !(isStoredPeriod(result.snapshot.val()) && result.snapshot.val().mutationId === mutationId)) throw new Error("This period changed on another device. Reload and resolve the conflict.");
    return parsePeriod(coupleId, result.snapshot);
  }

  async remove(coupleId: string, periodId: string, expectedRevision?: number, _operationId?: string): Promise<void> {
    const target = ref(getFirebaseDatabase(), `couples/${coupleId}/periods/${periodId}`);
    const result = await runTransaction(target, (current: unknown) => {
      if (current === null) return;
      if (!isStoredPeriod(current) || (expectedRevision !== undefined && current.revision !== expectedRevision)) return;
      return null;
    });
    if (!result.committed && result.snapshot.exists()) throw new Error("This period changed on another device. Reload and resolve the conflict.");
  }
}

interface StoredPeriod {
  startDate: unknown;
  endDate: unknown;
  createdAt: unknown;
  createdBy: unknown;
  updatedAt: unknown;
  updatedBy: unknown;
  revision: unknown;
  mutationId?: unknown;
}

function storedPeriod(period: Period, operationId?: string): Record<string, unknown> {
  return {
    startDate: period.startDate, endDate: period.endDate, createdAt: serverTimestamp(), createdBy: period.createdBy,
    updatedAt: serverTimestamp(), updatedBy: period.updatedBy, revision: 1, mutationId: operationId ?? null,
  };
}

function isStoredPeriod(value: unknown): value is StoredPeriod {
  return typeof value === "object" && value !== null && "revision" in value;
}

function parsePeriod(coupleId: string, snapshot: DataSnapshot): Period {
  const value = snapshot.val() as StoredPeriod | null;
  if (!value || typeof value.startDate !== "string" || typeof value.endDate !== "string" || typeof value.createdAt !== "number" || typeof value.createdBy !== "string" || typeof value.updatedAt !== "number" || typeof value.updatedBy !== "string" || typeof value.revision !== "number") {
    throw new Error("A stored period is invalid.");
  }
  return {
    id: snapshot.key ?? "",
    coupleId,
    startDate: calendarDate(value.startDate),
    endDate: calendarDate(value.endDate),
    createdAt: timestamp(value.createdAt),
    createdBy: value.createdBy,
    updatedAt: timestamp(value.updatedAt),
    updatedBy: value.updatedBy,
    revision: value.revision,
  };
}
