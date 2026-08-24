"use client";

import { useEffect, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import { cn } from "@/lib/cn";

// ─── tipos ──────────────────────────────────────────────────────────────────

export type RichTextEditorProps = {
  label: string;
  helper?: string;
  placeholder?: string;
  value: string;
  onChange: (html: string) => void;
  onRequestImage?: () => void;
  pendingImageUrl?: string;
  onPendingImageHandled?: () => void;
  imageAlt?: string;
};

// ─── sanitização de paste ────────────────────────────────────────────────────

/**
 * Limpa o HTML colado preservando apenas formatação semântica:
 * bold, italic, headings, listas, links e imagens.
 * Remove cores, fundos, classes e espaços desnecessários.
 */
function sanitizePastedHtml(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  // 1. Remover tags não-semânticas por completo (mantendo conteúdo interno)
  const unwrapTags = ["font", "span", "div", "section", "article", "header", "footer", "nav", "aside"];
  unwrapTags.forEach((tag) => {
    doc.querySelectorAll(tag).forEach((el) => {
      // Só desembrulha span/font — divs estruturais convertem para <p>
      const isBLock = tag === "div" || tag === "section" || tag === "article";
      if (isBLock) {
        const p = doc.createElement("p");
        while (el.firstChild) p.appendChild(el.firstChild);
        el.replaceWith(p);
      } else {
        const fragment = doc.createDocumentFragment();
        while (el.firstChild) fragment.appendChild(el.firstChild);
        el.replaceWith(fragment);
      }
    });
  });

  // 2. Para cada elemento: limpar atributos de cor/fundo e manter só o essencial
  doc.querySelectorAll("*").forEach((el) => {
    const tag = el.tagName.toLowerCase();

    // Remover todos os atributos de estilo que trazem cor, fundo, fonte
    const style = el.getAttribute("style");
    if (style) {
      const allowedProps = new Set(["text-align"]);
      const cleaned = style
        .split(";")
        .filter((rule) => {
          const prop = rule.split(":")[0]?.trim().toLowerCase() ?? "";
          return allowedProps.has(prop);
        })
        .join(";")
        .trim();
      if (cleaned) el.setAttribute("style", cleaned);
      else el.removeAttribute("style");
    }

    // Remover class, color, bgcolor, data-* de tudo
    el.removeAttribute("class");
    el.removeAttribute("color");
    el.removeAttribute("bgcolor");
    el.removeAttribute("face");
    el.removeAttribute("size");
    Array.from(el.attributes)
      .filter((a) => a.name.startsWith("data-") || a.name.startsWith("on"))
      .forEach((a) => el.removeAttribute(a.name));

    // Para links: manter só href, forçar target e rel
    if (tag === "a") {
      const href = (el.getAttribute("href") ?? "").trim();
      const safe =
        href.startsWith("http://") ||
        href.startsWith("https://") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:");
      if (!safe) {
        // Desembrulha link inseguro
        const fragment = doc.createDocumentFragment();
        while (el.firstChild) fragment.appendChild(el.firstChild);
        el.replaceWith(fragment);
      } else {
        el.setAttribute("href", href);
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noreferrer noopener");
      }
    }

    // Para imagens: manter só src e alt
    if (tag === "img") {
      const src = (el.getAttribute("src") ?? "").trim();
      const alt = el.getAttribute("alt") ?? "";
      const safe = src.startsWith("http://") || src.startsWith("https://");
      if (!safe) {
        el.remove();
      } else {
        // Limpar todos os atributos exceto src e alt
        Array.from(el.attributes).forEach((a) => {
          if (a.name !== "src" && a.name !== "alt") el.removeAttribute(a.name);
        });
        el.setAttribute("src", src);
        if (alt) el.setAttribute("alt", alt);
      }
    }

    // Remover tags de script, style, iframe etc
    const blocked = ["script", "style", "iframe", "object", "embed", "meta", "link", "head"];
    if (blocked.includes(tag)) el.remove();
  });

  // 3. Remover itens de lista vazios
  doc.querySelectorAll("li").forEach((li) => {
    if (!(li.textContent ?? "").trim() && !li.querySelector("img")) {
      li.remove();
    }
  });

  // 4. Colapsar parágrafos vazios consecutivos (manter no máximo 1)
  let emptyCount = 0;
  Array.from(doc.body.children).forEach((child) => {
    const isEmpty =
      !(child.textContent ?? "").trim() &&
      !child.querySelector("img") &&
      child.tagName === "P";
    if (isEmpty) {
      emptyCount++;
      if (emptyCount > 1) child.remove();
    } else {
      emptyCount = 0;
    }
  });

  return doc.body.innerHTML;
}

/**
 * Normaliza HTML já salvo no banco: remove parágrafos vazios excessivos,
 * itens de lista vazios e mescla listas adjacentes do mesmo tipo.
 * NÃO remove formatação (negrito, itálico, etc.).
 */
function normalizeStoredHtml(html: string): string {
  if (!html) return html;
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  // Remove <li> que só têm conteúdo vazio (<p></p> ou <p><br></p>)
  doc.querySelectorAll("li").forEach((li) => {
    const hasText = (li.textContent ?? "").trim().length > 0;
    const hasImage = !!li.querySelector("img");
    if (!hasText && !hasImage) li.remove();
  });

  // Mescla listas adjacentes do mesmo tipo (ul+ul / ol+ol) separadas por <p> vazio
  // Ex.: <ul><li>A</li></ul><p></p><ul><li>B</li></ul> → <ul><li>A</li><li>B</li></ul>
  Array.from(doc.body.children).forEach((el) => {
    const tag = el.tagName;
    if (tag !== "UL" && tag !== "OL") return;
    let next = el.nextElementSibling;
    // Pula parágrafos vazios
    while (next && next.tagName === "P" && !(next.textContent ?? "").trim()) {
      const toRemove = next;
      next = next.nextElementSibling;
      toRemove.remove();
    }
    // Mescla lista adjacente do mesmo tipo
    if (next && next.tagName === tag) {
      while (next.firstChild) el.appendChild(next.firstChild);
      next.remove();
    }
  });

  // Colapsa parágrafos vazios consecutivos: máximo 1 seguido
  // (inclui <p></p> e <p><br></p>)
  let emptyRun = 0;
  Array.from(doc.body.children).forEach((child) => {
    const isEmpty =
      child.tagName === "P" &&
      !(child.textContent ?? "").trim() &&
      !child.querySelector("img");
    if (isEmpty) {
      emptyRun++;
      if (emptyRun > 1) child.remove();
    } else {
      emptyRun = 0;
    }
  });

  // Remove parágrafos vazios no início e fim do documento
  while (
    doc.body.firstElementChild?.tagName === "P" &&
    !(doc.body.firstElementChild.textContent ?? "").trim()
  ) {
    doc.body.firstElementChild.remove();
  }
  while (
    doc.body.lastElementChild?.tagName === "P" &&
    !(doc.body.lastElementChild.textContent ?? "").trim()
  ) {
    doc.body.lastElementChild.remove();
  }

  return doc.body.innerHTML;
}

/**
 * Converte texto puro em HTML com parágrafos,
 * respeitando quebras de linha simples (→ <br>) e duplas (→ novo <p>).
 */
function plainTextToHtml(text: string): string {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return "";

  return normalized
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split("\n").map((l) => l.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"));
      return `<p>${lines.join("<br>")}</p>`;
    })
    .join("");
}

