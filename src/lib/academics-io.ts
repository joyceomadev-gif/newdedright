import * as XLSX from "xlsx";

export interface ColumnDef<T> {
  header: string;
  accessor: (row: T) => string | number | null | undefined;
}

export function exportToExcel<T>(filename: string, sheetName: string, rows: T[], columns: ColumnDef<T>[]) {
  const data = rows.map((r) => {
    const obj: Record<string, string | number | null | undefined> = {};
    for (const c of columns) obj[c.header] = c.accessor(r) ?? "";
    return obj;
  });
  const ws = XLSX.utils.json_to_sheet(data, { header: columns.map((c) => c.header) });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 30) || "Sheet1");
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

export function printTable<T>(title: string, rows: T[], columns: ColumnDef<T>[]) {
  const esc = (v: unknown) =>
    String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
  const head = columns.map((c) => `<th>${esc(c.header)}</th>`).join("");
  const body = rows
    .map((r) => `<tr>${columns.map((c) => `<td>${esc(c.accessor(r) ?? "")}</td>`).join("")}</tr>`)
    .join("");
  const html = `<!doctype html><html><head><title>${esc(title)}</title>
    <style>
      body{font-family:system-ui,Arial,sans-serif;padding:24px;color:#111}
      h1{font-size:18px;margin:0 0 12px}
      .meta{color:#666;font-size:12px;margin-bottom:16px}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;vertical-align:top}
      th{background:#f3f4f6}
      tr:nth-child(even) td{background:#fafafa}
      @media print{ button{display:none} }
    </style></head><body>
    <h1>${esc(title)}</h1>
    <div class="meta">Generated ${new Date().toLocaleString()}</div>
    <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
    <script>window.onload=()=>{window.print()}</script>
    </body></html>`;
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}

export async function parseUploadFile(file: File): Promise<Record<string, string>[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  return json.map((r) => {
    const o: Record<string, string> = {};
    for (const k of Object.keys(r)) o[k.trim().toLowerCase()] = String(r[k] ?? "").trim();
    return o;
  });
}

export function downloadTemplate(filename: string, headers: string[]) {
  const ws = XLSX.utils.aoa_to_sheet([headers]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Template");
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}
