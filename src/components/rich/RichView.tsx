import { useMemo } from "react";
import katex from "katex";
import DOMPurify from "dompurify";
import "katex/dist/katex.min.css";

interface Props { content: string; className?: string; }

/**
 * Shared pipeline for question HTML: render $…$ / $$…$$ math with KaTeX,
 * then sanitize the result with DOMPurify. Used by both teacher-facing and
 * student-facing screens so they behave identically.
 */
export function renderRichHtml(html: string): string {
  return sanitizeHtml(processMathInHtml(html ?? ""));
}

/** Inline/blocks of already-HTML question content, math-rendered and sanitized. */
export function RichHtml({ html, className, inline }: { html: string; className?: string; inline?: boolean }) {
  const out = useMemo(() => renderRichHtml(html), [html]);
  const cls = `qb-prose ${inline ? "inline" : ""} ${className ?? ""}`;
  const props = { className: cls, dangerouslySetInnerHTML: { __html: out } };
  return inline ? <span {...props} /> : <div {...props} />;
}

/**
 * Renders a string that may contain:
 *  - $$latex$$ or $latex$  math segments
 *  - ![alt](data:image/...) inline diagram images
 *  - plain text / newlines
 */
export function RichView({ content, className }: Props) {
  const raw = content || "";
  const isHtml = useMemo(() => /<[a-z][\s\S]*>/i.test(raw), [raw]);
  // Detect markdown-style numbered lists ("1. item" on consecutive lines)
  const hasNumberedList = useMemo(() => /\n\d+\.\s/.test("\n" + raw), [raw]);

  // If content has HTML tags OR numbered lists, render via HTML path
  if (isHtml || hasNumberedList) {
    const html = hasNumberedList && !isHtml ? convertNumberedListsToHtml(raw) : raw;
    const processed = processMathInHtml(html);
    const sanitized = sanitizeHtml(processed);
    return (
      <div
        className={`qb-prose whitespace-normal break-words [&_img]:max-h-64 [&_img]:max-w-full [&_img]:object-contain [&_img]:rounded [&_img]:my-1.5 [&_img]:border [&_ol]:list-decimal [&_ol]:ml-5 [&_ul]:list-disc [&_ul]:ml-5 ${className ?? ""}`}
        dangerouslySetInnerHTML={{ __html: sanitized }}
      />
    );
  }

  const nodes = useMemo(() => parse(raw), [raw]);
  return (
    <div className={`whitespace-pre-wrap break-words ${className ?? ""}`}>
      {nodes.map((n, i) => {
        if (n.type === "math") {
          const html = safeKatex(n.value, n.display);
          return <span key={i} dangerouslySetInnerHTML={{ __html: html }} />;
        }
        if (n.type === "image") {
          return (
            <img
              key={i}
              src={n.url}
              alt={n.alt}
              className="inline-block max-w-full max-h-64 object-contain my-1 border rounded"
            />
          );
        }
        return <span key={i}>{n.value}</span>;
      })}
    </div>
  );
}

/**
 * Convert markdown-style numbered lists ("1. item\n2. item") to HTML <ol><li>.
 * Also converts bullet lists ("- item" or "* item") to <ul><li>.
 */
function convertNumberedListsToHtml(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let inOl = false;
  let inUl = false;

  for (const line of lines) {
    const olMatch = line.match(/^\s*(\d+)\.\s+(.*)/);
    const ulMatch = line.match(/^\s*[-*]\s+(.*)/);
    // Don't escape lines containing LaTeX — they need raw $ delimiters for processMathInHtml
    const isLatex = /\$\$?/.test(line);

    if (olMatch) {
      if (!inOl) { if (inUl) { out.push("</ul>"); inUl = false; } out.push("<ol>"); inOl = true; }
      out.push("<li>" + (isLatex ? olMatch[2] : escapeHtml(olMatch[2])) + "</li>");
    } else if (ulMatch) {
      if (!inUl) { if (inOl) { out.push("</ol>"); inOl = false; } out.push("<ul>"); inUl = true; }
      out.push("<li>" + (isLatex ? ulMatch[1] : escapeHtml(ulMatch[1])) + "</li>");
    } else {
      if (inOl) { out.push("</ol>"); inOl = false; }
      if (inUl) { out.push("</ul>"); inUl = false; }
      out.push(isLatex ? line : escapeHtml(line));
    }
  }
  if (inOl) out.push("</ol>");
  if (inUl) out.push("</ul>");
  return out.join("\n");
}

function processMathInHtml(html: string): string {
  return html.replace(/\$\$([\s\S]+?)\$\$|\$([^\n$]+?)\$/g, (_, m1, m2) => {
    if (m1 != null) return safeKatex(m1, true);
    if (m2 != null) return safeKatex(m2, false);
    return _;
  });
}

function sanitizeHtml(html: string): string {
  // KaTeX emits MathML + annotation elements; keep them while stripping scripts/handlers.
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true, mathMl: true, svg: true },
    ADD_ATTR: ["target", "rel", "aria-hidden", "style"],
  });
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function safeKatex(src: string, display: boolean) {
  try { return katex.renderToString(src, { throwOnError: false, displayMode: display }); }
  catch { return `<span class="text-destructive">${escapeHtml(src)}</span>`; }
}

type Node =
  | { type: "text"; value: string }
  | { type: "math"; value: string; display: boolean }
  | { type: "image"; url: string; alt: string };

function parse(s: string): Node[] {
  const out: Node[] = [];
  // Regex tokens: $$...$$  |  $...$  |  ![alt](url)
  const re = /\$\$([\s\S]+?)\$\$|\$([^\n$]+?)\$|!\[([^\]]*)\]\(([^)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) out.push({ type: "text", value: s.slice(last, m.index) });
    if (m[1] != null) out.push({ type: "math", value: m[1], display: true });
    else if (m[2] != null) out.push({ type: "math", value: m[2], display: false });
    else if (m[4] != null) out.push({ type: "image", url: m[4], alt: m[3] ?? "" });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ type: "text", value: s.slice(last) });
  return out;
}
