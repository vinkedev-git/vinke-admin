"use client";

import AdminShell from "@/components/AdminShell";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  endBefore,
  getDocs,
  limit,
  limitToLast,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  updateDoc,
  QueryDocumentSnapshot,
  DocumentData,
} from "firebase/firestore";
import { deleteObject, getDownloadURL, ref as storageRef, uploadBytesResumable } from "firebase/storage";
import { db, storage, auth } from "@/lib/firebase";

type MediaType = "image";

type MediaDoc = {
  id: string;
  type: MediaType;
  url: string;

  // se veio do Storage, guardamos o caminho pra conseguir deletar
  storagePath?: string | null;

  // metadados
  name?: string | null;
  contentType?: string | null;
  size?: number | null;

  source?: "storage" | "external";

  createdAt?: any;
  updatedAt?: any;
  createdBy?: string | null;
};

const PAGE_SIZE = 24;

function cn(...xs: Array<string | false | undefined | null>) {
  return xs.filter(Boolean).join(" ");
}

function bytesToLabel(n?: number | null) {
  if (!n || n <= 0) return "—";
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
}

export default function MidiasPage() {
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<MediaDoc[]>([]);
  const [cursorStack, setCursorStack] = useState<QueryDocumentSnapshot<DocumentData>[]>([]);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);

  const [search, setSearch] = useState("");

  // upload
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // add by url
  const [urlInput, setUrlInput] = useState("");
  const [addingUrl, setAddingUrl] = useState(false);

  // preview / delete modal
  const [openPreview, setOpenPreview] = useState(false);
  const [selected, setSelected] = useState<MediaDoc | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchFirst = async () => {
    setLoading(true);
    try {
      const qRef = query(collection(db, "midias"), orderBy("createdAt", "desc"), limit(PAGE_SIZE));
      const snap = await getDocs(qRef);

      const rows: MediaDoc[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      setItems(rows);
      setLastDoc(snap.docs[snap.docs.length - 1] ?? null);
      setCursorStack([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchNext = async () => {
    if (!lastDoc) return;
    setLoading(true);
    try {
      const qRef = query(collection(db, "midias"), orderBy("createdAt", "desc"), startAfter(lastDoc), limit(PAGE_SIZE));
      const snap = await getDocs(qRef);
      const rows: MediaDoc[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

      setCursorStack((prev) => [...prev, lastDoc]);
      setItems(rows);
      setLastDoc(snap.docs[snap.docs.length - 1] ?? null);
    } finally {
      setLoading(false);
    }
  };

  const fetchPrev = async () => {
    const prevCursor = cursorStack[cursorStack.length - 1];
    if (!prevCursor) return;

    setLoading(true);
    try {
      const qRef = query(collection(db, "midias"), orderBy("createdAt", "desc"), endBefore(prevCursor), limitToLast(PAGE_SIZE));
      const snap = await getDocs(qRef);
      const rows: MediaDoc[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

      setCursorStack((prev) => prev.slice(0, -1));
      setItems(rows);
      setLastDoc(snap.docs[snap.docs.length - 1] ?? null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFirst();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return items;

    return items.filter((m) => {
      const idOk = m.id.toLowerCase().includes(s);
      const nameOk = (m.name || "").toLowerCase().includes(s);
      const urlOk = (m.url || "").toLowerCase().includes(s);
      return idOk || nameOk || urlOk;
    });
  }, [items, search]);

  const pickFile = () => fileRef.current?.click();

  const handleFile = async (file: File) => {
    setErrorMsg(null);

    if (!file.type.startsWith("image/")) {
      setErrorMsg("Envie apenas imagens (png/jpg/webp).");
      return;
    }

    // limite opcional (ajusta se quiser)
    const MAX_MB = 8;
    if (file.size > MAX_MB * 1024 * 1024) {
      setErrorMsg(`Arquivo muito grande. Máximo recomendado: ${MAX_MB}MB.`);
      return;
    }

    setUploading(true);
    setProgress(0);

    try {
      const uid = auth.currentUser?.uid || null;

      const ext = file.name.split(".").pop()?.toLowerCase() || "img";
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const path = `admin_uploads/midias/${id}_${safeName}`;

      const ref = storageRef(storage, path);
      const task = uploadBytesResumable(ref, file, { contentType: file.type });

      await new Promise<void>((resolve, reject) => {
        task.on(
          "state_changed",
          (snap) => {
            const pct = (snap.bytesTransferred / snap.totalBytes) * 100;
            setProgress(Math.round(pct));
          },
          (err) => reject(err),
          async () => resolve()
        );
      });

      const url = await getDownloadURL(ref);

      // grava no Firestore (coleção "midias")
      await addDoc(collection(db, "midias"), {
        type: "image",
        url,
        storagePath: path,
        source: "storage",
        name: file.name,
        contentType: file.type,
        size: file.size,
        createdBy: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await fetchFirst();
    } catch (e: any) {
      setErrorMsg(e?.message || "Falha no upload. Verifique Storage Rules/permissões.");
    } finally {
      setUploading(false);
      setProgress(0);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const addByUrl = async () => {
    setErrorMsg(null);
    const u = urlInput.trim();
    if (!u) return;

    // validação simples de URL
    try {
      // eslint-disable-next-line no-new
      new URL(u);
    } catch {
      setErrorMsg("URL inválida.");
      return;
    }

    setAddingUrl(true);
    try {
      const uid = auth.currentUser?.uid || null;

      await addDoc(collection(db, "midias"), {
        type: "image",
        url: u,
        storagePath: null,
        source: "external",
        name: null,
        contentType: null,
        size: null,
        createdBy: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setUrlInput("");
      await fetchFirst();
    } catch (e: any) {
      setErrorMsg(e?.message || "Não foi possível salvar a URL.");
    } finally {
      setAddingUrl(false);
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      alert("Não foi possível copiar. Copie manualmente.");
    }
  };

  const openPreviewModal = (m: MediaDoc) => {
    setSelected(m);
    setOpenPreview(true);
  };

  const closePreview = () => {
    setOpenPreview(false);
    setSelected(null);
  };

  const deleteMedia = async (m: MediaDoc) => {
    const ok = confirm("Tem certeza que deseja deletar esta mídia? Essa ação não pode ser desfeita.");
    if (!ok) return;

    setDeletingId(m.id);
    setErrorMsg(null);

    try {
      // 1) apaga Firestore
      await deleteDoc(doc(db, "midias", m.id));

      // 2) se veio do Storage, apaga o arquivo também
      if (m.storagePath) {
        await deleteObject(storageRef(storage, m.storagePath));
      }

      // 3) refresh
      closePreview();
      await fetchFirst();
    } catch (e: any) {
      setErrorMsg(e?.message || "Não foi possível deletar. Verifique permissões/regras.");
      // tenta re-sincronizar
      await fetchFirst();
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <AdminShell
      title="Mídias"
      subtitle="Biblioteca de imagens (upload no Storage + registro no Firestore)."
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={fetchFirst}
            className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Atualizar
          </button>

          <button
            onClick={pickFile}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            disabled={uploading}
          >
            {uploading ? `Enviando… ${progress}%` : "Enviar imagem"}
          </button>
        </div>
      }
    >
      {/* hidden file input */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />

      {/* topo info */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="rounded-2xl border bg-white p-4">
          <div className="text-xs font-semibold text-slate-500">Carregadas nesta página</div>
          <div className="mt-2 text-2xl font-black text-slate-900">{items.length}</div>
          <div className="mt-1 text-sm text-slate-500">Limite por página: {PAGE_SIZE}</div>
        </div>

        <div className="rounded-2xl border bg-white p-4">
          <div className="text-xs font-semibold text-slate-500">Exibidas (após busca)</div>
          <div className="mt-2 text-2xl font-black text-slate-900">{filtered.length}</div>
          <div className="mt-1 text-sm text-slate-500">Busca na página atual</div>
        </div>

        <div className="rounded-2xl border bg-white p-4">
          <div className="text-xs font-semibold text-slate-500">Atalhos</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge tone="blue">Copiar URL</Badge>
            <Badge tone="slate">Preview</Badge>
            <Badge tone="red">Deletar</Badge>
          </div>
        </div>
      </div>

      {/* filtros + add url */}
      <div className="rounded-2xl border bg-white p-4 mb-4">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 items-end">
          <div className="lg:col-span-3">
            <div className="text-xs font-semibold text-slate-600 mb-1">Buscar</div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ID, nome do arquivo, URL…"
              className="w-full rounded-xl border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>

          <div className="lg:col-span-2">
            <div className="text-xs font-semibold text-slate-600 mb-1">Adicionar por URL (opcional)</div>
            <div className="flex gap-2">
              <input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="Cole uma URL https://..."
                className="w-full rounded-xl border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-200"
              />
              <button
                onClick={addByUrl}
                disabled={addingUrl}
                className="rounded-xl border bg-white px-4 py-3 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60"
              >
                {addingUrl ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        </div>

        {errorMsg ? <div className="mt-3 text-sm text-rose-700">{errorMsg}</div> : null}

        <div className="mt-3 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            Página atual: <b>{cursorStack.length + 1}</b>
          </div>
          <div className="flex gap-2">
            <button
              onClick={fetchPrev}
              disabled={loading || cursorStack.length === 0}
              className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              onClick={fetchNext}
              disabled={loading || !lastDoc}
              className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              Próxima
            </button>
          </div>
        </div>
      </div>

      {/* grid */}
      <div className="rounded-2xl border bg-white overflow-hidden">
        <div className="px-5 py-4 border-b">
          <div className="text-sm font-extrabold text-slate-900">Biblioteca</div>
          <div className="text-xs text-slate-500 mt-0.5">Clique em uma mídia para abrir o preview e ações.</div>
        </div>

        {loading ? (
          <div className="px-5 py-8 text-sm text-slate-500">Carregando…</div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-8 text-sm text-slate-500">Nenhuma mídia encontrada.</div>
        ) : (
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((m) => (
              <button
                key={m.id}
                onClick={() => openPreviewModal(m)}
                className="text-left rounded-2xl border bg-white hover:bg-slate-50/50 transition overflow-hidden"
              >
                <div className="aspect-[4/3] bg-slate-50 border-b overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.url} alt={m.name || m.id} className="h-full w-full object-cover" />
                </div>

                <div className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-extrabold text-slate-900 truncate">
                      {m.name ? m.name : m.source === "external" ? "URL externa" : "Imagem"}
                    </div>
                    {m.source === "storage" ? <Badge tone="green">Storage</Badge> : <Badge tone="slate">URL</Badge>}
                  </div>

                  <div className="mt-1 text-xs text-slate-500 truncate">ID: {m.id}</div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="text-xs text-slate-600">{bytesToLabel(m.size)}</div>
                    <div className="text-xs text-slate-600">{m.contentType || "image"}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="px-5 py-4 border-t bg-white flex items-center justify-between">
          <div className="text-xs text-slate-500">
            Exibidas: <b>{filtered.length}</b>
          </div>

          <div className="flex gap-2">
            <button
              onClick={fetchPrev}
              disabled={loading || cursorStack.length === 0}
              className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              onClick={fetchNext}
              disabled={loading || !lastDoc}
              className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              Próxima
            </button>
          </div>
        </div>
      </div>

      {/* Preview modal */}
      <Modal
        open={openPreview}
        title={selected ? `Mídia (${selected.id})` : "Mídia"}
        onClose={closePreview}
      >
        {!selected ? (
          <div className="text-sm text-slate-500">Nada selecionado.</div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-2xl border bg-slate-50 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={selected.url} alt={selected.name || selected.id} className="w-full max-h-[520px] object-contain bg-white" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-2xl border bg-white p-4">
                <div className="text-xs font-extrabold text-slate-700 mb-2">Detalhes</div>
                <div className="text-sm text-slate-700 space-y-1">
                  <div><b>Nome:</b> {selected.name || "—"}</div>
                  <div><b>Tipo:</b> {selected.contentType || "—"}</div>
                  <div><b>Tamanho:</b> {bytesToLabel(selected.size)}</div>
                  <div><b>Origem:</b> {selected.source || "—"}</div>
                  <div className="pt-2">
                    <b>URL:</b>
                    <div className="mt-1 text-xs text-slate-500 break-all">{selected.url}</div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border bg-white p-4">
                <div className="text-xs font-extrabold text-slate-700 mb-2">Ações</div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => copy(selected.url)}
                    className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
                  >
                    Copiar URL
                  </button>

                  {selected.storagePath ? (
                    <button
                      onClick={() => copy(selected.storagePath!)}
                      className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
                    >
                      Copiar Storage Path
                    </button>
                  ) : null}

                  <button
                    onClick={() => void deleteMedia(selected)}
                    disabled={deletingId === selected.id}
                    className={cn(
                      "rounded-xl px-4 py-2 text-sm font-semibold text-white",
                      "bg-rose-600 hover:bg-rose-700",
                      deletingId === selected.id ? "opacity-60 cursor-wait" : ""
                    )}
                  >
                    {deletingId === selected.id ? "Deletando…" : "Deletar"}
                  </button>
                </div>

                <div className="mt-3 text-xs text-slate-500">
                  Dica: use a URL copiada na criação/edição de questões (enunciado/alternativas).
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </AdminShell>
  );
}