// ─── toolbar helpers ─────────────────────────────────────────────────────────

function ToolbarButton({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 min-w-[2rem] items-center justify-center rounded-lg border px-2 text-xs font-semibold transition",
        active
          ? "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-300"
          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800",
        disabled && "cursor-not-allowed opacity-40"
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-1 h-5 w-px shrink-0 bg-slate-200 dark:bg-slate-700" />;
}

// ─── componente principal ────────────────────────────────────────────────────

export function RichTextEditor({
  label,
  helper,
  placeholder,
  value,
  onChange,
  onRequestImage,
  pendingImageUrl,
  onPendingImageHandled,
  imageAlt,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noreferrer noopener", target: "_blank" },
      }),
      Image.configure({ allowBase64: false }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({
        placeholder: placeholder ?? "Digite aqui...",
      }),
    ],
    content: typeof window !== "undefined" ? normalizeStoredHtml(value) : value,
    onUpdate({ editor }) {
      onChange(editor.getHTML());
    },
    editorProps: {
      // ── Sanitiza HTML colado (Google Docs, Word, ChatGPT, etc.) ──
      transformPastedHTML(html) {
        return sanitizePastedHtml(html);
      },
      // ── Converte texto puro em parágrafos (não em linha única) ──
      transformPastedText(text) {
        return plainTextToHtml(text);
      },
      attributes: {
        class: [
          "min-h-[220px] outline-none text-sm text-slate-900 dark:text-slate-100",
          // Headings
          "[&_h2]:text-lg [&_h2]:font-bold [&_h2]:mt-4 [&_h2]:mb-2",
          "[&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1",
          // Citação
          "[&_blockquote]:border-l-4 [&_blockquote]:border-slate-300 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-slate-600 dark:[&_blockquote]:text-slate-400",
          // Listas — espaçamento compacto entre itens
          "[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2",
          "[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2",
          "[&_li]:mb-1",
          // Remove margem de <p> dentro de <li> para não dobrar espaço
          "[&_li>p]:m-0",
          "[&_li_p]:m-0",
          // Parágrafos: espaçamento controlado
          "[&_p]:mb-2 [&_p]:leading-relaxed",
          // Parágrafo vazio: altura mínima mas não excessiva
          "[&_p:empty]:mb-1 [&_p:empty]:min-h-0",
          // Links e imagens
          "[&_a]:text-blue-700 [&_a]:underline dark:[&_a]:text-blue-400",
          "[&_img]:max-h-[240px] [&_img]:rounded-xl [&_img]:border [&_img]:bg-white [&_img]:object-contain [&_img]:p-1",
        ].join(" "),
      },
    },
  });

  // Sincroniza valor externo → editor (normaliza para remover espaços excessivos já salvos)
  useEffect(() => {
    if (!editor) return;
    const clean = normalizeStoredHtml(value);
    const current = editor.getHTML();
    if (current !== clean) {
      editor.commands.setContent(clean, { emitUpdate: false });
    }
  }, [editor, value]);

  // Insere imagem pendente vinda do seletor externo
  useEffect(() => {
    if (!editor || !pendingImageUrl) return;
    editor.chain().focus().setImage({
      src: pendingImageUrl,
      alt: imageAlt ?? "Imagem adicionada",
    }).run();
    onPendingImageHandled?.();
  }, [editor, pendingImageUrl, imageAlt, onPendingImageHandled]);

  const insertLink = useCallback(() => {
    const url = window.prompt("Cole a URL do link");
    if (!url?.trim()) return;
    editor?.chain().focus().setLink({ href: url.trim() }).run();
  }, [editor]);

  if (!editor) return null;

  const canUndo = editor.can().undo();
  const canRedo = editor.can().redo();

  return (
    <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      {/* Cabeçalho */}
      <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-700">
        <div className="text-sm font-extrabold text-slate-900 dark:text-slate-100">{label}</div>
        {helper && <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{helper}</div>}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/60">
        {/* Histórico */}
        <ToolbarButton onClick={() => editor.chain().focus().undo().run()} disabled={!canUndo} title="Desfazer (Ctrl+Z)">
          ↶
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().redo().run()} disabled={!canRedo} title="Refazer (Ctrl+Y)">
          ↷
        </ToolbarButton>

        <Divider />

        {/* Bloco */}
        <select
          value={
            editor.isActive("heading", { level: 2 })
              ? "h2"
              : editor.isActive("heading", { level: 3 })
              ? "h3"
              : editor.isActive("blockquote")
              ? "blockquote"
              : "paragraph"
          }
          onChange={(e) => {
            const val = e.target.value;
            if (val === "h2") editor.chain().focus().toggleHeading({ level: 2 }).run();
            else if (val === "h3") editor.chain().focus().toggleHeading({ level: 3 }).run();
            else if (val === "blockquote") editor.chain().focus().toggleBlockquote().run();
            else editor.chain().focus().setParagraph().run();
          }}
          className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        >
          <option value="paragraph">Parágrafo</option>
          <option value="h2">Título</option>
          <option value="h3">Subtítulo</option>
          <option value="blockquote">Citação</option>
        </select>

        <Divider />

        {/* Formatação inline */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
          title="Negrito (Ctrl+B)"
        >
          <strong>B</strong>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
          title="Itálico (Ctrl+I)"
        >
          <em>I</em>
        </ToolbarButton>

        <Divider />

        {/* Alinhamento */}
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          active={editor.isActive({ textAlign: "left" })}
          title="Alinhar à esquerda"
        >
          ⬅
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          active={editor.isActive({ textAlign: "center" })}
          title="Centralizar"
        >
          ☰
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          active={editor.isActive({ textAlign: "right" })}
          title="Alinhar à direita"
        >
          ➡
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("justify").run()}
          active={editor.isActive({ textAlign: "justify" })}
          title="Justificar"
        >
          ≣
        </ToolbarButton>

        <Divider />

        {/* Listas */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
          title="Lista com marcadores"
        >
          • Lista
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")}
          title="Lista numerada"
        >
          1. Lista
        </ToolbarButton>

        <Divider />

        {/* Link e imagem */}
        <ToolbarButton onClick={insertLink} active={editor.isActive("link")} title="Inserir link">
          🔗
        </ToolbarButton>
        {onRequestImage && (
          <ToolbarButton onClick={onRequestImage} title="Inserir imagem">
            🖼
          </ToolbarButton>
        )}
      </div>

      {/* Área de edição */}
      <div className="p-4">
        <EditorContent
          editor={editor}
          className={cn(
            "rounded-xl border border-slate-200 px-4 py-3 transition",
            "focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-200",
            "dark:border-slate-700 dark:focus-within:border-blue-500 dark:focus-within:ring-blue-500/30",
            "[&_.tiptap]:outline-none",
            // Placeholder via CSS (extensão Placeholder do TipTap)
            "[&_.tiptap_p.is-editor-empty:first-child::before]:pointer-events-none",
            "[&_.tiptap_p.is-editor-empty:first-child::before]:float-left",
            "[&_.tiptap_p.is-editor-empty:first-child::before]:h-0",
            "[&_.tiptap_p.is-editor-empty:first-child::before]:text-slate-400",
            "[&_.tiptap_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]",
            "dark:[&_.tiptap_p.is-editor-empty:first-child::before]:text-slate-500"
          )}
        />
      </div>
    </div>
  );
}
