"use client";

import AdminShell from "@/components/AdminShell";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, Upload } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SearchInput } from "@/components/ui/SearchInput";
import { Modal } from "@/components/ui/Modal";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import {
  addDoc, collection, deleteDoc, doc, endBefore, getDocs,
  limit, limitToLast, orderBy, query, serverTimestamp,
  startAfter, updateDoc, QueryDocumentSnapshot, DocumentData,
} from "firebase/firestore";
import { deleteObject, getDownloadURL, ref as storageRef, uploadBytesResumable } from "firebase/storage";
import { db, storage, auth } from "@/lib/firebase";

type MediaType = "image";

type MediaDoc = {
  id: string;
  type: MediaType;
  url: string;
  storagePath?: string | null;
  name?: string | null;
  contentType?: string | null;
  size?: number | null;
  source?: "storage" | "external";
  createdAt?: unknown;
  updatedAt?: unknown;
  createdBy?: string | null;
};

const PAGE_SIZE = 24;

function bytesToLabel(n?: number | null) {
  if (!n || n <= 0) return "—";
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

export default function MidiasPage() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const { dialog: confirmDialog, confirm } = useConfirm();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<MediaDoc[]>([]);
  const [cursorStack, setCursorStack] = useState<QueryDocumentSnapshot<DocumentData>[]>([]);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<number>(0);
  const [urlInput, setUrlInput] = useState("");
  const [addingUrl, setAddingUrl] = useState(false);
  const [openPreview, setOpenPreview] = useState(false);
  const [selected, setSelected] = useState<MediaDoc | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchFirst = async () => {
    setLoading(true);
    try {
      const qRef = query(collection(db, "midias"), orderBy("createdAt", "desc"), limit(PAGE_SIZE));
      const snap = await getDocs(qRef);
      setItems(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MediaDoc, "id">) })));
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
      setCursorStack((prev) => [...prev, lastDoc]);
      setItems(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MediaDoc, "id">) })));
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
      setCursorStack((prev) => prev.slice(0, -1));
      setItems(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MediaDoc, "id">) })));
      setLastDoc(snap.docs[snap.docs.length - 1] ?? null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchFirst(); }, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return items;
    return items.filter((m) =>
      m.id.toLowerCase().includes(s) ||
      (m.name || "").toLowerCase().includes(s) ||
      (m.url || "").toLowerCase().includes(s)
    );
  }, [items, search]);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Envie apenas imagens (png/jpg/webp).");
      return;
    }
    const MAX_MB = 8;
    if (file.size > MAX_MB * 1024 * 1024) {
      toast.error(`Arquivo muito grande. Máximo: ${MAX_MB}MB.`);
      return;
    }
    setUploading(true);
    setProgress(0);
    try {
      const uid = auth.currentUser?.uid || null;
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const path = `admin_uploads/midias/${id}_${safeName}`;
      const ref = storageRef(storage, path);
      const task = uploadBytesResumable(ref, file, { contentType: file.type });

      await new Promise<void>((resolve, reject) => {
        task.on("state_changed",
          (snap) => setProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
          reject,
          async () => resolve()
        );
      });

      const url = await getDownloadURL(ref);
      await addDoc(collection(db, "midias"), {
        type: "image", url, storagePath: path, source: "storage",
        name: file.name, contentType: file.type, size: file.size,
        createdBy: uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      toast.success("Imagem enviada com sucesso.");
      await fetchFirst();
    } catch (e: unknown) {
      toast.error((e instanceof Error ? e.message : null) || "Falha no upload. Verifique as permissões do Storage.");
    } finally {
      setUploading(false);
      setProgress(0);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const addByUrl = async () => {
    const u = urlInput.trim();
    if (!u) return;
    try { new URL(u); } catch { toast.error("URL inválida."); return; }

    setAddingUrl(true);
    try {
      const uid = auth.currentUser?.uid || null;
      await addDoc(collection(db, "midias"), {
        type: "image", url: u, storagePath: null, source: "external",
        name: null, contentType: null, size: null,
        createdBy: uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      setUrlInput("");
      toast.success("URL salva.");
      await fetchFirst();
    } catch (e: unknown) {
      toast.error((e instanceof Error ? e.message : null) || "Não foi possível salvar a URL.");
    } finally {
      setAddingUrl(false);
    }
  };

  const copy = async (text: string, label = "URL") => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copiada!`);
    } catch {
      toast.error("Não foi possível copiar. Copie manualmente.");
    }
  };

  const openPreviewModal = (m: MediaDoc) => { setSelected(m); setOpenPreview(true); };
  const closePreview = () => { setOpenPreview(false); setSelected(null); };

  const deleteMedia = async (m: MediaDoc) => {
    const ok = await confirm({
      title: "Deletar esta mídia?",
      description: "Essa ação remove o arquivo do Storage e o registro. Não pode ser desfeita.",
      confirmLabel: "Deletar",
      variant: "danger",
    });
    if (!ok) return;

    setDeletingId(m.id);
    try {
      await deleteDoc(doc(db, "midias", m.id));
      if (m.storagePath) await deleteObject(storageRef(storage, m.storagePath));
      toast.success("Mídia deletada.");
      closePreview();
      await fetchFirst();
    } catch (e: unknown) {
      toast.error((e instanceof Error ? e.message : null) || "Não foi possível deletar. Verifique as permissões.");
      await fetchFirst();
    } finally {
      setDeletingId(null);
    }
  };

  const navBtns = (
    <div className="flex gap-2">
      <Button variant="secondary" size="sm" onClick={() => void fetchPrev()} disabled={loading || cursorStack.length === 0}>Anterior</Button>
      <Button variant="secondary" size="sm" onClick={() => void fetchNext()} disabled={loading || !lastDoc}>Próxima</Button>
    </div>
  );

  return (
    <AdminShell
      title="Mídias"
      subtitle="Biblioteca de imagens — upload no Storage + registro no Firestore."
      actions={
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => void fetchFirst()} loading={loading && cursorStack.length === 0}>
            <RefreshCw size={14} /> Atualizar
          </Button>
          <Button variant="primary" size="sm" onClick={() => fileRef.current?.click()} loading={uploading}>
            <Upload size={14} /> {uploading ? `Enviando ${progress}%` : "Enviar imagem"}
          </Button>
        </div>
      }
    >
      {confirmDialog}

      <input ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }} />

      {/* KPIs */}
      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Carregadas nesta página</div>
          <div className="mt-2 text-2xl font-black text-slate-900 dark:text-slate-50">{items.length}</div>
          <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">Limite por página: {PAGE_SIZE}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Exibidas (após busca)</div>
          <div className="mt-2 text-2xl font-black text-slate-900 dark:text-slate-50">{filtered.length}</div>
          <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">Busca na página atual</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Legenda</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge tone="blue">Copiar URL</Badge>
            <Badge tone="slate">Preview</Badge>
            <Badge tone="red">Deletar</Badge>
          </div>
        </div>
      </div>

      {/* Filtros + add URL */}
      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="grid grid-cols-1 items-end gap-3 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">Buscar</label>
            <SearchInput value={search} onChange={setSearch} placeholder="ID, nome do arquivo, URL..." />
          </div>
          <div className="lg:col-span-2">
            <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">Adicionar por URL</label>
            <div className="flex gap-2">
              <input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void addByUrl()}
                placeholder="Cole uma URL https://..."
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
              <Button variant="secondary" size="sm" onClick={() => void addByUrl()} loading={addingUrl}>Salvar</Button>
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <div className="text-xs text-slate-500 dark:text-slate-400">Página: <b>{cursorStack.length + 1}</b></div>
          {navBtns}
        </div>
      </div>

      {/* Grid */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="text-sm font-extrabold text-slate-900 dark:text-slate-50">Biblioteca</div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Clique em uma mídia para abrir o preview e ações.</div>
        </div>

        {loading ? (
          <div className="px-5 py-8 text-sm text-slate-500 dark:text-slate-400">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-8 text-sm text-slate-500 dark:text-slate-400">Nenhuma mídia encontrada.</div>
        ) : (
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((m) => (
              <button
                key={m.id}
                onClick={() => openPreviewModal(m)}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-left transition hover:bg-slate-50/50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700/50"
              >
                <div className="aspect-[4/3] overflow-hidden border-b border-slate-100 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.url} alt={m.name || m.id} className="h-full w-full object-cover" />
                </div>
                <div className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate text-sm font-extrabold text-slate-900 dark:text-slate-100">
                      {m.name ?? (m.source === "external" ? "URL externa" : "Imagem")}
                    </div>
                    {m.source === "storage" ? <Badge tone="green">Storage</Badge> : <Badge tone="slate">URL</Badge>}
                  </div>
                  <div className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">ID: {m.id}</div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="text-xs text-slate-600 dark:text-slate-400">{bytesToLabel(m.size)}</div>
                    <div className="text-xs text-slate-600 dark:text-slate-400">{m.contentType || "image"}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs text-slate-500 dark:text-slate-400">Exibidas: <b>{filtered.length}</b></div>
          {navBtns}
        </div>
      </div>

      {/* Modal preview */}
      <Modal
        open={openPreview}
        title={selected ? `Mídia (${selected.id})` : "Mídia"}
        size="lg"
        onClose={closePreview}
      >
        {!selected ? (
          <div className="text-sm text-slate-500">Nada selecionado.</div>
        ) : (
          <div className="space-y-4">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={selected.url} alt={selected.name || selected.id} className="max-h-[520px] w-full bg-white object-contain" />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
                <div className="mb-2 text-xs font-extrabold text-slate-700 dark:text-slate-300">Detalhes</div>
                <div className="space-y-1 text-sm text-slate-700 dark:text-slate-300">
                  <div><b>Nome:</b> {selected.name || "—"}</div>
                  <div><b>Tipo:</b> {selected.contentType || "—"}</div>
                  <div><b>Tamanho:</b> {bytesToLabel(selected.size)}</div>
                  <div><b>Origem:</b> {selected.source || "—"}</div>
                  <div className="pt-2">
                    <b>URL:</b>
                    <div className="mt-1 break-all text-xs text-slate-500 dark:text-slate-400">{selected.url}</div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
                <div className="mb-2 text-xs font-extrabold text-slate-700 dark:text-slate-300">Ações</div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" onClick={() => void copy(selected.url, "URL")}>
                    Copiar URL
                  </Button>
                  {selected.storagePath && (
                    <Button variant="secondary" size="sm" onClick={() => void copy(selected.storagePath!, "Storage Path")}>
                      Copiar Storage Path
                    </Button>
                  )}
                  <Button
                    variant="danger"
                    size="sm"
                    loading={deletingId === selected.id}
                    onClick={() => void deleteMedia(selected)}
                  >
                    Deletar
                  </Button>
                </div>
                <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
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
