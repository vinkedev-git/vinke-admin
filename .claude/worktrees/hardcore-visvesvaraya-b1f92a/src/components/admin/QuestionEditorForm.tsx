"use client";

import { cn } from "@/lib/cn";
import {
  loadQuestionMediaGallery,
  registerQuestionMedia,
  uploadQuestionAsset,
  type QuestionGalleryItem,
} from "@/lib/questionMedia";
import { Button } from "@/components/ui/Button";
import { auth } from "@/lib/firebase";
import { useEffect, useMemo, useRef, useState } from "react";
import { RichTextEditor } from "@/components/admin/RichTextEditor";

export type QuestionOption = {
  id: "A" | "B" | "C" | "D" | "E";
  text: string;
  imageUrl?: string | null;
  imageWidth?: number | null;
};

export type QuestionAttachment = {
  id: string;
  label: string;
  url: string;
};

export type QuestionCatalogOption = {
  id: string;
  title: string;
  code: string;
  status: "ativo" | "inativo";
  levelId?: string | null;
  levelLabel?: string | null;
};

export type QuestionFormState = {
  prompt: string;
  explanation: string;
  examId: string;
  examType: string;
  levelId: string;
  level: string;
  examYear: string;
  themes: string[];
  themeIds: string[];
  isActive: boolean;
  imageUrl: string;
  promptImageWidth: number;
  reference: string;
  internalNote: string;
  commentAttachments: QuestionAttachment[];
  options: QuestionOption[];
  correctOptionId: QuestionOption["id"];
  shuffleOptions: boolean;
};

type QuestionDocLike = {
  prompt?: string;
  prompt_text?: string;
  explanation?: string;
  imageUrl?: string | null;
  promptImageWidth?: number | null;
  options?: QuestionOption[];
  optionA_text?: string;
  optionA_imageUrl?: string | null;
  optionA_imageWidth?: number | null;
  optionB_text?: string;
  optionB_imageUrl?: string | null;
  optionB_imageWidth?: number | null;
  optionC_text?: string;
  optionC_imageUrl?: string | null;
  optionC_imageWidth?: number | null;
  optionD_text?: string;
  optionD_imageUrl?: string | null;
  optionD_imageWidth?: number | null;
  optionE_text?: string;
  optionE_imageUrl?: string | null;
  optionE_imageWidth?: number | null;
  correctOptionId?: QuestionOption["id"];
  shuffleOptions?: boolean;
  examId?: string | null;
  examType?: string;
  prova_tipo?: string;
  levelId?: string | null;
  level?: string;
  nivel?: string;
  examYear?: number | null;
  prova_ano?: number | null;
  themes?: string[];
  themeIds?: string[];
  isActive?: boolean;
  reference?: string;
  internalNote?: string;
  commentAttachments?: QuestionAttachment[];
  statement?: string;
  questionText?: string;
};

type QuestionEditorFormProps = {
  mode: "create" | "edit";
  initialValue: QuestionFormState;
  onCancel: () => void;
  onSubmit: (payload: ReturnType<typeof buildQuestionPayload>, form: QuestionFormState) => Promise<void>;
  onDelete?: () => Promise<void> | void;
};

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}



export function buildProofLabel(examType: string, examYear: string) {
  const normalizedType = examType.trim();
  const normalizedYear = examYear.trim();
  if (!normalizedType && !normalizedYear) return "";
  return normalizedYear ? `(${normalizedType}-${normalizedYear})` : `(${normalizedType})`;
}

const REQUIRED_OPTION_IDS = ["A", "B", "C", "D"] as const;

function clampImageWidth(value: unknown, fallback = 100) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(100, Math.max(20, Math.round(parsed)));
}

function createBaseOptions(): QuestionOption[] {
  return REQUIRED_OPTION_IDS.map((id) => ({ id, text: "", imageUrl: "", imageWidth: 100 }));
}

function normalizeQuestionOptions(
  options: QuestionOption[],
  correctOptionId?: QuestionOption["id"]
): QuestionOption[] {
  const optionMap = new Map(
    options.map((option) => [
      option.id,
      {
        id: option.id,
        text: String(option.text ?? ""),
        imageUrl: String(option.imageUrl ?? ""),
        imageWidth: clampImageWidth(option.imageWidth, 100),
      },
    ])
  );

  const normalized = REQUIRED_OPTION_IDS.map(
    (id) => optionMap.get(id) ?? { id, text: "", imageUrl: "", imageWidth: 100 }
  );

  const optionalE = optionMap.get("E");
  const shouldIncludeE =
    Boolean(optionalE?.text?.trim()) ||
    Boolean(optionalE?.imageUrl?.trim()) ||
    correctOptionId === "E";

  if (shouldIncludeE) {
    normalized.push(optionalE ?? { id: "E", text: "", imageUrl: "", imageWidth: 100 });
  }

  return normalized;
}

export function createEmptyQuestionForm(): QuestionFormState {
  return {
    prompt: "",
    explanation: "",
    examId: "",
    examType: "TSA",
    levelId: "",
    level: "R1",
    examYear: "",
    themes: [],
    themeIds: [],
    isActive: true,
    imageUrl: "",
    promptImageWidth: 100,
    reference: "",
    internalNote: "",
    commentAttachments: [],
    options: createBaseOptions(),
    correctOptionId: "A",
    shuffleOptions: true,
  };
}

