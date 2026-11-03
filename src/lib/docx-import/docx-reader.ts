// Read a .docx directly and emit HTML that preserves per-run formatting
// (bold, underline, highlight, coloured text) as <strong>, <u>, <mark data-fmt="..."> tags.
// This is richer than mammoth's default output, which drops highlight and colour.
//
// Output shape (consumed by parse.ts):
//   <div>
//     <p>...text with <strong>bold</strong>, <u>underline</u>, <mark data-fmt="H">highlight</mark>...</p>
//     <p><img src="data:image/png;base64,..."/> Use the diagram to answer questions 5-7.</p>
//     <table><tr><td>...</td></tr></table>
//   </div>
import JSZip from "jszip";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";

export async function docxToRichHtml(file: File | ArrayBuffer | Uint8Array): Promise<string> {
  const buf: ArrayBuffer | Uint8Array =
    typeof (file as File).arrayBuffer === "function"
      ? await (file as File).arrayBuffer()
      : (file as ArrayBuffer | Uint8Array);
  const zip = await JSZip.loadAsync(buf);
  const docFile = zip.file("word/document.xml");
  if (!docFile) throw new Error("Not a valid .docx (missing word/document.xml).");
  const docXml = await docFile.async("string");
  const relsXml = (await zip.file("word/_rels/document.xml.rels")?.async("string")) ?? "";
  const stylesXml = (await zip.file("word/styles.xml")?.async("string")) ?? "";

  const rels = parseRels(relsXml);
  const styleFormats = parseStyleFormats(stylesXml);

  // Load media as data URLs.
  const media = new Map<string, string>();
  for (const [id, rel] of rels) {
    if (!rel.target.startsWith("media/")) continue;
    const path = `word/${rel.target}`;
    const entry = zip.file(path);
    if (!entry) continue;
    const b64 = await entry.async("base64");
    const ext = rel.target.split(".").pop()?.toLowerCase() ?? "png";
    const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "gif" ? "image/gif" : `image/${ext}`;
    media.set(id, `data:${mime};base64,${b64}`);
  }

  const doc = new DOMParser().parseFromString(docXml, "application/xml");
  const body = doc.getElementsByTagNameNS(W, "body")[0];
  if (!body) return "";

  const out: string[] = [];
  for (const node of Array.from(body.childNodes)) {
    if (node.nodeType !== 1) continue;
    const el = node as Element;
    if (el.namespaceURI !== W) continue;
    const local = el.localName;
    if (local === "p") out.push(paragraphToHtml(el, styleFormats, media));
    else if (local === "tbl") out.push(tableToHtml(el));
  }
  return out.join("");
}

interface Rel { id: string; type: string; target: string }
function parseRels(xml: string): Map<string, Rel> {
  const map = new Map<string, Rel>();
  if (!xml) return map;
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  for (const r of Array.from(doc.getElementsByTagName("Relationship"))) {
    map.set(r.getAttribute("Id") ?? "", {
      id: r.getAttribute("Id") ?? "",
      type: r.getAttribute("Type") ?? "",
      target: r.getAttribute("Target") ?? "",
    });
  }
  return map;
}

interface StyleFmt { bold?: boolean; underline?: boolean; italic?: boolean }
function parseStyleFormats(xml: string): Map<string, StyleFmt> {
  const map = new Map<string, StyleFmt>();
  if (!xml) return map;
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  for (const s of Array.from(doc.getElementsByTagNameNS(W, "style"))) {
    const id = s.getAttributeNS(W, "styleId") ?? "";
    const rPr = s.getElementsByTagNameNS(W, "rPr")[0];
    if (!id || !rPr) continue;
    map.set(id, {
      bold: hasOnFlag(rPr, "b"),
      underline: !!rPr.getElementsByTagNameNS(W, "u")[0],
      italic: hasOnFlag(rPr, "i"),
    });
  }
  return map;
}

function hasOnFlag(rPr: Element, tag: string): boolean {
  const el = rPr.getElementsByTagNameNS(W, tag)[0];
  if (!el) return false;
  const v = el.getAttributeNS(W, "val");
  return v === null || v === "" || v === "true" || v === "1" || v === "on";
}

