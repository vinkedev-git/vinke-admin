import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { auth, db, storage } from "@/lib/firebase";

export type MediaLinkedTo =
  | { type: "question"; questionId: string; target: "prompt" }
  | { type: "question"; questionId: string; target: "option"; optionId: string }
  | { type: "none" };

export type UploadMediaArgs = {
  file: File;
  folder:
    | "admin_uploads/midias"
    | "questionsBank/prompt"
    | "questionsBank/options";
  origin: "midias" | "questionsBank";
  linkedTo?: MediaLinkedTo;
};

export async function uploadMediaAndRegister(args: UploadMediaArgs) {
  const user = auth.currentUser;
  if (!user) throw new Error("Usuário não autenticado.");

  const ext = args.file.name.split(".").pop()?.toLowerCase() || "png";
  const filename = `${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;
  const path = `${args.folder}/${filename}`;

  // 1) upload no storage
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, args.file, {
    contentType: args.file.type || undefined,
  });

  // 2) url
  const url = await getDownloadURL(storageRef);

  // 3) doc em midias
  const docRef = await addDoc(collection(db, "midias"), {
    url,
    path,
    origin: args.origin,
    linkedTo: args.linkedTo ?? { type: "none" },
    createdAt: serverTimestamp(),
    createdBy: user.uid,
    filename: args.file.name,
    contentType: args.file.type || null,
    size: args.file.size || null,
  });

  return {
    mediaId: docRef.id,
    url,
    path,
  };
}