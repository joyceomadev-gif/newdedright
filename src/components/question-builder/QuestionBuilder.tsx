import { normalizeMcqAnswer, optionEntries } from "@/lib/exam-answer";
import { useMemo, useState } from "react";
import { RichView } from "@/components/rich/RichView";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  BuilderDoc,
  BuilderItem,
  SubQuestion,
  emptyQuestion,
  emptyGroup,
  uid,
  itemTotalMarks,
  type BuilderQType,
  type SharedResource,
} from "./types";
import { buildFromTemplate, TEMPLATES, type TemplateId } from "./templates";
import { TipTapEditor } from "./TipTapEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Copy,
  Trash2,
  Plus,
  GripVertical,
  ChevronDown,
  ChevronUp,
  Layers,
  MinusCircle,
  Eye,
  EyeOff,
  FileText,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

const SHARED_LABELS: Record<SharedResource["kind"], string> = {
  instruction: "Instruction",
  passage: "Passage",
  image: "Image",
  table: "Table",
  diagram: "Diagram",
  formula: "Formula",
  chart: "Chart",
};

interface Props {
  doc: BuilderDoc;
  onChange: (doc: BuilderDoc) => void;
}

export function QuestionBuilder({ doc, onChange }: Props) {
  const [showPreview, setShowPreview] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const totalMarks = useMemo(() => doc.items.reduce((a, it) => a + itemTotalMarks(it), 0), [doc]);
  const totalQuestions = useMemo(
    () => doc.items.reduce((a, it) => a + (it.kind === "question" ? 1 : it.group.questions.length), 0),
    [doc],
  );

  function updateItems(next: BuilderItem[]) {
    onChange({ ...doc, items: next });
  }
  function replaceItem(id: string, updater: (it: BuilderItem) => BuilderItem) {
    updateItems(doc.items.map((it) => (it.id === id ? updater(it) : it)));
  }
  function removeItem(id: string) {
    updateItems(doc.items.filter((it) => it.id !== id));
  }
  function duplicateItem(id: string) {
    const idx = doc.items.findIndex((it) => it.id === id);
    if (idx < 0) return;
    const copy = deepCloneItem(doc.items[idx]);
    const next = [...doc.items];
    next.splice(idx + 1, 0, copy);
    updateItems(next);
  }
  function addQuestion() {
    updateItems([...doc.items, { id: uid(), kind: "question", question: emptyQuestion("theory") }]);
  }
  function addGroup() {
    updateItems([...doc.items, { id: uid(), kind: "group", group: emptyGroup() }]);
  }
  function convertToGroup(id: string) {
    replaceItem(id, (it) => {
      if (it.kind === "group") return it;
      return {
        id: it.id,
        kind: "group",
        group: {
          id: uid(),
          shared: [{ id: uid(), kind: "instruction", html: "" }],
          questions: [it.question],
        },
      };
    });
  }
  function ungroup(id: string) {
    const idx = doc.items.findIndex((it) => it.id === id);
    if (idx < 0) return;
    const it = doc.items[idx];
    if (it.kind !== "group") return;
    const newItems: BuilderItem[] = it.group.questions.map((q) => ({
      id: uid(),
      kind: "question",
      question: q,
    }));
    const next = [...doc.items];
    next.splice(idx, 1, ...newItems);
    updateItems(next);
  }
  function applyTemplate(id: TemplateId) {
    const t = buildFromTemplate(id);
    onChange({ ...doc, items: [...doc.items, ...t.items] });
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = doc.items.findIndex((i) => i.id === active.id);
    const newIndex = doc.items.findIndex((i) => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    updateItems(arrayMove(doc.items, oldIndex, newIndex));
  }

  return (
    <div className="space-y-3">
      {/* Top toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-2 py-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="default" className="gap-1">
              <FileText className="h-4 w-4" /> Create from Exam Paper
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel>Pick a template</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {TEMPLATES.map((t) => (
              <DropdownMenuItem key={t.id} onClick={() => applyTemplate(t.id)} className="flex flex-col items-start gap-0.5">
                <span className="font-medium">{t.label}</span>
                <span className="text-xs text-muted-foreground">{t.description}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button size="sm" variant="outline" className="gap-1" onClick={addQuestion}>
          <Plus className="h-4 w-4" /> Question
        </Button>
        <Button size="sm" variant="outline" className="gap-1" onClick={addGroup}>
          <Layers className="h-4 w-4" /> Question Group
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Badge variant="secondary">{totalQuestions} question{totalQuestions === 1 ? "" : "s"}</Badge>
          <Badge variant="outline">{totalMarks} marks</Badge>
          <Button size="sm" variant="ghost" className="gap-1" onClick={() => setShowPreview((s) => !s)}>
            {showPreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {showPreview ? "Edit" : "Preview"}
          </Button>
        </div>
      </div>

      {showPreview ? (
        <PreviewPanel doc={doc} />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={doc.items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {doc.items.map((item, index) => (
                <SortableItem key={item.id} id={item.id}>
                  {item.kind === "question" ? (
                    <QuestionCard
                      number={itemNumber(doc.items, index)}
                      item={item}
                      onChange={(next) => replaceItem(item.id, () => next)}
                      onDelete={() => removeItem(item.id)}
                      onDuplicate={() => duplicateItem(item.id)}
                      onConvertToGroup={() => convertToGroup(item.id)}
                    />
                  ) : (
                    <GroupCard
                      startNumber={itemNumber(doc.items, index)}
                      item={item}
                      onChange={(next) => replaceItem(item.id, () => next)}
                      onDelete={() => removeItem(item.id)}
                      onDuplicate={() => duplicateItem(item.id)}
                      onUngroup={() => ungroup(item.id)}
                    />
                  )}
                </SortableItem>
              ))}
              {doc.items.length === 0 && (
                <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                  No questions yet. Use the template picker above or add a blank question.
                </div>
              )}
            </div>
          </SortableContext>
        </DndContext>
      )}

    </div>
  );
}

/* ---------- Sortable wrapper ---------- */
function SortableItem({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="relative"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="absolute -left-6 top-3 hidden md:flex h-6 w-6 items-center justify-center text-muted-foreground hover:text-foreground cursor-grab"
        title="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      {children}
    </div>
  );
}

/* ---------- Question card ---------- */
function QuestionCard({
  item,
  number,
  onChange,
  onDelete,
  onDuplicate,
  onConvertToGroup,
}: {
  item: Extract<BuilderItem, { kind: "question" }>;
  number: number;
  onChange: (next: BuilderItem) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onConvertToGroup: () => void;
}) {
  const q = item.question;
  function set<K extends keyof typeof q>(k: K, v: (typeof q)[K]) {
    onChange({ ...item, question: { ...q, [k]: v } });
  }
  function setSub(subs: SubQuestion[]) {
    set("subQuestions", subs);
  }
  function addSub() {
    setSub([...q.subQuestions, { id: uid(), html: "", marks: 1 }]);
  }
  function updateSub(id: string, patch: Partial<SubQuestion>) {
    setSub(q.subQuestions.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }
  function removeSub(id: string) {
    setSub(q.subQuestions.filter((s) => s.id !== id));
  }
  function duplicateSub(id: string) {
    const idx = q.subQuestions.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const copy = { ...q.subQuestions[idx], id: uid() };
    const next = [...q.subQuestions];
    next.splice(idx + 1, 0, copy);
    setSub(next);
  }
  function moveSub(id: string, dir: -1 | 1) {
    const idx = q.subQuestions.findIndex((s) => s.id === id);
    const to = idx + dir;
    if (idx < 0 || to < 0 || to >= q.subQuestions.length) return;
    setSub(arrayMove(q.subQuestions, idx, to));
  }

  return (
    <Card className="p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="default">Q{number}</Badge>
        <Select value={q.qType} onValueChange={(v) => set("qType", v as BuilderQType)}>
          <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="theory">Theory</SelectItem>
            <SelectItem value="mcq">Multiple choice</SelectItem>
            <SelectItem value="short_answer">Short answer</SelectItem>
            <SelectItem value="fill_gap">Fill in the gap</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1">
          <Label className="text-xs">Marks</Label>
          <Input
            type="number"
            min={0}
            value={q.marks}
            onChange={(e) => set("marks", Number(e.target.value) || 0)}
            className="h-8 w-16"
          />
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={onConvertToGroup} title="Convert to Question Group">
            <Layers className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={onDuplicate} title="Duplicate">
            <Copy className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={onDelete} title="Delete">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>

      <TipTapEditor value={q.html} onChange={(html) => set("html", html)} placeholder="Question…" />

      {q.qType === "mcq" && (
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wide">Options</Label>
          {(q.options ?? ["", "", "", "", ""]).map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-5 text-sm font-medium">{String.fromCharCode(65 + i)}.</span>
              <Input
                value={opt}
                onChange={(e) => {
                  const base = q.options && q.options.length > 0 ? q.options : ["", "", "", "", ""];
                  const next = [...base];
                  next[i] = e.target.value;
                  set("options", next);
                }}
              />
            </div>
          ))}
          <div className="flex items-center gap-2">
            <Label className="text-xs">Correct answer</Label>
            <Select
              value={normalizeMcqAnswer(q.correctAnswer, q.options) || "none"}
              onValueChange={(v) => set("correctAnswer", v === "none" ? "" : v)}
            >
              <SelectTrigger className="h-8 w-64"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Select —</SelectItem>
                {optionEntries(q.options).map(([key, o]) => (
                  <SelectItem key={key} value={key}>{key}. {o}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {(q.qType === "short_answer" || q.qType === "fill_gap") && (
        <div className="flex items-center gap-2">
          <Label className="text-xs whitespace-nowrap">Expected answer</Label>
          <Input value={q.correctAnswer ?? ""} onChange={(e) => set("correctAnswer", e.target.value)} />
        </div>
      )}

      {/* Sub-questions */}
      {q.subQuestions.length > 0 && (
        <div className="space-y-2 rounded-md border bg-muted/30 p-2">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Sub-questions</div>
          {q.subQuestions.map((s, i) => (
            <div key={s.id} className="rounded-md border bg-background p-2 space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{number}{String.fromCharCode(97 + i)}</Badge>
                <div className="flex items-center gap-1">
                  <Label className="text-xs">Marks</Label>
                  <Input
                    type="number"
                    min={0}
                    value={s.marks}
                    onChange={(e) => updateSub(s.id, { marks: Number(e.target.value) || 0 })}
                    className="h-7 w-16"
                  />
                </div>
                <div className="ml-auto flex items-center gap-0.5">
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => moveSub(s.id, -1)}><ChevronUp className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => moveSub(s.id, 1)}><ChevronDown className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => duplicateSub(s.id)} title="Duplicate"><Copy className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => removeSub(s.id)} title="Remove"><MinusCircle className="h-3.5 w-3.5 text-destructive" /></Button>
                </div>
              </div>
              <TipTapEditor value={s.html} onChange={(html) => updateSub(s.id, { html })} placeholder={`Sub-question ${String.fromCharCode(97 + i)}…`} minHeight={80} compact />
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground">Model answer / marking guide (optional)</summary>
                <div className="mt-2 grid gap-2">
                  <TipTapEditor value={s.modelAnswer ?? ""} onChange={(html) => updateSub(s.id, { modelAnswer: html })} placeholder="Model answer…" minHeight={60} compact />
                  <TipTapEditor value={s.markingGuide ?? ""} onChange={(html) => updateSub(s.id, { markingGuide: html })} placeholder="Marking guide…" minHeight={60} compact />
                </div>
              </details>
            </div>
          ))}
        </div>
      )}

      <Button size="sm" variant="outline" className="gap-1" onClick={addSub}>
        <Plus className="h-3.5 w-3.5" /> Add sub-question
      </Button>
    </Card>
  );
}

/* ---------- Group card ---------- */
function GroupCard({
  item,
  startNumber,
  onChange,
  onDelete,
  onDuplicate,
  onUngroup,
}: {
  item: Extract<BuilderItem, { kind: "group" }>;
  startNumber: number;
  onChange: (next: BuilderItem) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onUngroup: () => void;
}) {
  const g = item.group;
  function updateShared(next: SharedResource[]) {
    onChange({ ...item, group: { ...g, shared: next } });
  }
  function updateQuestions(next: typeof g.questions) {
    onChange({ ...item, group: { ...g, questions: next } });
  }
  function addShared(kind: SharedResource["kind"]) {
    updateShared([...g.shared, { id: uid(), kind, html: "" }]);
  }
  function editShared(id: string, patch: Partial<SharedResource>) {
    updateShared(g.shared.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }
  function removeShared(id: string) {
    updateShared(g.shared.filter((s) => s.id !== id));
  }
  function moveShared(id: string, dir: -1 | 1) {
    const i = g.shared.findIndex((s) => s.id === id);
    const to = i + dir;
    if (i < 0 || to < 0 || to >= g.shared.length) return;
    updateShared(arrayMove(g.shared, i, to));
  }
  function addChild() {
    updateQuestions([...g.questions, emptyQuestion("theory")]);
  }
  function updateChild(qid: string, patch: Partial<typeof g.questions[number]>) {
    updateQuestions(g.questions.map((q) => (q.id === qid ? { ...q, ...patch } : q)));
  }
  function removeChild(qid: string) {
    updateQuestions(g.questions.filter((q) => q.id !== qid));
  }
  function duplicateChild(qid: string) {
    const i = g.questions.findIndex((q) => q.id === qid);
    if (i < 0) return;
    const copy = { ...g.questions[i], id: uid(), subQuestions: g.questions[i].subQuestions.map((s) => ({ ...s, id: uid() })) };
    const next = [...g.questions];
    next.splice(i + 1, 0, copy);
    updateQuestions(next);
  }
  function moveChild(qid: string, dir: -1 | 1) {
    const i = g.questions.findIndex((q) => q.id === qid);
    const to = i + dir;
    if (i < 0 || to < 0 || to >= g.questions.length) return;
    updateQuestions(arrayMove(g.questions, i, to));
  }

  const endNumber = startNumber + g.questions.length - 1;

  return (
    <Card className="border-primary/40 bg-primary/5 p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="default" className="gap-1"><Layers className="h-3 w-3" /> Group</Badge>
        <span className="text-sm text-muted-foreground">
          Shared content used by questions {startNumber}
          {endNumber !== startNumber ? `–${endNumber}` : ""}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1"><Plus className="h-3.5 w-3.5" /> Shared</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {Object.entries(SHARED_LABELS).map(([k, label]) => (
                <DropdownMenuItem key={k} onClick={() => addShared(k as SharedResource["kind"])}>{label}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" variant="ghost" onClick={onUngroup} title="Ungroup">Ungroup</Button>
          <Button size="sm" variant="ghost" onClick={onDuplicate} title="Duplicate"><Copy className="h-4 w-4" /></Button>
          <Button size="sm" variant="ghost" onClick={onDelete} title="Delete"><Trash2 className="h-4 w-4 text-destructive" /></Button>
        </div>
      </div>

      {/* Shared blocks */}
      <div className="space-y-2">
        {g.shared.map((s) => (
          <div key={s.id} className="rounded-md border bg-background p-2 space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{SHARED_LABELS[s.kind]}</Badge>
              <Input
                placeholder="Optional caption"
                value={s.caption ?? ""}
                onChange={(e) => editShared(s.id, { caption: e.target.value })}
                className="h-7 max-w-xs"
              />
              <div className="ml-auto flex items-center gap-0.5">
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => moveShared(s.id, -1)}><ChevronUp className="h-3.5 w-3.5" /></Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => moveShared(s.id, 1)}><ChevronDown className="h-3.5 w-3.5" /></Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => removeShared(s.id)}><MinusCircle className="h-3.5 w-3.5 text-destructive" /></Button>
              </div>
            </div>
            <TipTapEditor
              value={s.html}
              onChange={(html) => editShared(s.id, { html })}
              placeholder={`Enter ${SHARED_LABELS[s.kind].toLowerCase()}…`}
              minHeight={80}
              compact
            />
          </div>
        ))}
      </div>

      {/* Child questions */}
      <div className="space-y-2">
        {g.questions.map((q, i) => {
          const num = startNumber + i;
          return (
            <Card key={q.id} className="p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>Q{num}</Badge>
                <Select value={q.qType} onValueChange={(v) => updateChild(q.id, { qType: v as BuilderQType })}>
                  <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="theory">Theory</SelectItem>
                    <SelectItem value="mcq">Multi-choice</SelectItem>
                    <SelectItem value="short_answer">Short answer</SelectItem>
                    <SelectItem value="fill_gap">Fill in gap</SelectItem>
                  </SelectContent>
                </Select>
                <Label className="text-xs">Marks</Label>
                <Input
                  type="number"
                  min={0}
                  value={q.marks}
                  onChange={(e) => updateChild(q.id, { marks: Number(e.target.value) || 0 })}
                  className="h-8 w-16"
                />
                <div className="ml-auto flex items-center gap-0.5">
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => moveChild(q.id, -1)}><ChevronUp className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => moveChild(q.id, 1)}><ChevronDown className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => duplicateChild(q.id)} title="Duplicate"><Copy className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => removeChild(q.id)}><MinusCircle className="h-3.5 w-3.5 text-destructive" /></Button>
                </div>
              </div>
              <TipTapEditor value={q.html} onChange={(html) => updateChild(q.id, { html })} placeholder="Question…" minHeight={80} compact />
              {q.qType === "mcq" && (
                <div className="space-y-1">
                  {(q.options ?? ["", "", "", "", ""]).map((opt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-5 text-sm font-medium">{String.fromCharCode(65 + i)}.</span>
                      <Input
                        value={opt}
                        onChange={(e) => {
                          const base = q.options && q.options.length > 0 ? q.options : ["", "", "", "", ""];
                          const next = [...base];
                          next[i] = e.target.value;
                          updateChild(q.id, { options: next });
                        }}
                      />
                    </div>
                  ))}
                  <div className="flex items-center gap-2">
                    <Label className="text-xs">Correct</Label>
                    <Select value={normalizeMcqAnswer(q.correctAnswer, q.options) || "none"} onValueChange={(v) => updateChild(q.id, { correctAnswer: v === "none" ? "" : v })}>
                      <SelectTrigger className="h-8 w-64"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— Select —</SelectItem>
                        {optionEntries(q.options).map(([key, o]) => (
                          <SelectItem key={key} value={key}>{key}. {o}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
              {(q.qType === "short_answer" || q.qType === "fill_gap") && (
                <div className="flex items-center gap-2">
                  <Label className="text-xs whitespace-nowrap">Expected</Label>
                  <Input value={q.correctAnswer ?? ""} onChange={(e) => updateChild(q.id, { correctAnswer: e.target.value })} />
                </div>
              )}
            </Card>
          );
        })}
        <Button size="sm" variant="outline" className="gap-1" onClick={addChild}>
          <Plus className="h-3.5 w-3.5" /> Add question to group
        </Button>
      </div>
    </Card>
  );
}

/* ---------- Preview ---------- */
function PreviewPanel({ doc }: { doc: BuilderDoc }) {
  return (
    <div className="rounded-md border bg-background p-4 space-y-4">
      {doc.items.map((it, idx) => {
        const start = itemNumber(doc.items, idx);
        if (it.kind === "question") {
          return <QuestionPreview key={it.id} q={it.question} number={start} />;
        }
        return (
          <div key={it.id} className="rounded-md border-l-4 border-primary/60 bg-primary/5 p-3 space-y-3">
            {it.group.shared.map((s) => (
              <div key={s.id} className="space-y-1">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{SHARED_LABELS[s.kind]}</div>
                <div className="qb-prose" dangerouslySetInnerHTML={{ __html: s.html || "<em class='text-muted-foreground'>Empty</em>" }} />
                {s.caption && <div className="text-xs italic text-muted-foreground">{s.caption}</div>}
              </div>
            ))}
            <div className="space-y-3">
              {it.group.questions.map((q, i) => (
                <QuestionPreview key={q.id} q={q} number={start + i} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
function QuestionPreview({ q, number }: { q: import("./types").BuilderQuestion; number: number }) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2">
        <span className="font-semibold">{number}.</span>
        <div className="flex-1 qb-prose" dangerouslySetInnerHTML={{ __html: q.html || "<em class='text-muted-foreground'>Empty question</em>" }} />
        <span className="text-xs text-muted-foreground whitespace-nowrap">({q.marks} mk)</span>
      </div>
      {q.qType === "mcq" && q.options?.some((o) => o.trim()) && (
        <ol className="ml-6 list-[upper-alpha] space-y-0.5 text-sm">
          {q.options.filter((o) => o.trim()).map((o, i) => (<li key={i}><RichView content={o} className="inline" /></li>))}
        </ol>
      )}
      {q.subQuestions.length > 0 && (
        <ol className="ml-6 list-[lower-alpha] space-y-2 text-sm">
          {q.subQuestions.map((s) => (
            <li key={s.id}>
              <div className="qb-prose" dangerouslySetInnerHTML={{ __html: s.html || "<em class='text-muted-foreground'>Empty</em>" }} />
              {s.marks ? <span className="text-xs text-muted-foreground"> ({s.marks} mk)</span> : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/* ---------- Helpers ---------- */
function itemNumber(items: BuilderItem[], index: number): number {
  let n = 1;
  for (let i = 0; i < index; i++) {
    n += items[i].kind === "question" ? 1 : items[i].kind === "group" ? (items[i] as Extract<BuilderItem, { kind: "group" }>).group.questions.length : 0;
  }
  return n;
}
function deepCloneItem(it: BuilderItem): BuilderItem {
  if (it.kind === "question") {
    return {
      id: uid(),
      kind: "question",
      question: { ...it.question, id: uid(), subQuestions: it.question.subQuestions.map((s) => ({ ...s, id: uid() })) },
    };
  }
  return {
    id: uid(),
    kind: "group",
    group: {
      id: uid(),
      shared: it.group.shared.map((s) => ({ ...s, id: uid() })),
      questions: it.group.questions.map((q) => ({
        ...q,
        id: uid(),
        subQuestions: q.subQuestions.map((s) => ({ ...s, id: uid() })),
      })),
    },
  };
}
