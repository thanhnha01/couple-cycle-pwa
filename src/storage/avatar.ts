import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { getFirebaseApp } from "../firebase/app";
import { getStorage } from "firebase/storage";

const MAX_BYTES = 5 * 1024 * 1024;
const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);

async function resize(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Không thể nén ảnh.")), "image/webp", .84));
}

export async function uploadAvatar(uid: string, file: File, previousUrl?: string): Promise<string> {
  if (!uid || !allowed.has(file.type) || file.size > MAX_BYTES) throw new Error("Ảnh cần là JPG, PNG hoặc WebP và nhỏ hơn 5MB.");
  const storage = getStorage(getFirebaseApp());
  const target = ref(storage, `users/${uid}/avatar/profile.webp`);
  await uploadBytes(target, await resize(file), { contentType: "image/webp", cacheControl: "public,max-age=3600" });
  const url = await getDownloadURL(target);
  if (previousUrl && previousUrl !== url) { try { await deleteObject(ref(storage, previousUrl)); } catch { /* old file may already be gone */ } }
  return url;
}
