// src/lib/uploadQuestionImage.ts
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "@/lib/firebase";

/**
 * Faz upload no Firebase Storage e retorna a URL pública (downloadURL).
 * @param file Arquivo selecionado
 * @param pathPrefix Pasta base (ex: "questionsBank")
 */
export async function uploadQuestionImage(file: File, pathPrefix = "questionsBank") {
  const safeName = file.name.replace(/\s+/g, "_").toLowerCase();
  const path = `${pathPrefix}/${Date.now()}_${crypto.randomUUID()}_${safeName}`;

  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);
  return url;
}