function paragraphToHtml(p: Element, styles: Map<string, StyleFmt>, media: Map<string, string>): string {
  const pPr = p.getElementsByTagNameNS(W, "pPr")[0];
  const pStyleEl = pPr?.getElementsByTagNameNS(W, "pStyle")[0];
  const styleId = pStyleEl?.getAttributeNS(W, "val") ?? "";
  const styleFmt = styles.get(styleId) ?? {};

  // Detect Heading 1/2/3 style ids.
  const headingLevel = /^Heading([1-3])$/i.exec(styleId)?.[1];

  const parts: string[] = [];
  for (const child of Array.from(p.childNodes)) {
    if (child.nodeType !== 1) continue;
    const el = child as Element;
    if (el.namespaceURI !== W) continue;
    // Do NOT fold pStyleFmt bold/italic into every run — that made every run
    // look formatted and killed correct-answer detection in extractInlineOptions.
    // Emit paragraph-level bold once, around the whole paragraph, so
    // getFormattedRanges recognises it as "whole paragraph = no signal".
    if (el.localName === "r") parts.push(runToHtml(el, media));
    else if (el.localName === "hyperlink") {
      for (const r of Array.from(el.getElementsByTagNameNS(W, "r"))) parts.push(runToHtml(r, media));
    }
  }
  let inner = parts.join("");
  if (styleFmt.bold) inner = `<strong>${inner}</strong>`;
  const tag = headingLevel ? `h${headingLevel}` : "p";
  return `<${tag}>${inner}</${tag}>`;
}

function runToHtml(r: Element, media: Map<string, string>): string {
  const rPr = r.getElementsByTagNameNS(W, "rPr")[0];
  const bold = hasOnFlag(rPr ?? r, "b");
  const italic = hasOnFlag(rPr ?? r, "i");
  const uEl = rPr?.getElementsByTagNameNS(W, "u")[0];
  const underline = !!uEl && (uEl.getAttributeNS(W, "val") ?? "single") !== "none";
  const hlEl = rPr?.getElementsByTagNameNS(W, "highlight")[0];
  const highlight = !!hlEl && (hlEl.getAttributeNS(W, "val") ?? "none") !== "none";
  const colEl = rPr?.getElementsByTagNameNS(W, "color")[0];
  const colorVal = colEl?.getAttributeNS(W, "val") ?? "";
  const colored = !!colorVal && colorVal !== "auto" && colorVal.toLowerCase() !== "000000";

  // Text + break/tab.
  let text = "";
  for (const node of Array.from(r.childNodes)) {
    if (node.nodeType !== 1) continue;
    const el = node as Element;
    if (el.namespaceURI !== W) continue;
    if (el.localName === "t") text += el.textContent ?? "";
    else if (el.localName === "tab") text += "\t";
    else if (el.localName === "br") text += " ";
  }

  // Embedded images inside this run.
  let imgHtml = "";
  for (const blip of Array.from(r.getElementsByTagNameNS(A, "blip"))) {
    const embed = blip.getAttributeNS(R, "embed");
    if (!embed) continue;
    const src = media.get(embed);
    if (src) imgHtml += `<img src="${src}"/>`;
  }

  if (!text && !imgHtml) return "";
  let html = escapeHtml(text);
  const fmtFlags: string[] = [];
  if (bold) fmtFlags.push("B");
  if (underline) fmtFlags.push("U");
  if (highlight) fmtFlags.push("H");
  if (colored) fmtFlags.push("C");
  if (italic) fmtFlags.push("I");
  if (html) {
    if (bold) html = `<strong>${html}</strong>`;
    if (underline) html = `<u>${html}</u>`;
    if (highlight || colored) html = `<mark data-fmt="${fmtFlags.join("")}">${html}</mark>`;
    else if (fmtFlags.length && !bold && !underline) html = `<mark data-fmt="${fmtFlags.join("")}">${html}</mark>`;
  }
  return imgHtml + html;
}

function tableToHtml(tbl: Element): string {
  const rows: string[] = [];
  for (const tr of Array.from(tbl.getElementsByTagNameNS(W, "tr"))) {
    const cells: string[] = [];
    for (const tc of Array.from(tr.getElementsByTagNameNS(W, "tc"))) {
      const text = Array.from(tc.getElementsByTagNameNS(W, "t")).map((t) => t.textContent ?? "").join("");
      cells.push(`<td>${escapeHtml(text)}</td>`);
    }
    rows.push(`<tr>${cells.join("")}</tr>`);
  }
  return `<table>${rows.join("")}</table>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
