/**
 * Resilient CBT Runner — pure UI component.
 * All state and logic lives in useCBTRunner hook.
 */
import * as React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle, CheckCircle2, Wifi, WifiOff, Loader2, Clock } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { RichView } from '@/components/rich/RichView';
import { SignedImage } from '@/lib/storage';
import { StudentQuestionView, parseContentJson, itemGradeableUnits } from '@/components/question-builder/StudentQuestionView';
import { useCBTRunner, type Q } from './useCBTRunner';

interface ResilientCBTRunnerProps {
  exam: any;
  studentId: string;
  studentName: string;
  onDone: () => void;
}

function CachedImage({ media, cachedImages, className }: { media: any; cachedImages?: Record<string, string | Blob>; className?: string }) {
  const p = media.path ?? media.url;
  const c = cachedImages?.[p];
  // Create object URL for Blob, use string directly for base64 data URLs
  const [objectUrl, setObjectUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (c instanceof Blob) {
      const url = URL.createObjectURL(c);
      setObjectUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setObjectUrl(null);
  }, [c]);
  if (c instanceof Blob && objectUrl) return <img src={objectUrl} alt={media.caption ?? ''} className={className} />;
  if (typeof c === 'string') return <img src={c} alt={media.caption ?? ''} className={className} />;
  return <SignedImage bucket={media.bucket ?? 'question-media'} src={p} alt={media.caption ?? ''} className={className} />;
}

