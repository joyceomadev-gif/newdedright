import { useEffect, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Superscript from "@tiptap/extension-superscript";
import Subscript from "@tiptap/extension-subscript";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Placeholder from "@tiptap/extension-placeholder";
import katex from "katex";
import "katex/dist/katex.min.css";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Superscript as SupIcon,
  Subscript as SubIcon,
  List,
  ListOrdered,
  Link as LinkIcon,
  Image as ImageIcon,
  Table as TableIcon,
  Minus,
  FileText,
  Sigma,
  PenSquare,
  Undo2,
  Redo2,
  Music,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MathDialog } from "@/components/rich/MathDialog";
import { DiagramDialog } from "@/components/rich/DiagramDialog";

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  compact?: boolean;
}

/** TipTap-based rich editor used across the Question Builder. */
export function TipTapEditor({ value, onChange, placeholder, minHeight = 120, compact }: Props) {
  const [mathOpen, setMathOpen] = useState(false);
  const [diagOpen, setDiagOpen] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      Superscript,
      Subscript,
      TextStyle,
      Color,
      Link.configure({ openOnClick: false, autolink: true }),
      Image.configure({ inline: false, allowBase64: true, HTMLAttributes: { class: "qb-img" } }),
      Table.configure({ resizable: true, HTMLAttributes: { class: "qb-table" } }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({ placeholder: placeholder ?? "Type your question…" }),
    ],
    content: value || "",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "qb-prose focus:outline-none",
        style: `min-height:${minHeight}px`,
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  // Sync external value → editor when the doc changes (e.g. loading a saved question).
  useEffect(() => {
    if (!editor) return;
    if (value && value !== editor.getHTML()) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [editor, value]);

  if (!editor) {
    return (
      <div
        className="rounded-md border bg-background p-3 text-sm text-muted-foreground"
        style={{ minHeight }}
      >
        Loading editor…
      </div>
    );
  }

  const B = (props: React.ComponentProps<typeof Button>) => (
    <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" {...props} />
  );

  function insertImageFromFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      editor?.chain().focus().setImage({ src: url }).run();
    };
    reader.readAsDataURL(file);
  }

  function insertMath(latex: string) {
    if (!latex) return;
    const mathToken = latex.includes("\n") || latex.includes("\\begin") ? `$$${latex}$$ ` : `$${latex}$ `;
    editor?.chain().focus().insertContent(mathToken).run();
  }

  function insertDiagram(dataUrl: string) {
    editor?.chain().focus().setImage({ src: dataUrl, alt: "diagram" }).run();
  }

  function insertMediaFile(kind: "audio" | "video") {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = kind === "audio" ? "audio/*" : "video/*";
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return;
      if (f.size > 8 * 1024 * 1024) {
        // Keep JSON payload small — 8 MB cap for inline media.
        alert("Media too large (max 8 MB). Consider linking externally.");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const url = String(reader.result);
        const tag =
          kind === "audio"
            ? `<audio controls src="${url}" class="qb-audio"></audio>`
            : `<video controls src="${url}" class="qb-video" style="max-width:100%"></video>`;
        editor?.chain().focus().insertContent(`<p>${tag}</p><p></p>`).run();
      };
      reader.readAsDataURL(f);
    };
    input.click();
  }

  return (
    <div className="rounded-md border bg-background">
      <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/40 px-1 py-1">
        <B onClick={() => editor.chain().focus().toggleBold().run()} title="Bold" data-active={editor.isActive("bold") || undefined}>
          <Bold className="h-3.5 w-3.5" />
        </B>
        <B onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic" data-active={editor.isActive("italic") || undefined}>
          <Italic className="h-3.5 w-3.5" />
        </B>
        <B onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline">
          <UnderlineIcon className="h-3.5 w-3.5" />
        </B>
        <B onClick={() => editor.chain().focus().toggleSuperscript().run()} title="Superscript">
          <SupIcon className="h-3.5 w-3.5" />
        </B>
        <B onClick={() => editor.chain().focus().toggleSubscript().run()} title="Subscript">
          <SubIcon className="h-3.5 w-3.5" />
        </B>
        <div className="mx-1 h-4 w-px bg-border" />
        <B onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bulleted list">
          <List className="h-3.5 w-3.5" />
        </B>
        <B onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Numbered list">
          <ListOrdered className="h-3.5 w-3.5" />
        </B>
        <div className="mx-1 h-4 w-px bg-border" />
        <B
          title="Insert link"
          onClick={() => {
            const url = window.prompt("URL", editor.getAttributes("link").href ?? "");
            if (url === null) return;
            if (url === "") editor.chain().focus().unsetLink().run();
            else editor.chain().focus().setLink({ href: url }).run();
          }}
        >
          <LinkIcon className="h-3.5 w-3.5" />
        </B>
        <B
          title="Insert image (upload)"
          onClick={() => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = "image/*";
            input.onchange = () => {
              const f = input.files?.[0];
              if (f) insertImageFromFile(f);
            };
            input.click();
          }}
        >
          <ImageIcon className="h-3.5 w-3.5" />
        </B>
        <B
          title="Insert table"
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        >
          <TableIcon className="h-3.5 w-3.5" />
        </B>
        <B onClick={() => setMathOpen(true)} title="Insert formula (LaTeX)">
          <Sigma className="h-3.5 w-3.5" />
        </B>
        <B onClick={() => setDiagOpen(true)} title="Insert diagram">
          <PenSquare className="h-3.5 w-3.5" />
        </B>
        <B onClick={() => insertMediaFile("audio")} title="Insert audio">
          <Music className="h-3.5 w-3.5" />
        </B>
        <B onClick={() => insertMediaFile("video")} title="Insert video">
          <Video className="h-3.5 w-3.5" />
        </B>
        <B onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Insert line">
          <Minus className="h-3.5 w-3.5" />
        </B>
        <B
          title="Insert page break"
          onClick={() =>
            editor.chain().focus().insertContent('<div class="qb-page-break" contenteditable="false">— Page break —</div><p></p>').run()
          }
        >
          <FileText className="h-3.5 w-3.5" />
        </B>
        <div className="mx-1 h-4 w-px bg-border" />
        <B onClick={() => editor.chain().focus().undo().run()} title="Undo">
          <Undo2 className="h-3.5 w-3.5" />
        </B>
        <B onClick={() => editor.chain().focus().redo().run()} title="Redo">
          <Redo2 className="h-3.5 w-3.5" />
        </B>
        {editor.isActive("table") && (
          <div className="ml-2 flex flex-wrap items-center gap-1 text-xs">
            <button className="rounded border px-1.5 py-0.5" type="button" onClick={() => editor.chain().focus().addRowAfter().run()}>+Row</button>
            <button className="rounded border px-1.5 py-0.5" type="button" onClick={() => editor.chain().focus().addColumnAfter().run()}>+Col</button>
            <button className="rounded border px-1.5 py-0.5" type="button" onClick={() => editor.chain().focus().deleteRow().run()}>−Row</button>
            <button className="rounded border px-1.5 py-0.5" type="button" onClick={() => editor.chain().focus().deleteColumn().run()}>−Col</button>
            <button className="rounded border px-1.5 py-0.5" type="button" onClick={() => editor.chain().focus().mergeCells().run()}>Merge</button>
            <button className="rounded border px-1.5 py-0.5" type="button" onClick={() => editor.chain().focus().splitCell().run()}>Split</button>
            <button className="rounded border px-1.5 py-0.5" type="button" onClick={() => editor.chain().focus().deleteTable().run()}>Delete</button>
          </div>
        )}
      </div>
      <div className={compact ? "px-3 py-2" : "px-3 py-3"}>
        <EditorContent editor={editor} />
      </div>

      <MathDialog open={mathOpen} onClose={() => setMathOpen(false)} onInsert={insertMath} />
      <DiagramDialog open={diagOpen} onClose={() => setDiagOpen(false)} onInsert={insertDiagram} />
    </div>
  );
}

function escapeAttr(s: string) {
  return s.replace(/"/g, "&quot;");
}
