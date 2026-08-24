import { auth, db } from "@/lib/firebase";
import { addDoc, collection, getDocs, limit, orderBy, query, serverTimestamp } from "firebase/firestore";

export type QuestionMediaKind = "prompt" | "option" | "attachment";

export type QuestionGalleryItem = {
  id: string;
  url: string;
  label?: string | null;
  name?: string | null;
};

function safeExt(name: string) {
  const ext = (name.split(".").pop() || "jpg").toLowerCase();
  if (!/^[a-z0-9]+$/.test(ext)) return "jpg";
  if (ext.length > 6) return "jpg";
  return ext;
}

export async function uploadQuestionAsset(file: File, folder: string) {
  const ext = safeExt(file.name);
  const safeFile = new File([file], file.name.includes(".") ? file.name : `${file.name}.${ext}`, {
    type: file.type || "application/octet-stream",
  });

  const token = await auth.currentUser?.getIdToken();
  if (!token) {
    throw new Error("Sessão inválida. Faça login novamente.");
  }

  const formData = new FormData();
  formData.append("file", safeFile);
  formData.append("folder", folder);

  const res = await fetch("/api/admin/questions/upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    url?: string;
    path?: string;
  };

  if (!res.ok || !data.ok || !data.url || !data.path) {
    throw new Error(data.error || "Falha no upload da imagem.");
  }

  return { url: data.url, path: data.path };
}

export async function registerQuestionMedia(params: {
  url: string;
  path: string;
  origin?: string;
  kind: QuestionMediaKind;
  label?: string;
}) {
  await addDoc(collection(db, "midias"), {
    url: params.url,
    path: params.path,
    origin: params.origin || "questionsBank",
    kind: params.kind,
    label: params.label || null,
    createdAt: serverTimestamp(),
  });
}

export async function loadQuestionMediaGallery(maxItems = 24): Promise<QuestionGalleryItem[]> {
  const snap = await getDocs(
    query(collection(db, "midias"), orderBy("createdAt", "desc"), limit(maxItems))
  );

  return snap.docs
    .map((item) => ({
      id: item.id,
      url: String(item.data().url ?? ""),
      label: (item.data().label as string | null) ?? null,
      name: (item.data().name as string | null) ?? null,
    }))
    .filter((item) => item.url);
}