export function questionDocToForm(data: QuestionDocLike): QuestionFormState {
  const prompt = (
    data.prompt ??
    data.prompt_text ??
    data.questionText ??
    data.statement ??
    ""
  ).toString();

  const options: QuestionOption[] =
    Array.isArray(data.options) && data.options.length
      ? data.options.map((item) => ({
          id: item.id,
          text: item.text ?? "",
          imageUrl: item.imageUrl ?? "",
          imageWidth: clampImageWidth(item.imageWidth, 100),
        }))
      : [
          {
            id: "A",
            text: String(data.optionA_text ?? ""),
            imageUrl: String(data.optionA_imageUrl ?? ""),
            imageWidth: clampImageWidth(data.optionA_imageWidth, 100),
          },
          {
            id: "B",
            text: String(data.optionB_text ?? ""),
            imageUrl: String(data.optionB_imageUrl ?? ""),
            imageWidth: clampImageWidth(data.optionB_imageWidth, 100),
          },
          {
            id: "C",
            text: String(data.optionC_text ?? ""),
            imageUrl: String(data.optionC_imageUrl ?? ""),
            imageWidth: clampImageWidth(data.optionC_imageWidth, 100),
          },
          {
            id: "D",
            text: String(data.optionD_text ?? ""),
            imageUrl: String(data.optionD_imageUrl ?? ""),
            imageWidth: clampImageWidth(data.optionD_imageWidth, 100),
          },
          {
            id: "E",
            text: String(data.optionE_text ?? ""),
            imageUrl: String(data.optionE_imageUrl ?? ""),
            imageWidth: clampImageWidth(data.optionE_imageWidth, 100),
          },
        ];

  const correctOptionId = (data.correctOptionId ?? "A") as QuestionOption["id"];

  return {
    prompt,
    explanation: (data.explanation ?? "").toString(),
    examId: (data.examId ?? "").toString(),
    examType: (data.examType ?? data.prova_tipo ?? "").toString(),
    levelId: (data.levelId ?? "").toString(),
    level: (data.level ?? data.nivel ?? "").toString(),
    examYear:
      data.examYear != null
        ? String(data.examYear)
        : data.prova_ano != null
          ? String(data.prova_ano)
          : "",
    themes: Array.isArray(data.themes) ? data.themes : [],
    themeIds: Array.isArray(data.themeIds) ? data.themeIds : [],
    isActive: data.isActive !== false,
    imageUrl: (data.imageUrl ?? "").toString(),
    promptImageWidth: clampImageWidth(data.promptImageWidth, 100),
    reference: (data.reference ?? "").toString(),
    internalNote: (data.internalNote ?? "").toString(),
    commentAttachments: Array.isArray(data.commentAttachments) ? data.commentAttachments : [],
    options: normalizeQuestionOptions(options, correctOptionId),
    correctOptionId,
    shuffleOptions: data.shuffleOptions !== false,
  };
}

export function buildQuestionPayload(form: QuestionFormState) {
  const normalizedYear = form.examYear.trim();
  const proofYear = normalizedYear ? Number(normalizedYear) : null;
  const proofLabel = buildProofLabel(form.examType, normalizedYear);
  const normalizedOptions = form.options.map((option) => ({
    id: option.id,
    text: option.text.trim(),
    imageUrl: option.imageUrl?.trim() ? option.imageUrl.trim() : null,
    imageWidth: clampImageWidth(option.imageWidth, 100),
  }));
  const optionMap = Object.fromEntries(
    normalizedOptions.map((option) => [option.id, option])
  ) as Record<
    QuestionOption["id"],
    { id: string; text: string; imageUrl: string | null; imageWidth: number }
  >;

  return {
    prompt: form.prompt.trim(),
    prompt_text: form.prompt.trim(),
    explanation: form.explanation.trim(),
    explanationFormat: "html",
    examId: form.examId || null,
    examType: form.examType,
    prova_tipo: form.examType,
    levelId: form.levelId || null,
    examYear: proofYear,
    prova_ano: proofYear,
    examSource: proofLabel,
    Prova: proofLabel,
    level: form.level,
    nivel: form.level,
    themes: form.themes,
    themeIds: form.themeIds,
    isActive: form.isActive,
    status: form.isActive ? "ativo" : "inativo",
    imageUrl: form.imageUrl.trim() || null,
    promptImageWidth: clampImageWidth(form.promptImageWidth, 100),
    options: normalizedOptions,
    optionA_text: optionMap.A?.text ?? "",
    optionA_imageUrl: optionMap.A?.imageUrl ?? null,
    optionA_imageWidth: optionMap.A?.imageWidth ?? 100,
    optionB_text: optionMap.B?.text ?? "",
    optionB_imageUrl: optionMap.B?.imageUrl ?? null,
    optionB_imageWidth: optionMap.B?.imageWidth ?? 100,
    optionC_text: optionMap.C?.text ?? "",
    optionC_imageUrl: optionMap.C?.imageUrl ?? null,
    optionC_imageWidth: optionMap.C?.imageWidth ?? 100,
    optionD_text: optionMap.D?.text ?? "",
    optionD_imageUrl: optionMap.D?.imageUrl ?? null,
    optionD_imageWidth: optionMap.D?.imageWidth ?? 100,
    optionE_text: optionMap.E?.text ?? "",
    optionE_imageUrl: optionMap.E?.imageUrl ?? null,
    optionE_imageWidth: optionMap.E?.imageWidth ?? 100,
    correctOptionId: form.correctOptionId,
    shuffleOptions: form.shuffleOptions,
    reference: form.reference.trim(),
    internalNote: form.internalNote.trim(),
    commentAttachments: form.commentAttachments,
  };
}

function normalizeThemeKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function formatCatalogOptionLabel(option: QuestionCatalogOption) {
  if (option.status === "inativo") {
    return `${option.title} (inativo)`;
  }
  return option.title;
}

function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-slate-900/35 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-4xl overflow-hidden rounded-[28px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-700 px-5 py-4">
            <div className="text-lg font-black text-slate-900 dark:text-slate-100">{title}</div>
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Fechar
            </Button>
          </div>
          <div className="max-h-[80vh] overflow-auto p-5">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function QuestionEditorForm({
  mode,
  initialValue,
  onCancel,
  onSubmit,
  onDelete,
}: QuestionEditorFormProps) {
  const commentImageInputRef = useRef<HTMLInputElement | null>(null);
  const [form, setForm] = useState<QuestionFormState>(initialValue);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [selectedThemeId, setSelectedThemeId] = useState("");
  const [exams, setExams] = useState<QuestionCatalogOption[]>([]);
  const [levels, setLevels] = useState<QuestionCatalogOption[]>([]);
  const [themeOptions, setThemeOptions] = useState<QuestionCatalogOption[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryItems, setGalleryItems] = useState<QuestionGalleryItem[]>([]);
  const [commentImageModalOpen, setCommentImageModalOpen] = useState(false);
  const [richImageTarget, setRichImageTarget] = useState<"prompt" | "explanation">("explanation");
  const [pendingPromptImageUrl, setPendingPromptImageUrl] = useState<string | null>(null);
  const [pendingExplanationImageUrl, setPendingExplanationImageUrl] = useState<string | null>(null);

  useEffect(() => {
    setForm(initialValue);
    setSuccessMsg(null);
  }, [initialValue]);

  useEffect(() => {
    let active = true;

    const getToken = async () => {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        throw new Error("Sessão inválida. Faça login novamente.");
      }
      return token;
    };

    const authedRequest = async (url: string) => {
      const token = await getToken();
      return fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    };

    const loadCatalogs = async () => {
      setCatalogLoading(true);
      setCatalogError(null);
      try {
        const [examRes, levelRes, themeRes] = await Promise.all([
          authedRequest("/api/admin/catalog/provas"),
          authedRequest("/api/admin/catalog/niveis"),
          authedRequest("/api/admin/catalog/temas"),
        ]);

        const [examJson, levelJson, themeJson] = await Promise.all([
          examRes.json() as Promise<{ ok: boolean; error?: string; items?: Array<Record<string, unknown>> }>,
          levelRes.json() as Promise<{ ok: boolean; error?: string; items?: Array<Record<string, unknown>> }>,
          themeRes.json() as Promise<{ ok: boolean; error?: string; items?: Array<Record<string, unknown>> }>,
        ]);

        if (!examRes.ok || !examJson.ok) {
          throw new Error(examJson.error || "Não foi possível carregar provas.");
        }
        if (!levelRes.ok || !levelJson.ok) {
          throw new Error(levelJson.error || "Não foi possível carregar níveis.");
        }
        if (!themeRes.ok || !themeJson.ok) {
          throw new Error(themeJson.error || "Não foi possível carregar temas.");
        }

        if (!active) return;

        const nextExams = (Array.isArray(examJson.items) ? examJson.items : [])
          .map((item) => ({
            id: String(item.id ?? ""),
            title: String(item.title ?? ""),
            code: String(item.code ?? ""),
            status: (item.status as QuestionCatalogOption["status"]) ?? "ativo",
          }));

        const nextLevels = (Array.isArray(levelJson.items) ? levelJson.items : [])
          .map((item) => ({
            id: String(item.id ?? ""),
            title: String(item.title ?? ""),
            code: String(item.code ?? ""),
            status: (item.status as QuestionCatalogOption["status"]) ?? "ativo",
          }));

        const nextThemes = (Array.isArray(themeJson.items) ? themeJson.items : [])
          .map((item) => ({
            id: String(item.id ?? ""),
            title: String(item.title ?? ""),
            code: String(item.code ?? ""),
            status: (item.status as QuestionCatalogOption["status"]) ?? "ativo",
            levelId: (item.levelId as string | null) ?? null,
            levelLabel: (item.levelLabel as string | null) ?? null,
          }));

        setExams(nextExams);
        setLevels(nextLevels);
        setThemeOptions(nextThemes);

        setForm((prev) => {
          const exam = nextExams.find((item) => item.id === prev.examId) ?? nextExams[0];
          const level = nextLevels.find((item) => item.id === prev.levelId) ?? nextLevels[0];
          const allowedThemes = nextThemes.filter((item) => !level?.id || item.levelId === level.id);
          const persistedThemeIds = prev.themeIds.filter((themeId) =>
            allowedThemes.some((item) => item.id === themeId)
          );
          const fallbackThemeIds = prev.themes
            .map((themeTitle) => {
              const normalizedTheme = normalizeThemeKey(themeTitle);
              const sameLevelMatch =
                allowedThemes.find((item) => normalizeThemeKey(item.title) === normalizedTheme) ?? null;
              if (sameLevelMatch) return sameLevelMatch.id;

              const anyLevelMatch =
                nextThemes.find((item) => normalizeThemeKey(item.title) === normalizedTheme) ?? null;
              return anyLevelMatch?.id ?? "";
            })
            .filter(Boolean);
          const nextThemeIds = Array.from(new Set([...persistedThemeIds, ...fallbackThemeIds]));

          return {
            ...prev,
            examId: prev.examId || exam?.id || "",
            examType: prev.examType || exam?.title || prev.examType,
            levelId: prev.levelId || level?.id || "",
            level: prev.level || level?.title || prev.level,
            themeIds: nextThemeIds,
            themes: nextThemeIds
              .map(
                (themeId) =>
                  allowedThemes.find((item) => item.id === themeId)?.title ||
                  nextThemes.find((item) => item.id === themeId)?.title ||
                  ""
              )
              .filter(Boolean),
          };
        });
      } catch (error) {
        if (!active) return;
        const message =
          error instanceof Error ? error.message : "Não foi possível carregar provas, níveis e temas.";
        setCatalogError(message);
      } finally {
        if (active) setCatalogLoading(false);
      }
    };

    void loadCatalogs();

    return () => {
      active = false;
    };
  }, []);

  const canSave = useMemo(() => {
    const hasPrompt = stripHtml(form.prompt).length > 0;
    const hasOptions = REQUIRED_OPTION_IDS.every((optionId) =>
      form.options.find((option) => option.id === optionId)?.text.trim().length
    );
    const hasTheme = form.themeIds.length > 0 || form.themes.length > 0;
    const hasExam = form.examId.trim().length > 0;
    const hasLevel = form.levelId.trim().length > 0;
    return hasPrompt && hasOptions && hasTheme && hasExam && hasLevel && !saving;
  }, [form, saving]);

  const availableThemes = useMemo(() => {
    if (!themeOptions.length) return [];
    if (!form.levelId) return themeOptions;

    // Mostra TODOS os temas, mas ordena: nível atual primeiro, depois os demais.
    // Nunca esconde temas — o usuário pode precisar de qualquer um, ativo ou inativo.
    const forLevel = themeOptions.filter((item) => item.levelId === form.levelId);
    const others   = themeOptions.filter((item) => item.levelId !== form.levelId);
    return [...forLevel, ...others];
  }, [form.levelId, themeOptions]);

  const setOption = (optionId: QuestionOption["id"], patch: Partial<QuestionOption>) => {
    setForm((prev) => ({
      ...prev,
      options: prev.options.map((option) =>
        option.id === optionId ? { ...option, ...patch } : option
      ),
    }));
  };

  const addOptionalOptionE = () => {
    setForm((prev) => {
      if (prev.options.some((option) => option.id === "E")) return prev;
      return {
        ...prev,
        options: [...prev.options, { id: "E", text: "", imageUrl: "", imageWidth: 100 }],
      };
    });
  };

  const removeOptionalOptionE = () => {
    setForm((prev) => ({
      ...prev,
      options: prev.options.filter((option) => option.id !== "E"),
      correctOptionId: prev.correctOptionId === "E" ? "A" : prev.correctOptionId,
    }));
  };

  const addThemeFromCatalog = (theme: QuestionCatalogOption) => {
    setForm((prev) => {
      if (prev.themeIds.includes(theme.id)) return prev;
      return {
        ...prev,
        themeIds: [...prev.themeIds, theme.id],
        themes: [...prev.themes, theme.title],
      };
    });
  };

  const removeTheme = (themeTitle: string) => {
    setForm((prev) => ({
      ...prev,
      themes: prev.themes.filter((item) => item !== themeTitle),
      themeIds: prev.themeIds.filter((themeId) => {
        const selected = themeOptions.find((item) => item.id === themeId);
        return selected?.title !== themeTitle;
      }),
    }));
  };

  const loadGalleryItems = async () => {
    setGalleryLoading(true);
    try {
      setGalleryItems(await loadQuestionMediaGallery(24));
    } finally {
      setGalleryLoading(false);
    }
  };

  const openRichImageModal = async (target: "prompt" | "explanation") => {
    setRichImageTarget(target);
    setCommentImageModalOpen(true);
    await loadGalleryItems();
  };

  const closeCommentImageModal = () => {
    if (uploading === "comment-image") return;
    setCommentImageModalOpen(false);
  };

  const insertRichImage = (url: string) => {
    if (richImageTarget === "prompt") {
      setPendingPromptImageUrl(url);
    } else {
      setPendingExplanationImageUrl(url);
    }
    setCommentImageModalOpen(false);
  };

  const addAttachment = (label: string, url: string) => {
    const nextUrl = url.trim();
    if (!nextUrl) return;
    const nextLabel = label.trim();

    setForm((prev) => ({
      ...prev,
      commentAttachments: [
        ...prev.commentAttachments,
        {
          id: crypto.randomUUID(),
          label: nextLabel || "Anexo",
          url: nextUrl,
        },
      ],
    }));
  };

  const removeAttachment = (attachmentId: string) => {
    setForm((prev) => ({
      ...prev,
      commentAttachments: prev.commentAttachments.filter((item) => item.id !== attachmentId),
    }));
  };

  const handleUploadPrompt = async (file: File) => {
    setUploading("prompt");
    try {
      const { url, path } = await uploadQuestionAsset(file, "admin_uploads/questionsBank/prompt");
      setForm((prev) => ({ ...prev, imageUrl: url }));
      try {
        await registerQuestionMedia({
          url,
          path,
          origin: "questionsBank",
          kind: "prompt",
          label: "Enunciado",
        });
      } catch (error) {
        console.warn("Falha ao registrar imagem no catálogo de mídias:", error);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao enviar imagem.";
      alert(
        message.includes("permission")
          ? "Sem permissão para upload. Faça login novamente como admin e tente de novo."
          : message
      );
    } finally {
      setUploading(null);
    }
  };

  const handleUploadOption = async (optionId: QuestionOption["id"], file: File) => {
    setUploading(optionId);
    try {
      const { url, path } = await uploadQuestionAsset(file, `admin_uploads/questionsBank/options/${optionId}`);
      setOption(optionId, { imageUrl: url });
      try {
        await registerQuestionMedia({
          url,
          path,
          origin: "questionsBank",
          kind: "option",
          label: `Alternativa ${optionId}`,
        });
      } catch (error) {
        console.warn("Falha ao registrar imagem no catálogo de mídias:", error);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao enviar imagem.";
      alert(
        message.includes("permission")
          ? "Sem permissão para upload. Faça login novamente como admin e tente de novo."
          : message
      );
    } finally {
      setUploading(null);
    }
  };

  const handleUploadAttachment = async (file: File) => {
    setUploading("attachment");
    try {
      const { url, path } = await uploadQuestionAsset(file, "admin_uploads/questionsBank/attachments");
      addAttachment(file.name, url);
      try {
        await registerQuestionMedia({
          url,
          path,
          origin: "questionsBank",
          kind: "attachment",
          label: file.name,
        });
      } catch (error) {
        console.warn("Falha ao registrar anexo no catálogo de mídias:", error);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao enviar arquivo.";
      alert(message);
    } finally {
      setUploading(null);
    }
  };

  const handleUploadCommentImage = async (file: File) => {
    setUploading("comment-image");
    try {
      const { url, path } = await uploadQuestionAsset(file, "admin_uploads/questionsBank/comment-images");
      try {
        await registerQuestionMedia({
          url,
          path,
          origin: "questionsBank",
          kind: "attachment",
          label: `Comentário - ${file.name}`,
        });
      } catch (error) {
        console.warn("Falha ao registrar imagem de comentário no catálogo de mídias:", error);
      }
      await loadGalleryItems();
      insertRichImage(url);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao enviar imagem.";
      alert(message);
    } finally {
      setUploading(null);
    }
  };

  const handleSubmit = async () => {
    if (!canSave) return;
    setSaving(true);
    setSuccessMsg(null);
    try {
      await onSubmit(buildQuestionPayload(form), form);
      setSuccessMsg("Dados salvos com sucesso.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao salvar.";
      alert(message);
    } finally {
      setSaving(false);
    }
  };

  const titleText = mode === "create" ? "Criar nova questão" : "Salvar alterações";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Button onClick={onCancel} variant="secondary" size="sm">
          Voltar
        </Button>
        <Button onClick={handleSubmit} disabled={!canSave} variant="primary" size="sm">
          {saving ? "Salvando..." : titleText}
        </Button>
      </div>

      {successMsg ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          {successMsg}
        </div>
      ) : null}

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.9fr)]">
        <div className="min-w-0 space-y-6">
          <div className="min-w-0 rounded-2xl border dark:border-slate-700 bg-white dark:bg-slate-900 p-6">
            <div className="text-sm font-bold text-slate-900 dark:text-slate-100">Enunciado</div>
            <div className="mt-1 break-words text-xs text-slate-500 dark:text-slate-400">
              Campo principal da questão. Compatível com prompt e prompt_text.
            </div>

            <div className="mt-3">
              <RichTextEditor
                label="Texto do enunciado"
                helper="Campo salvo em `prompt` e `prompt_text` com HTML simples para formatação."
                placeholder="Digite o enunciado completo da questão..."
                value={form.prompt}
                onRequestImage={() => void openRichImageModal("prompt")}
                pendingImageUrl={pendingPromptImageUrl ?? undefined}
                onPendingImageHandled={() => setPendingPromptImageUrl(null)}
                onChange={(value) => setForm((prev) => ({ ...prev, prompt: value }))}
                imageAlt="Imagem adicionada no enunciado"
              />
            </div>

            <div className="mt-4">
              <div className="mb-1 text-xs font-semibold text-slate-600 dark:text-slate-300">Imagem do enunciado (opcional)</div>
              <input
                value={form.imageUrl}
                onChange={(event) => setForm((prev) => ({ ...prev, imageUrl: event.target.value }))}
                placeholder="URL da imagem"
                className="w-full rounded-xl border dark:border-slate-700 px-4 py-3 text-sm dark:bg-slate-900 dark:text-slate-100"
              />

              <label className="mt-3 inline-flex min-h-11 cursor-pointer items-center justify-center rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-slate-800">
                {uploading === "prompt" ? "Enviando..." : "Enviar imagem"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void handleUploadPrompt(file);
                  }}
                />
              </label>

              {form.imageUrl ? (
                <div className="mt-4 rounded-xl border dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">Tamanho da imagem: {form.promptImageWidth}%</div>
                    <input
                      type="range"
                      min={20}
                      max={100}
                      step={5}
                      value={form.promptImageWidth}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          promptImageWidth: clampImageWidth(event.target.value, prev.promptImageWidth),
                        }))
                      }
                      className="w-40 accent-blue-600"
                    />
                  </div>
                  <img
                    src={form.imageUrl}
                    alt="Preview"
                    className="max-h-[300px] object-contain"
                    style={{ width: `${clampImageWidth(form.promptImageWidth, 100)}%` }}
                  />
                </div>
              ) : null}
            </div>
          </div>

          <div className="min-w-0 rounded-2xl border dark:border-slate-700 bg-white dark:bg-slate-900 p-6">
            <div className="text-sm font-bold text-slate-900 dark:text-slate-100">Alternativas</div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Cadastre as respostas e marque a correta. O formulário salva em estrutura aninhada e nas colunas A-D da importação.
            </div>

            <div className="mt-4 space-y-4">
              {form.options.map((option) => {
                const isCorrect = form.correctOptionId === option.id;
                const isOptionalE = option.id === "E";
                return (
                  <div key={option.id} className="rounded-xl border dark:border-slate-700 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-semibold dark:text-slate-100">Alternativa {option.id}</div>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {isOptionalE ? (
                          <button
                            type="button"
                            onClick={removeOptionalOptionE}
                            className="rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700"
                          >
                            Remover
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => setForm((prev) => ({ ...prev, correctOptionId: option.id }))}
                          className={cn(
                            "rounded-full px-3 py-1 text-xs font-bold",
                            isCorrect ? "bg-emerald-600 text-white" : "bg-slate-100 dark:bg-slate-700 dark:text-slate-100"
                          )}
                        >
                          {isCorrect ? "Correta" : "Marcar correta"}
                        </button>
                      </div>
                    </div>

                    <textarea
                      value={option.text}
                      onChange={(event) => setOption(option.id, { text: event.target.value })}
                      placeholder={`Texto da alternativa ${option.id}`}
                      className="mt-3 min-h-[90px] w-full rounded-xl border dark:border-slate-700 p-3 text-sm dark:bg-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-500/30"
                    />

                    <div className="mt-3 flex flex-col gap-3">
                      <input
                        value={option.imageUrl || ""}
                        onChange={(event) => setOption(option.id, { imageUrl: event.target.value })}
                        placeholder="URL da imagem da alternativa"
                        className="rounded-xl border dark:border-slate-700 px-4 py-3 text-sm dark:bg-slate-900 dark:text-slate-100"
                      />

                      <label className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-slate-800">
                        {uploading === option.id ? "Enviando..." : "Enviar imagem"}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) void handleUploadOption(option.id, file);
                          }}
                        />
                      </label>

                      {option.imageUrl ? (
                        <div className="rounded-xl border dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3">
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                              Tamanho da imagem: {clampImageWidth(option.imageWidth, 100)}%
                            </div>
                            <input
                              type="range"
                              min={20}
                              max={100}
                              step={5}
                              value={clampImageWidth(option.imageWidth, 100)}
                              onChange={(event) =>
                                setOption(option.id, {
                                  imageWidth: clampImageWidth(event.target.value, option.imageWidth ?? 100),
                                })
                              }
                              className="w-40 accent-blue-600"
                            />
                          </div>
                          <img
                            src={option.imageUrl}
                            alt={`Preview ${option.id}`}
                            className="max-h-[250px] object-contain"
                            style={{ width: `${clampImageWidth(option.imageWidth, 100)}%` }}
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>

            {!form.options.some((option) => option.id === "E") ? (
              <button
                type="button"
                onClick={addOptionalOptionE}
                className="mt-4 inline-flex min-h-11 items-center justify-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Adicionar alternativa E
              </button>
            ) : null}
          </div>

          <div className="min-w-0">
            <RichTextEditor
              label="Comentário / Explicação"
              helper="Campo salvo em `explanation` com HTML simples para formatação."
              placeholder="Escreva o comentário interno/pedagógico da questão..."
              value={form.explanation}
              onRequestImage={() => void openRichImageModal("explanation")}
              pendingImageUrl={pendingExplanationImageUrl ?? undefined}
              onPendingImageHandled={() => setPendingExplanationImageUrl(null)}
              onChange={(value) => setForm((prev) => ({ ...prev, explanation: value }))}
              imageAlt="Imagem adicionada no comentário"
            />
          </div>

          <div className="min-w-0 rounded-2xl border dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
            <div className="text-sm font-extrabold text-slate-900 dark:text-slate-100">Referência</div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Campo bibliográfico para rastrear a origem da questão.
            </div>
            <textarea
              value={form.reference}
              onChange={(event) => setForm((prev) => ({ ...prev, reference: event.target.value }))}
              placeholder="Livro, capítulo, artigo, banca, legislação..."
              className="mt-3 min-h-[110px] w-full rounded-xl border dark:border-slate-700 p-3 text-sm dark:bg-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-500/30"
            />
          </div>
        </div>

        <div className="min-w-0 space-y-6">
          <div className="min-w-0 rounded-2xl border dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
            <div className="text-sm font-extrabold text-slate-900 dark:text-slate-100">Metadados</div>

            <div className="mt-3 space-y-3">
              {catalogError ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {catalogError}
                </div>
              ) : null}
              <div>
                <div className="mb-1 text-xs font-semibold text-slate-600 dark:text-slate-300">Prova</div>
                <select
                  value={form.examId}
                  onChange={(event) => {
                    const nextExam = exams.find((item) => item.id === event.target.value);
                    setForm((prev) => ({
                      ...prev,
                      examId: event.target.value,
                      examType: nextExam?.title || prev.examType,
                    }));
                  }}
                  className="w-full rounded-xl border px-4 py-3 text-sm bg-white dark:bg-slate-900 dark:text-slate-100 dark:border-slate-700"
                >
                  {catalogLoading && exams.length === 0 ? <option value="">Carregando...</option> : null}
                  {exams.map((option) => (
                    <option key={option.id} value={option.id}>
                      {formatCatalogOptionLabel(option)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="mb-1 text-xs font-semibold text-slate-600 dark:text-slate-300">Ano da prova</div>
                <input
                  value={form.examYear}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      examYear: event.target.value.replace(/[^\d]/g, "").slice(0, 4),
                    }))
                  }
                  placeholder="2026"
                  className="w-full rounded-xl border dark:border-slate-700 px-4 py-3 text-sm dark:bg-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-500/30"
                />
              </div>

              <div>
                <div className="mb-1 text-xs font-semibold text-slate-600 dark:text-slate-300">Nível</div>
                <select
                  value={form.levelId}
                  onChange={(event) => {
                    const nextLevel = levels.find((item) => item.id === event.target.value);
                    setSelectedThemeId("");
                    setForm((prev) => ({
                      ...prev,
                      levelId: event.target.value,
                      level: nextLevel?.title || prev.level,
                      themeIds: [],
                      themes: [],
                    }));
                  }}
                  className="w-full rounded-xl border px-4 py-3 text-sm bg-white dark:bg-slate-900 dark:text-slate-100 dark:border-slate-700"
                >
                  {catalogLoading && levels.length === 0 ? <option value="">Carregando...</option> : null}
                  {levels.map((option) => (
                    <option key={option.id} value={option.id}>
                      {formatCatalogOptionLabel(option)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-2xl border dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4">
                <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">Rótulo gerado</div>
                <div className="mt-1 text-sm font-bold text-slate-900 dark:text-slate-100">
                  {buildProofLabel(form.examType, form.examYear)}
                </div>
              </div>

              <div className="flex items-center justify-between rounded-2xl border dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4">
                <div>
                  <div className="text-sm font-extrabold text-slate-900 dark:text-slate-100">Status</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{form.isActive ? "Ativo" : "Inativo"}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, isActive: !prev.isActive }))}
                  className={cn(
                    "rounded-full border px-3 py-2 text-xs font-extrabold",
                    form.isActive
                      ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                      : "border-amber-100 bg-amber-50 text-amber-700"
                  )}
                >
                  {form.isActive ? "● Ativo" : "○ Inativo"}
                </button>
              </div>

              <div className="flex items-center justify-between rounded-2xl border dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4">
                <div>
                  <div className="text-sm font-extrabold text-slate-900 dark:text-slate-100">Alternativas embaralhadas</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Ligado por padrão. Desative apenas para questões com ordem fixa.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, shuffleOptions: !prev.shuffleOptions }))}
                  className={cn(
                    "rounded-full border px-3 py-2 text-xs font-extrabold",
                    form.shuffleOptions
                      ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300"
                  )}
                >
                  {form.shuffleOptions ? "● Ligado" : "○ Desligado"}
                </button>
              </div>
            </div>
          </div>

          <div className="min-w-0 rounded-2xl border dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
            <div className="text-sm font-extrabold text-slate-900 dark:text-slate-100">Tema</div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Selecione apenas temas já cadastrados.</div>

            <div className="mt-3 flex min-w-0 gap-2">
              <select
                value={selectedThemeId}
                onChange={(event) => setSelectedThemeId(event.target.value)}
                className="min-w-0 flex-1 rounded-xl border dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-slate-100 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-500/30"
              >
                <option value="">Selecione um tema</option>
                {form.levelId ? (
                  <>
                    {availableThemes.filter((t) => t.levelId === form.levelId).length > 0 && (
                      <optgroup label="── Deste nível ──">
                        {availableThemes
                          .filter((t) => t.levelId === form.levelId)
                          .map((theme) => (
                            <option key={theme.id} value={theme.id}>
                              {formatCatalogOptionLabel(theme)}
                            </option>
                          ))}
                      </optgroup>
                    )}
                    {availableThemes.filter((t) => t.levelId !== form.levelId).length > 0 && (
                      <optgroup label="── Outros níveis ──">
                        {availableThemes
                          .filter((t) => t.levelId !== form.levelId)
                          .map((theme) => (
                            <option key={theme.id} value={theme.id}>
                              {formatCatalogOptionLabel(theme)}
                            </option>
                          ))}
                      </optgroup>
                    )}
                  </>
                ) : (
                  availableThemes.map((theme) => (
                    <option key={theme.id} value={theme.id}>
                      {formatCatalogOptionLabel(theme)}
                    </option>
                  ))
                )}
              </select>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={!selectedThemeId}
                onClick={() => {
                  const theme = availableThemes.find((item) => item.id === selectedThemeId);
                  if (!theme) return;
                  addThemeFromCatalog(theme);
                  setSelectedThemeId("");
                }}
              >
                Adicionar
              </Button>
            </div>

            <div className="mt-3">
              <div className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                Seleção rápida
                {form.levelId && availableThemes.filter((t) => t.levelId === form.levelId).length > 0 && (
                  <span className="ml-1 font-normal text-slate-400 dark:text-slate-500">
                    (negrito = deste nível)
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {availableThemes.length ? (
                  availableThemes.map((theme) => {
                    const selected  = form.themeIds.includes(theme.id);
                    const forLevel  = form.levelId && theme.levelId === form.levelId;
                    const inactive  = theme.status === "inativo";
                    return (
                      <button
                        key={theme.id}
                        type="button"
                        title={inactive ? "Tema inativo — ainda pode ser usado" : undefined}
                        onClick={() => (selected ? removeTheme(theme.title) : addThemeFromCatalog(theme))}
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs transition",
                          forLevel ? "font-extrabold" : "font-semibold opacity-70",
                          selected
                            ? "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-300"
                            : inactive
                            ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400 hover:opacity-90"
                            : "border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                        )}
                      >
                        {formatCatalogOptionLabel(theme)}
                      </button>
                    );
                  })
                ) : (
                  <div className="text-xs text-slate-500 dark:text-slate-400">Nenhum tema cadastrado.</div>
                )}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {form.themes.length ? (
                form.themes.map((theme) => (
                  <button
                    key={theme}
                    type="button"
                    onClick={() => removeTheme(theme)}
                    className="rounded-full border dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                    title="Remover tema"
                  >
                    {theme} ✕
                  </button>
                ))
              ) : (
                <div className="text-xs text-slate-500 dark:text-slate-400">Nenhum tema adicionado.</div>
              )}
            </div>
          </div>

          <div className="min-w-0 rounded-2xl border dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
            <div className="text-sm font-extrabold text-slate-900 dark:text-slate-100">Nota interna</div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Visível apenas internamente, não destinada ao aluno final.
            </div>
            <textarea
              value={form.internalNote}
              onChange={(event) => setForm((prev) => ({ ...prev, internalNote: event.target.value }))}
              placeholder="Observações do time, pendências, avisos..."
              className="mt-3 min-h-[110px] w-full rounded-xl border dark:border-slate-700 p-3 text-sm dark:bg-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-500/30"
            />
          </div>

          <div className="min-w-0 rounded-2xl border dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
            <div className="text-sm font-extrabold text-slate-900 dark:text-slate-100">Anexos do comentário</div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Use links ou envie arquivos para guardar material de apoio interno.
            </div>

            <div className="mt-3 space-y-3">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  const label = window.prompt("Nome do anexo");
                  const url = window.prompt("URL do anexo");
                  if (!url?.trim()) return;
                  addAttachment(label || "Anexo", url);
                }}
              >
                Adicionar link
              </Button>

              <label className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-slate-800">
                {uploading === "attachment" ? "Enviando..." : "Enviar arquivo"}
                <input
                  type="file"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void handleUploadAttachment(file);
                  }}
                />
              </label>
            </div>

            <div className="mt-4 space-y-2">
              {form.commentAttachments.length ? (
                form.commentAttachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="flex items-center justify-between gap-3 rounded-xl border dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2"
                  >
                    <a
                      href={attachment.url}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 truncate text-sm font-medium text-blue-700 underline"
                    >
                      {attachment.label}
                    </a>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeAttachment(attachment.id)}
                    >
                      Remover
                    </Button>
                  </div>
                ))
              ) : (
                <div className="text-xs text-slate-500 dark:text-slate-400">Nenhum anexo adicionado.</div>
              )}
            </div>
          </div>

          {onDelete ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
              <div className="text-sm font-extrabold text-rose-900">Zona de risco</div>
              <div className="mt-1 text-xs text-rose-700">
                Excluir remove a questão do questionsBank.
              </div>
              <button
                onClick={() => void onDelete()}
                className="mt-3 w-full rounded-xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white hover:bg-rose-700"
              >
                Excluir questão
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <Modal
        open={commentImageModalOpen}
        title={richImageTarget === "prompt" ? "Adicionar imagem ao enunciado" : "Adicionar imagem ao comentário"}
        onClose={closeCommentImageModal}
      >
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => commentImageInputRef.current?.click()}
            >
              Selecionar do computador
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => void loadGalleryItems()}>
              Atualizar galeria
            </Button>
          </div>

          <input
            ref={commentImageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleUploadCommentImage(file);
              event.currentTarget.value = "";
            }}
          />

          <div>
            <div className="mb-3 text-base font-bold text-slate-900 dark:text-slate-100">Galeria de imagens</div>
            {galleryLoading ? (
              <div className="rounded-2xl border dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4 text-sm text-slate-500 dark:text-slate-400">Carregando galeria...</div>
            ) : galleryItems.length ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {galleryItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => insertRichImage(item.url)}
                    className="overflow-hidden rounded-2xl border dark:border-slate-700 text-left transition hover:border-blue-300 hover:shadow-sm dark:bg-slate-800"
                  >
                    <img src={item.url} alt={item.label || "Imagem da galeria"} className="h-40 w-full object-cover" />
                    <div className="truncate px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                      {item.label || item.name || "Imagem"}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4 text-sm text-slate-500 dark:text-slate-400">
                Nenhuma imagem encontrada na galeria.
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
