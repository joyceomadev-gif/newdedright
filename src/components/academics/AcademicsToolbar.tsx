import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Printer, FileSpreadsheet, Upload, FileDown } from "lucide-react";
import { toast } from "sonner";
import {
  exportToExcel,
  printTable,
  parseUploadFile,
  downloadTemplate,
  type ColumnDef,
} from "@/lib/academics-io";

interface Props<T> {
  title: string;
  rows: T[];
  columns: ColumnDef<T>[];
  filename: string;
  canImport?: boolean;
  importHeaders?: string[];
  onImport?: (rows: Record<string, string>[]) => Promise<void> | void;
}

export function AcademicsToolbar<T>({
  title,
  rows,
  columns,
  filename,
  canImport,
  importHeaders,
  onImport,
}: Props<T>) {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !onImport) return;
    try {
      const parsed = await parseUploadFile(file);
      if (parsed.length === 0) {
        toast.error("No rows found in file.");
        return;
      }
      await onImport(parsed);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to import file.");
    }
  };

  return (
    <div className="flex items-center gap-1">
      {canImport && onImport && (
        <>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleFile}
          />
          {importHeaders && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => downloadTemplate(`${filename}-template`, importHeaders)}
              title="Download import template"
            >
              <FileDown className="h-4 w-4 mr-1" />Template
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4 mr-1" />Upload
          </Button>
        </>
      )}
      <Button
        size="sm"
        variant="outline"
        onClick={() => exportToExcel(filename, title, rows, columns)}
        disabled={rows.length === 0}
      >
        <FileSpreadsheet className="h-4 w-4 mr-1" />Excel
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => printTable(title, rows, columns)}
        disabled={rows.length === 0}
      >
        <Printer className="h-4 w-4 mr-1" />Print
      </Button>
    </div>
  );
}
