import { Component, Suspense, useState, type ReactNode } from "react";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { BookOpen, List, FolderTree, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { RichView } from "@/components/rich/RichView";
import { BankMediaView } from "./BankMediaEditor";
import { BankPassageView } from "./BankPassagePicker";
import { bankMediaEntries } from "@/lib/question-bank-media";
import { optionEntries } from "@/lib/exam-answer";
import { useAuth } from "@/lib/auth-context";
import { usePermissions } from "@/hooks/usePermissions";
import {
  BANK_DIFFICULTIES,
  BANK_STATUSES,
  EMPTY_BANK_FILTERS,
  BANK_PAGE_SIZE,
  bankReadAllowed,
  type BankSearch,
  type BankFilters,
} from "@/lib/question-bank";
import { bankCatalogOptions, bankRowsOptions, type BankCatalog } from "@/lib/question-bank-query";
import { BankQuestionActions } from "./BankQuestionActions";
import { BankBulkDelete, BankExportButton, useBankDeleteAllowed } from "./BankBulkTools";
import { Checkbox } from "@/components/ui/checkbox";

class BankErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state: { error: string | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  render() {
    return this.state.error ? (
      <div role="alert" className="space-y-3 border border-destructive rounded-md p-4">
        <p>Unable to load the Question Bank: {this.state.error}</p>
        <Button variant="outline" onClick={() => this.setState({ error: null })}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    ) : (
      this.props.children
    );
  }
}
export function QuestionBankPage({
  search,
  change,
}: {
  search: BankSearch;
  change: (next: BankSearch) => void;
}) {
  const { user, isStaff, loading } = useAuth();
  const permissions = usePermissions();
  if (loading || permissions.isLoading) return <p role="status">Loading Question Bank…</p>;
  if (
    !user ||
    !bankReadAllowed(
      isStaff,
      permissions.canAccess("exams", "read"),
      permissions.canAccessSubmodule("exams", "question-bank", "read"),
    )
  )
    return (
      <div role="alert">
        <h2 className="font-semibold text-xl">Question Bank access unavailable</h2>
        <p className="text-muted-foreground mt-2">
          Your account does not have permission to view this page.
        </p>
      </div>
    );
  return (
    <BankErrorBoundary key={JSON.stringify(search)}>
      <Suspense fallback={<p role="status">Loading Question Bank…</p>}>
        <BankContent userId={user.id} search={search} change={change} />
      </Suspense>
    </BankErrorBoundary>
  );
}
function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ id: string; name: string }>;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1 min-w-0">
      <Label>{label}</Label>
      <Select value={value || "all"} onValueChange={(v) => onChange(v === "all" ? "" : v)}>
        <SelectTrigger aria-label={label}>
          <SelectValue placeholder={`All ${label.toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All {label.toLowerCase()}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
function BankContent({
  userId,
  search,
  change,
}: {
  userId: string;
  search: BankSearch;
  change: (s: BankSearch) => void;
}) {
  const filters: BankFilters = {
    search: search.search,
    classId: search.classId,
    subjectId: search.subjectId,
    difficulty: search.difficulty,
    status: search.status,
  };
  const { data } = useSuspenseQuery(bankCatalogOptions(userId, filters));
  const [draft, setDraft] = useState(filters);
  const set = (field: keyof BankFilters, value: string) =>
    setDraft((old) => ({ ...old, [field]: value }));
  return (
    <div className="space-y-6 min-w-0">
      <header className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-primary" />
            Question Bank
          </h2>
          <p className="text-muted-foreground mt-1">
            {data.count.toLocaleString()} question(s) · organised by class &amp; subject
          </p>
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Question Bank view">
          <BankQuestionActions catalog={data} />
          <BankExportButton filters={filters} catalog={data} />
          <Button
            variant={search.view === "class" ? "default" : "outline"}
            aria-pressed={search.view === "class"}
            onClick={() => change({ ...search, view: "class", page: 1 })}
          >
            <FolderTree className="h-4 w-4 mr-2" />
            By class
          </Button>
          <Button
            variant={search.view === "list" ? "default" : "outline"}
            aria-pressed={search.view === "list"}
            onClick={() => change({ ...search, view: "list", page: 1 })}
          >
            <List className="h-4 w-4 mr-2" />
            List
          </Button>
        </div>
      </header>
      <form
        className="space-y-3 border-y py-4"
        onSubmit={(e) => {
          e.preventDefault();
          change({ ...search, ...draft, page: 1 });
        }}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
          <div className="space-y-1">
            <Label htmlFor="bank-search">Search</Label>
            <Input
              id="bank-search"
              value={draft.search}
              onChange={(e) => set("search", e.target.value)}
              placeholder="Search question text…"
              maxLength={200}
            />
          </div>
          <Choice
            label="Subjects"
            value={draft.subjectId}
            options={data.subjects}
            onChange={(v) => set("subjectId", v)}
          />
          <Choice
            label="Classes"
            value={draft.classId}
            options={data.classes}
            onChange={(v) => set("classId", v)}
          />
          <Choice
            label="Difficulty"
            value={draft.difficulty}
            options={BANK_DIFFICULTIES.map((v) => ({
              id: v,
              name: v.charAt(0).toUpperCase() + v.slice(1),
            }))}
            onChange={(v) => set("difficulty", v)}
          />
          <Choice
            label="Status"
            value={draft.status}
            options={BANK_STATUSES.map((v) => ({
              id: v,
              name: v.charAt(0).toUpperCase() + v.slice(1),
            }))}
            onChange={(v) => set("status", v)}
          />
        </div>
        <div className="flex gap-2">
          <Button type="submit">Apply filters</Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setDraft(EMPTY_BANK_FILTERS);
              change({ ...EMPTY_BANK_FILTERS, view: search.view, page: 1 });
            }}
          >
            Reset
          </Button>
        </div>
      </form>
      {!data.count ? (
        <p className="py-8 text-center text-muted-foreground">No questions match these filters.</p>
      ) : search.view === "list" ? (
        <QuestionRows
          userId={userId}
          filters={filters}
          page={search.page}
          onPage={(page) => change({ ...search, page })}
          catalog={data}
        />
      ) : (
        <Accordion type="multiple" className="space-y-3">
          {data.groups.map((c) => (
            <AccordionItem value={c.id} key={c.id} className="border rounded-md bg-background px-4">
              <AccordionTrigger className="hover:no-underline">
                <span className="flex flex-wrap items-center gap-3 text-left">
                  <FolderTree className="h-4 w-4 text-primary" />
                  <span className="font-semibold">{c.name}</span>
                  <Badge variant="secondary">{c.count}</Badge>
                  <span className="text-sm text-muted-foreground">
                    {c.subjects.length} subjects
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <Accordion type="multiple">
                  {c.subjects.map((s) => (
                    <AccordionItem key={s.id} value={s.id}>
                      <AccordionTrigger className="hover:no-underline">
                        <span className="flex gap-3 items-center">
                          {s.name}
                          <Badge variant="outline">{s.count}</Badge>
                        </span>
                      </AccordionTrigger>
                      <AccordionContent>
                        <SubjectRows
                          userId={userId}
                          filters={{ ...filters, classId: c.id, subjectId: s.id }}
                          catalog={data}
                        />
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
}
function SubjectRows({
  userId,
  filters,
  catalog,
}: {
  userId: string;
  filters: BankFilters;
  catalog: BankCatalog;
}) {
  const [page, setPage] = useState(1);
  return (
    <QuestionRows
      userId={userId}
      filters={filters}
      page={page}
      onPage={setPage}
      catalog={catalog}
    />
  );
}
function QuestionRows({
  userId,
  filters,
  page,
  onPage,
  catalog,
}: {
  userId: string;
  filters: BankFilters;
  page: number;
  onPage: (n: number) => void;
  catalog: BankCatalog;
}) {
  const query = useQuery(bankRowsOptions(userId, filters, page));
  const canDelete = useBankDeleteAllowed();
  const [selected, setSelected] = useState<string[]>([]);
  if (query.isPending) return <p role="status">Loading questions…</p>;
  if (query.isError)
    return (
      <div role="alert" className="space-y-2">
        <p>Unable to load questions: {query.error.message}</p>
        <Button variant="outline" onClick={() => void query.refetch()}>
          Retry
        </Button>
      </div>
    );
  const { rows, count, passages } = query.data;
  const pages = Math.max(1, Math.ceil(count / BANK_PAGE_SIZE));
  const visible = selected.filter((id) => rows.some((r) => r.id === id));
  const allOn = rows.length > 0 && visible.length === rows.length;
  return (
    <div className="space-y-3">
      {canDelete && rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={allOn}
              onCheckedChange={(v) => setSelected(v ? rows.map((r) => r.id) : [])}
              aria-label="Select all on this page"
            />
            Select page
          </label>
          <BankBulkDelete ids={visible} onDone={() => setSelected([])} />
        </div>
      )}
      <div className="divide-y">
        {rows.map((q) => (
          <article key={q.id} className="py-4 space-y-3 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {canDelete && (
                <Checkbox
                  checked={visible.includes(q.id)}
                  onCheckedChange={(v) =>
                    setSelected((s) => (v ? [...s, q.id] : s.filter((x) => x !== q.id)))
                  }
                  aria-label="Select question"
                />
              )}
              <BankQuestionActions catalog={catalog} id={q.id} />
              <Badge variant="outline">{q.question_type.replaceAll("_", " ")}</Badge>
              <Badge variant="secondary">{q.status}</Badge>
              <span className="text-muted-foreground">
                {q.difficulty} · {q.marks} marks
              </span>
              <span className="text-muted-foreground">
                {catalog.classes.find((c) => c.id === q.class_id)?.name ?? "Unavailable class"} ·{" "}
                {catalog.subjects.find((s) => s.id === q.subject_id)?.name ?? "Unavailable subject"}
              </span>
            </div>
            {q.stimulus_id &&
              (() => {
                const passage = passages.find(
                  (p) =>
                    p.id === q.stimulus_id &&
                    p.class_id === q.class_id &&
                    p.subject_id === q.subject_id,
                );
                return passage ? (
                  <BankPassageView passage={passage} />
                ) : (
                  <p className="text-muted-foreground">Shared passage unavailable</p>
                );
              })()}
            {q.section_label && <p className="font-medium text-sm">{q.section_label}</p>}
            {q.section_instruction && (
              <RichView content={q.section_instruction} className="text-sm text-muted-foreground" />
            )}
            <RichView content={q.question_text} />
            {optionEntries(q.options).length > 0 && (
              <div className="grid sm:grid-cols-2 gap-2 text-sm">
                {optionEntries(q.options).map(([key, text]) => (
                  <div key={key} className="flex gap-2">
                    <span className="font-medium">{key}.</span>
                    <RichView content={text} />
                  </div>
                ))}
              </div>
            )}
            <BankMediaView media={bankMediaEntries(q.media)} />
          </article>
        ))}
      </div>
      {!rows.length && <p className="text-muted-foreground">No questions on this page.</p>}
      <PaginationBar
        page={page}
        totalPages={pages}
        totalItems={count}
        start={(page - 1) * BANK_PAGE_SIZE}
        end={Math.min(page * BANK_PAGE_SIZE, count)}
        onPageChange={onPage}
      />
    </div>
  );
}
