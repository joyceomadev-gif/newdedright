import { optionEntries, normalizeMcqAnswer } from "@/lib/exam-answer";
/**
 * useCBTRunner — state machine + sync logic for the resilient CBT exam runner.
 * Separates concerns from the pure UI component.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { parseContentJson, itemGradeableUnits, ansKey } from '@/components/question-builder/StudentQuestionView';
import { cacheExamData, createOfflineAttempt, saveAnswer, getAnswersForAttempt, getInProgressAttempt, addToSyncQueue, getOfflineDB, updateAttemptStatus, deleteAnswersForAttempt, purgeCachedExam } from '@/lib/offline-exam-db';
import { getCachedExamData, cacheQuestionImages } from '@/lib/offline-exam-cache';

export type Q = {
  id: string; question_text: string; options: any; marks: number;
  question_type?: string; position?: number; section_id?: string;
  section_title?: string; section_label?: string; section_instruction?: string;
  media?: any[]; content_json?: any; correct_answer?: string;
  cachedImages?: Record<string, string | Blob>;
};

export type RunnerState = {
  confirmed: boolean; setConfirmed: (v: boolean) => void;
  questions: Q[];
  isLoading: boolean; loadError: string | null;
  dataSource: 'online' | 'offline' | null;
  isOnline: boolean;
  answers: Record<string, string>;
  submitted: { score: number; total: number; pct: number } | null;
  secondsLeft: number | null;
  startedAt: string;
  violations: number;
  warnOpen: boolean; setWarnOpen: (v: boolean) => void;
  syncQueued: boolean;
  totalMarks: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
  persistAnswer: (qid: string, value: string) => void;
  handleSubmit: (reason?: string) => Promise<void>;
};

export function useCBTRunner(
  exam: any,
  studentId: string,
  onDone: () => void
): RunnerState {
  const [confirmed, setConfirmed] = useState(false);
  const [questions, setQuestions] = useState<Q[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<'online' | 'offline' | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState<{ score: number; total: number; pct: number } | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [startedAt, setStartedAt] = useState(() => new Date().toISOString());
  const [violations, setViolations] = useState(0);
  const [warnOpen, setWarnOpen] = useState(false);
  const [syncQueued, setSyncQueued] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const submittingRef = useRef(false);
  const attemptIdRef = useRef<string | null>(null);
  const answersRef = useRef<Record<string, string>>({});
  const violationsRef = useRef(0);
  const questionsRef = useRef<Q[]>([]);
  const resumeAttemptRef = useRef<{ id: string; startedAt: string } | null>(null);
  const shuffleMetaRef = useRef<{
    questionOrder: string[];
    shuffledOptions: Record<string, Record<string, string>>;
    correctAnswerMap: Record<string, string>;
  } | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingAnswersRef = useRef<Record<string, string>>({});
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const handleSubmitRef = useRef<((r?: string) => Promise<void>) | null>(null);
  const lastBumpRef = useRef(0);
  const graceRef = useRef(true); // 3s grace period after exam start to absorb blur/fullscreen transitions
  const sessionStartRef = useRef<number>(0); // monotonic timestamp (performance.now()) for elapsed calc
  const endTimeRef = useRef<number>(0); // absolute wall-clock end time for countdown (survives background throttling)

  // Multi-tab lock: prevent concurrent exam sessions on the same exam
  useEffect(() => {
    if (!confirmed) return;
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('exam-session-' + exam.id);
      bc.postMessage({ type: 'lock', studentId, tabId: Math.random().toString(36).slice(2) });
      bc.onmessage = (e) => {
        if (e.data?.type === 'lock' && e.data?.studentId === studentId) {
          setLoadError('This exam is already open in another tab. Close that tab to continue.');
        }
      };
    } catch { /* BroadcastChannel not supported — degrade gracefully */ }
    return () => { bc?.postMessage({ type: 'unlock', studentId }); bc?.close(); };
  }, [confirmed, exam.id, studentId]);

  // WAL: debounced write to IndexedDB on answer change (300ms)
  const persistAnswer = (qid: string, value: string) => {
    pendingAnswersRef.current = { ...pendingAnswersRef.current, [qid]: value };
    setAnswers(a => ({ ...a, [qid]: value }));
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (!attemptIdRef.current) return;
      const cur = pendingAnswersRef.current;
      for (const [k, v] of Object.entries(cur)) {
        await saveAnswer({ attempt_id: attemptIdRef.current, question_id: k, student_answer: v, answered_at: new Date().toISOString() });
      }      pendingAnswersRef.current = {};
    }, 300);
  };

  // Cleanup WAL timer on unmount
  useEffect(() => {
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, []);

  // Network tracking
  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  useEffect(() => { answersRef.current = answers; }, [answers]);
  useEffect(() => { violationsRef.current = violations; }, [violations]);
  useEffect(() => { questionsRef.current = questions; }, [questions]);

  const shuffleQuestions = useCallback((raw: any[]): Q[] => {
    const s = [...raw];
    for (let i = exam.randomize_questions ? s.length - 1 : 0; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [s[i], s[j]] = [s[j], s[i]];
    }
    return s.map((q: any, idx: number) => {
      const opts: any = q.options;
      const entries: [string, string][] = Array.isArray(opts)
        ? opts.map((o: any, i: number) => [String.fromCharCode(65 + i), String(o)])
        : opts && typeof opts === 'object'
          ? Object.entries(opts).map(([k, v]) => [k, String(v)])
          : [];
      if (!entries.length) return { ...q, position: idx + 1 } as Q;
      const ck = String(q.correct_answer ?? '').trim();
      const cv = entries.find(([k]) => k.toLowerCase() === ck.toLowerCase())?.[1]
        ?? entries.find(([, v]) => v.trim().toLowerCase() === ck.toLowerCase())?.[1];
      const so = [...entries];
      for (let i = exam.randomize_options ? so.length - 1 : 0; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [so[i], so[j]] = [so[j], so[i]];
      }
      const no: Record<string, string> = {};
      let nc = ck;
      so.forEach(([, v], i) => {
        const k = String.fromCharCode(65 + i);
        no[k] = v;
        if (cv !== undefined && v === cv) nc = k;
      });
      return { ...q, options: no, correct_answer: nc, position: idx + 1, _origId: q.id } as Q;
    });
  }, [exam.randomize_questions, exam.randomize_options]);

  // Load questions (online first, offline fallback)
  useEffect(() => {
    (async () => {
      setIsLoading(true); setLoadError(null);
      let networkAvailable = true;
      try {
        const { data, error } = await (supabase as any).rpc('student_get_exam_questions', { _exam_id: exam.id });
        if (!error && Array.isArray(data) && data.length > 0) {
          const q = shuffleQuestions(data);
          shuffleMetaRef.current = {
            questionOrder: q.map(o => o.id),
            shuffledOptions: Object.fromEntries(q.map(o => [o.id, o.options as Record<string, string>])),
            correctAnswerMap: Object.fromEntries(q.map(o => [o.id, o.correct_answer ?? '']))
          };
          setQuestions(q); setDataSource('online');
          try {
            const qForCache = q.map(oq => ({
              id: oq.id, exam_id: exam.id, question_text: oq.question_text, options: oq.options,
              marks: oq.marks, question_type: oq.question_type, position: oq.position,
              section_id: oq.section_id, section_label: oq.section_label ?? oq.section_title,
              section_instruction: oq.section_instruction, media: oq.media, content_json: oq.content_json,
              correct_answer: oq.correct_answer
            }));
            await cacheQuestionImages(qForCache as any);
            await cacheExamData({
              id: exam.id, exam_id: exam.id, title: exam.title, type: exam.type ?? 'cbt',
              duration_minutes: exam.duration_minutes, max_score: exam.max_score,
              term_id: null, subject_id: null, class_id: null, opens_at: null, closes_at: null,
              time_zone: 'Africa/Lagos', allow_resume: true, allow_late_entry: false,
              is_mandatory: true, cached_at: new Date().toISOString(),
              expires_at: exam.closes_at || new Date(Date.now() + 86400000).toISOString() // respect official closing time if set
            } as any, qForCache as any);
          } catch { /* cache failure is non-fatal */ }
          setIsLoading(false); return;
        }
        // RPC returned error or empty data while online — backend issue, not network
        if (error) { setLoadError('Failed to load exam questions. ' + (error.message || 'Please try again.')); setIsLoading(false); return; }
      } catch { networkAvailable = false; /* network down — try offline cache */ }
      try {
        const { exam: ce, questions: cq } = await getCachedExamData(exam.id);
        if (cq.length > 0) {
          if (ce?.expires_at && new Date(ce.expires_at) < new Date()) setLoadError('Cached exam expired. Reconnect to re-download.');
          else { setQuestions(cq as Q[]); setDataSource('offline'); }
        } else setLoadError(networkAvailable ? 'Failed to load exam. Please try again.' : 'No internet and exam not cached. Connect first.');
      } catch { setLoadError('Failed to load exam.'); }
      setIsLoading(false);
    })();
  }, [exam.id, shuffleQuestions]);

  // Resume detection: check for existing in-progress attempt
  useEffect(() => {
    if (questions.length === 0 || confirmed) return;
    (async () => {
      const existing = await getInProgressAttempt(exam.id, studentId);
      if (existing) {
        resumeAttemptRef.current = { id: existing.id, startedAt: existing.started_at };
        attemptIdRef.current = existing.id;
        setStartedAt(existing.started_at);
        // Restore shuffle from attempt record
        if (existing.question_order && existing.shuffled_options && existing.correct_answer_map) {
          const ordered = existing.question_order.map(id => questions.find(q => q.id === id)).filter(Boolean) as Q[];
          const restored = ordered.map(q => ({
            ...q,
            options: existing.shuffled_options?.[q.id] ?? q.options,
            correct_answer: existing.correct_answer_map?.[q.id] ?? q.correct_answer
          }));
          setQuestions(restored);
        }
        // Calculate remaining time
        if (exam.duration_minutes) {
          const elapsed = Math.floor((Date.now() - Date.parse(existing.started_at)) / 1000);
          const remaining = Math.max(0, exam.duration_minutes * 60 - elapsed);
          if (remaining <= 0) { setLoadError('This exam has expired. The time limit has passed.'); return; }
          setSecondsLeft(remaining);
          endTimeRef.current = Date.now() + remaining * 1000; // absolute end time for resume
        }
        const saved = await getAnswersForAttempt(existing.id);
        if (Object.keys(saved).length > 0) setAnswers(saved);
        setConfirmed(true);
      }
    })();
  }, [questions, exam.id, exam.duration_minutes, studentId, confirmed]);

  // On confirm: set up timer, fullscreen, create attempt record
  useEffect(() => {
    if (!confirmed) return;
    sessionStartRef.current = performance.now(); // monotonic anchor for elapsed calculation
    if (!resumeAttemptRef.current) setStartedAt(new Date().toISOString());
    if (!resumeAttemptRef.current && exam.duration_minutes) {
      const secs = exam.duration_minutes * 60;
      setSecondsLeft(secs);
      endTimeRef.current = Date.now() + secs * 1000; // absolute end time
    }
    const el = containerRef.current ?? document.documentElement;
    el.requestFullscreen?.().catch(() => {});
    return () => { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); };
  }, [confirmed, exam.duration_minutes]);

  // Create IndexedDB attempt record
  useEffect(() => {
    if (!confirmed || attemptIdRef.current || resumeAttemptRef.current) return;
    (async () => {
      const id = 'a_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
      const meta = shuffleMetaRef.current;
      await createOfflineAttempt({
        id, exam_id: exam.id, student_id: studentId, started_at: startedAt,
        submitted_at: null, duration_seconds: null, answers: [], status: 'in_progress',
        last_updated: new Date().toISOString(), sync_attempts: 0,
        question_order: meta?.questionOrder, shuffled_options: meta?.shuffledOptions,
        correct_answer_map: meta?.correctAnswerMap
      });
      attemptIdRef.current = id;
      // Flush any answers selected during initialization (race with 300ms WAL timer)
      if (Object.keys(pendingAnswersRef.current).length > 0) {
        for (const [k, v] of Object.entries(pendingAnswersRef.current)) {
          await saveAnswer({ attempt_id: id, question_id: k, student_answer: v, answered_at: new Date().toISOString() });
        }
        pendingAnswersRef.current = {};
      }
    })();
  }, [confirmed, exam.id, studentId, startedAt]);

  // 30s auto-save interval
  useEffect(() => {
    if (!confirmed || !attemptIdRef.current || submitted) return;
    const iv = setInterval(async () => {
      const cur = answersRef.current;
      if (attemptIdRef.current && Object.keys(cur).length > 0) {
        for (const [qid, ans] of Object.entries(cur))
          await saveAnswer({ attempt_id: attemptIdRef.current, question_id: qid, student_answer: ans, answered_at: new Date().toISOString() });
      }
    }, 30000);
    return () => clearInterval(iv);
  }, [confirmed, submitted]);

  // Load saved answers on fresh confirm (not resume)
  useEffect(() => {
    if (!confirmed || !attemptIdRef.current || resumeAttemptRef.current) return;
    getAnswersForAttempt(attemptIdRef.current).then(s => { if (Object.keys(s).length > 0) setAnswers(s); });
  }, [confirmed]);

  // Countdown timer
  useEffect(() => {
    if (!confirmed || submitted) { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } return; }
    timerRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000));
      if (remaining <= 0) { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } void handleSubmitRef.current?.('time'); setSecondsLeft(0); return; }
      setSecondsLeft(remaining);
    }, 1000);
    return () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  }, [confirmed, submitted]);

  // Violation tracking
  useEffect(() => {
    if (!confirmed || submitted) return;
    // 3-second grace period: absorb blur/fullscreen transition after exam start
    graceRef.current = true;
    const graceTimer = setTimeout(() => { graceRef.current = false; }, 3000);
    const bump = (r: string) => {
      if (graceRef.current) return; // ignore during grace period
      if (submittingRef.current) return; // prevent duplicate submit during in-flight submission
      const now = Date.now();
      if (now - lastBumpRef.current < 500) return;
      lastBumpRef.current = now;
      setViolations(v => {
        const n = v + 1;
        if (n >= 3) { toast.error('Auto-submitted after 3 violations'); void handleSubmitRef.current?.(r); }
        else { setWarnOpen(true); toast.warning('Warning ' + n + '/3: ' + r); }
        return n;
      });
    };
    const onVis = () => { if (document.hidden) bump('tab switch'); };
    const onBl = () => bump('focus lost');
    const supportsFullscreen = !!(document.fullscreenEnabled || (document as any).webkitFullscreenEnabled);
    const onFs = () => { if (supportsFullscreen && !document.fullscreenElement) bump('left fullscreen'); };
    const block = (e: Event) => { e.preventDefault(); return false; };
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && ['c', 'v', 'x', 'a', 'p', 's', 'u'].includes(k)) e.preventDefault();
      if (e.key === 'F12') e.preventDefault();
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && ['i', 'j', 'c'].includes(k)) e.preventDefault();
    };
    document.addEventListener('visibilitychange', onVis); window.addEventListener('blur', onBl);
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('contextmenu', block); document.addEventListener('copy', block);
    document.addEventListener('cut', block); document.addEventListener('paste', block);
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(graceTimer);
      document.removeEventListener('visibilitychange', onVis); window.removeEventListener('blur', onBl);
      document.removeEventListener('fullscreenchange', onFs);
      document.removeEventListener('contextmenu', block); document.removeEventListener('copy', block);
      document.removeEventListener('cut', block); document.removeEventListener('paste', block);
      document.removeEventListener('keydown', onKey);
    };
  }, [confirmed, submitted]);

  // Warn on page unload
  useEffect(() => {
    if (!confirmed || submitted) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [confirmed, submitted]);

  const totalMarks = questions.reduce((sum, q) => {
    const item = parseContentJson(q.content_json);
    if (item) {
      const units = itemGradeableUnits(q.id, item, 1);
      return sum + units.reduce((a, u) => a + u.marks, 0); // include theory units for total possible marks
    }
    return sum + Number(q.marks ?? 1); // include theory questions — they have marks even if teacher-graded
  }, 0);

  // Submit handler
  async function handleSubmit(_reason?: string) {
    if (!questionsRef.current.length || submittingRef.current) return;
    submittingRef.current = true;
    try {
      // Flush answers to IndexedDB before grading
      if (attemptIdRef.current) {
        const cur = answersRef.current;
        for (const [qid, ans] of Object.entries(cur))
          await saveAnswer({ attempt_id: attemptIdRef.current, question_id: qid, student_answer: ans, answered_at: new Date().toISOString() });
      }

      const cur = answersRef.current, curV = violationsRef.current;
      let raw = 0;
      const log: any[] = [];

      questionsRef.current.forEach((q, i) => {
        const item = parseContentJson(q.content_json);
        if (item) {
          const units = itemGradeableUnits(q.id, item, i + 1);
          for (const u of units) {
            const selected = cur[u.key] ?? null;
            const selectedKey = normalizeMcqAnswer(selected, u.optionsForLog);
            const a = u.optionsForLog && selectedKey
              ? optionEntries(u.optionsForLog).find(([key]) => key === selectedKey)?.[1] ?? selected
              : selected;
            let ic: boolean | null = null;
            if (!u.needsGrading && u.correctAnswer) {
              ic = !!a && a.trim().toLowerCase() === u.correctAnswer.trim().toLowerCase();
              if (ic) raw += u.marks;
            }
            log.push({
              question_id: q.id, sub_key: u.key, sub_label: u.label,
              question_text: u.label + '. ' + u.questionText,
              question_type: u.optionsForLog ? 'mcq' : u.needsGrading ? 'theory' : 'short_answer',
              options: u.optionsForLog, student_answer: a,
              correct_answer: u.needsGrading ? null : u.correctAnswer,
              marks: u.marks, is_correct: ic, needs_grading: u.needsGrading
            });
          }
          return;
        }
        const selected = cur[ansKey(q.id)] ?? cur[q.id] ?? null;
        // Displayed letters may be shuffled. Submit the selected option text;
        // authoritative server options resolve it back to the original key.
        const selectedKey = normalizeMcqAnswer(selected, q.options);
        const a = optionEntries(q.options).length && selectedKey
          ? optionEntries(q.options).find(([key]) => key === selectedKey)?.[1] ?? selected
          : selected;
        const c = String(q.correct_answer ?? '').trim();
        const isT = q.question_type === 'theory';
        const ic = isT ? null : (!!a && a.trim().toLowerCase() === c.toLowerCase());
        if (ic === true) raw += Number(q.marks ?? 1);
        log.push({
          question_id: q.id, question_text: q.question_text,
          question_type: q.question_type ?? 'mcq', options: q.options ?? null,
          student_answer: a, correct_answer: isT ? null : c,
          marks: Number(q.marks ?? 1), is_correct: ic, needs_grading: isT
        });
      });

      const pct = totalMarks ? (raw / totalMarks) * 100 : 0;
      const subAt = new Date().toISOString();
      const previousElapsed = resumeAttemptRef.current ? Math.floor((Date.now() - Date.parse(resumeAttemptRef.current.startedAt)) / 1000) : 0;
      const sessionElapsed = Math.max(0, Math.round((performance.now() - sessionStartRef.current) / 1000)); // monotonic — immune to clock manipulation
      const dur = previousElapsed + sessionElapsed; // cumulative: time before resume + current session
      let ok = false; let serverTotal: number | null = null; let serverPct: number | null = null;

      if (isOnline) {
        try {
          const { data: rpcResult, error } = await supabase.rpc('submit_exam_attempt', {
            _exam_id: exam.id, _student_id: studentId, _started_at: startedAt,
            _submitted_at: subAt, _duration_seconds: dur, _answers: log
          });
          if (!error && rpcResult) {
            const res = rpcResult as { raw_score?: number; total_marks?: number; percentage?: number };
            ok = true;
            raw = Number(res.raw_score ?? raw);
            serverTotal = Number(res.total_marks ?? totalMarks);
            serverPct = Number(res.percentage ?? pct);
            try {
              const db = await getOfflineDB();
              const a = await db.get('attempts', attemptIdRef.current ?? '');
              if (a) { a.status = 'synced'; a.submitted_at = subAt; a.duration_seconds = dur; a.answers = []; a.last_updated = new Date().toISOString(); await db.put('attempts', a); }
              // Answers are safely on the server — shorten/clean the offline copy
              if (attemptIdRef.current) await deleteAnswersForAttempt(attemptIdRef.current);
              await purgeCachedExam(exam.id);
            } catch { /* best effort */ }

          }
        } catch { /* offline fallback */ }
      }

      if (!ok) {
        // Mark attempt as 'submitted' in IndexedDB so getInProgressAttemptsForStudent
        // (which filters by !submitted_at) no longer treats it as in-progress,
        // and getSubmittedNotSyncedExamIds picks it up.
        if (attemptIdRef.current) {
          await updateAttemptStatus(attemptIdRef.current, 'submitted');
          // Also set submitted_at directly since updateAttemptStatus doesn't set it
          try {
            const db = await getOfflineDB();
            const a = await db.get('attempts', attemptIdRef.current);
            if (a) { a.submitted_at = subAt; a.duration_seconds = dur; await db.put('attempts', a); }
          } catch { /* best effort */ }
        }
        await addToSyncQueue({
          id: 's_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
          attempt_id: attemptIdRef.current ?? 'unknown', exam_id: exam.id,
          student_id: studentId, action: 'submit',
          data: { exam_id: exam.id, student_id: studentId, started_at: startedAt, submitted_at: subAt, duration_seconds: dur, answers: [...log, { __meta: true, violations: curV }] },
          created_at: subAt, retry_count: 0
        });
        // Questions are no longer needed locally — the queued payload holds the answers
        try { await purgeCachedExam(exam.id); } catch { /* best effort */ }
        setSyncQueued(true);
      }


      setSubmitted({ score: raw, total: serverTotal ?? totalMarks, pct: serverPct ?? pct });
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      toast.success(ok ? 'Exam submitted!' : 'Submitted. Will sync when online.');
    } finally { submittingRef.current = false; }
  }
  handleSubmitRef.current = handleSubmit;

  return {
    confirmed, setConfirmed, questions, isLoading, loadError, dataSource,
    isOnline, answers, submitted, secondsLeft, startedAt, violations,
    warnOpen, setWarnOpen, syncQueued, totalMarks,
    containerRef, persistAnswer, handleSubmit
  };
}