export function ResilientCBTRunner({ exam, studentId, studentName, onDone }: ResilientCBTRunnerProps) {
  const {
    confirmed, setConfirmed, questions, isLoading, loadError, dataSource,
    isOnline, answers, submitted, secondsLeft, violations,
    warnOpen, setWarnOpen, syncQueued, totalMarks,
    containerRef, persistAnswer, handleSubmit
  } = useCBTRunner(exam, studentId, onDone);

  // --- Loading & Error states ---
  if (isLoading) {
    return (
      <Card className="p-6 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /><span>Loading exam...</span>
        </div>
      </Card>
    );
  }

  if (loadError) {
    return (
      <Card className="p-6 space-y-3">
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-4 w-4" /><span className="font-medium">Error</span>
        </div>
        <p className="text-sm text-muted-foreground">{loadError}</p>
        <Button variant="outline" onClick={onDone}>Back</Button>
      </Card>
    );
  }

  // --- Pre-exam confirmation ---
  if (!confirmed) {
    return (
      <Card className="p-6 space-y-4 max-w-2xl mx-auto">
        <div>
          <div className="flex items-center gap-2 mb-2">
            {isOnline ? <Wifi className="h-5 w-5 text-green-500" /> : <WifiOff className="h-5 w-5 text-orange-500" />}
            <p className="text-xl font-semibold">{exam.title}</p>
          </div>
          <p className="text-sm text-muted-foreground">{exam.subjects?.name ?? ''} · {exam.duration_minutes ?? '—'} min · Max {exam.max_score}</p>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant={isOnline ? 'default' : 'secondary'}>{isOnline ? 'Online' : 'Offline'}</Badge>
            {dataSource === 'offline' && <Badge variant="outline" className="text-orange-500">Using cached data</Badge>}
          </div>
        </div>
        <div className="rounded border border-destructive/40 bg-destructive/5 p-4 space-y-2 text-sm">
          <p className="font-medium text-destructive">Exam rules</p>
          <ul className="list-disc ml-5 space-y-1 text-muted-foreground">
            <li>Fullscreen required. Leaving counts as a violation.</li>
            <li>Tab switching, focus loss, and blocked actions are tracked.</li>
            <li>After <strong>3 violations</strong> the exam auto-submits.</li>
            <li>One attempt only. Do not refresh.</li>
            {!isOnline && <li className="text-orange-500">You are <strong>offline</strong>. Answers sync when you reconnect.</li>}
          </ul>
        </div>
        <div className="flex justify-between">
          <Button variant="outline" onClick={onDone}>Cancel</Button>
          <Button onClick={() => setConfirmed(true)}>I understand — Start Exam</Button>
        </div>
      </Card>
    );
  }

  // --- No questions ---
  if (!questions.length) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">No questions available.</p>
        <Button variant="outline" onClick={onDone} className="mt-2">Back</Button>
      </Card>
    );
  }

  // --- Submitted ---
  if (submitted) {
    return (
      <Card className="p-6 space-y-3 text-center">
        <CheckCircle2 className="h-12 w-12 mx-auto text-primary" />
        <p className="text-xl font-semibold">Exam Submitted Successfully</p>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Your submission has been securely recorded. Official results will be published at the end of the term.
        </p>
        {syncQueued && <p className="text-sm text-orange-500">Will sync when online.</p>}
        {violations > 0 && <p className="text-xs text-destructive">{violations} violation(s)</p>}
        <Button onClick={onDone} className="mt-2">Done</Button>
      </Card>
    );
  }

  // --- Active exam ---
  const mins = secondsLeft != null ? Math.floor(secondsLeft / 60) : null;
  const secs = secondsLeft != null ? secondsLeft % 60 : null;
  const ac = Object.keys(answers).filter(k => answers[k]).length;

  return (
    <div ref={containerRef} className="space-y-4 select-none overflow-y-auto h-full" onCopy={e => e.preventDefault()} onContextMenu={e => e.preventDefault()}>
      {/* Sticky header bar */}
      <Card className="p-4 sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="flex items-center gap-2">
            {isOnline ? <Wifi className="h-4 w-4 text-green-500" /> : <WifiOff className="h-4 w-4 text-orange-500" />}
            <p className="font-medium">{exam.title}</p>
          </div>
          <p className="text-xs text-muted-foreground">{ac}/{questions.length} answered</p>
        </div>
        <div className="flex items-center gap-2">
          {violations > 0 && <Badge variant="destructive">{violations}/3</Badge>}
          {secondsLeft != null && (
            <Badge variant={secondsLeft < 60 ? 'destructive' : 'secondary'} className="text-base px-3 py-1">
              <Clock className="h-3.5 w-3.5 mr-1" />{String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
            </Badge>
          )}
        </div>
      </Card>

      {/* Questions */}
      {questions.map((q, i) => {
        const item = parseContentJson(q.content_json);
        const sec = q.section_title || q.section_label;
        const si = q.section_instruction;
        const prev = i > 0 ? (questions[i - 1].section_title || questions[i - 1].section_label) : null;
        const first = sec && sec !== prev;

        // Complex structured question
        if (item) {
          const m = itemGradeableUnits(q.id, item, i + 1).reduce((a, u) => a + u.marks, 0);
          return (
            <div key={q.id} className="space-y-3">
              {first && <div className="rounded-lg border bg-muted/30 p-4"><Badge className="uppercase text-xs">{sec}</Badge>{si && <div className="text-sm pt-1"><RichView content={si} /></div>}</div>}
              <Card className="p-4 space-y-3">
                <div className="flex justify-end"><Badge variant="outline">{m} mk</Badge></div>
                {Array.isArray(q.media) && q.media.length > 0 && (
                  <div className="flex flex-wrap gap-2">{q.media.filter((m2: any) => m2?.url || m2?.path).map((m2: any, mi: number) => (
                    <figure key={mi}><CachedImage media={m2} cachedImages={q.cachedImages} className="max-h-64 rounded border object-contain bg-white" />{m2.caption && <figcaption className="text-xs text-muted-foreground">{m2.caption}</figcaption>}</figure>
                  ))}</div>
                )}
                <StudentQuestionView rowId={q.id} item={item} displayNumber={i + 1} answers={answers} setAnswer={(k: string, v: string) => persistAnswer(k, v)} />
              </Card>
            </div>
          );
        }

        // Simple MCQ / theory / short answer
        const opts: any = q.options;
        const oe: [string, string][] = Array.isArray(opts)
          ? opts.map((o: any, idx: number) => [String.fromCharCode(65 + idx), String(o)])
          : opts && typeof opts === 'object' ? Object.entries(opts).map(([k, v]) => [k, String(v)]) : [];

        return (
          <div key={q.id} className="space-y-3">
            {first && <div className="rounded-lg border bg-muted/30 p-4"><Badge className="uppercase text-xs">{sec}</Badge>{si && <div className="text-sm pt-1"><RichView content={si} /></div>}</div>}
            <Card className="p-4 space-y-2">
              <div className="flex justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0"><span className="font-semibold text-foreground whitespace-nowrap">{i + 1}.</span><RichView content={q.question_text} className="flex-1 min-w-0 text-sm font-medium" /></div>
                <Badge variant="outline">{q.marks} mk</Badge>
              </div>
              {Array.isArray(q.media) && q.media.length > 0 && (
                <div className="flex flex-wrap gap-2">{q.media.filter((m2: any) => m2?.url || m2?.path).map((m2: any, mi: number) => (
                  <figure key={mi}><CachedImage media={m2} cachedImages={q.cachedImages} className="max-h-64 rounded border object-contain bg-white" />{m2.caption && <figcaption className="text-xs text-muted-foreground">{m2.caption}</figcaption>}</figure>
                ))}</div>
              )}
              {oe.length > 0 ? (
                <div className="space-y-1">{oe.map(([k, v]) => (
                  <label key={k} className={'flex gap-2 p-2 rounded border cursor-pointer ' + (answers[q.id] === k ? 'border-primary bg-primary/5' : '')}>
                    <input type="radio" name={q.id} checked={answers[q.id] === k} onChange={() => persistAnswer(q.id, k)} />
                    <span className="text-sm"><strong>{k}.</strong> <RichView content={v} /></span>
                  </label>
                ))}</div>
              ) : q.question_type === 'theory' ? (
                <div className="space-y-1">
                  <Textarea rows={6} placeholder="Your answer..." value={answers[q.id] ?? ''} onChange={e => persistAnswer(q.id, e.target.value)} />
                  <p className="text-[11px] italic text-muted-foreground">Graded by teacher.</p>
                </div>
              ) : (
                <Input placeholder="Your answer" value={answers[q.id] ?? ''} onChange={e => persistAnswer(q.id, e.target.value)} />
              )}
            </Card>
          </div>
        );
      })}

      {/* Submit button */}
      <div className="flex justify-end">
        <Button onClick={() => handleSubmit('manual')}>
          <Loader2 className="h-4 w-4 animate-spin mr-1 hidden" />Submit Exam
        </Button>
      </div>

      {/* Violation warning dialog */}
      <AlertDialog open={warnOpen} onOpenChange={setWarnOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Warning {violations}/3</AlertDialogTitle>
            <AlertDialogDescription>Auto-submits after 3 violations. Return to fullscreen.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => {
              setWarnOpen(false);
              (containerRef.current ?? document.documentElement).requestFullscreen?.().catch(() => {});
            }}>Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default ResilientCBTRunner;
