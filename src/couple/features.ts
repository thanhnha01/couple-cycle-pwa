export interface Memory { id: string; title: string; note: string; date: string; createdAt: number; }
export interface ChecklistItem { id: string; title: string; done: boolean; }
export interface CoupleFeatures { memories: Memory[]; checklist: ChecklistItem[]; }
const defaults = ["Nấu một bữa ăn cùng nhau", "Đi xem bình minh", "Viết thư tay cho nhau", "Cùng học một điều mới", "Tạo một album ảnh chung"];
const key = (coupleId: string) => `nhip-doi:features:${coupleId}`;
export class CoupleFeatureService {
  private read(coupleId: string): CoupleFeatures { try { const parsed = JSON.parse(localStorage.getItem(key(coupleId)) ?? "null") as CoupleFeatures | null; return parsed ?? { memories: [], checklist: defaults.map((title, index) => ({ id: `default-${index}`, title, done: false })) }; } catch { return { memories: [], checklist: [] }; } }
  private write(coupleId: string, value: CoupleFeatures): void { try { localStorage.setItem(key(coupleId), JSON.stringify(value)); } catch { /* optional offline cache */ } }
  list(coupleId: string): CoupleFeatures { return this.read(coupleId); }
  addMemory(coupleId: string, title: string, note: string, date: string): void { const value = this.read(coupleId); value.memories.unshift({ id: crypto.randomUUID(), title: title.trim(), note: note.trim(), date, createdAt: Date.now() }); this.write(coupleId, value); }
  toggleChecklist(coupleId: string, id: string): void { const value = this.read(coupleId); const item = value.checklist.find((entry) => entry.id === id); if (item) item.done = !item.done; this.write(coupleId, value); }
}
