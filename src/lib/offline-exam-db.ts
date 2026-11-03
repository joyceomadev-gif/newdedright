/**
 * IndexedDB schema for offline examination storage.
 */
import { openDB, type IDBPDatabase } from 'idb';

export interface OfflineExamData {
  id: string;
  exam_id: string;
  title: string;
  type: string;
  duration_minutes: number | null;
  max_score: number;
  term_id: string;
  subject_id: string;
  class_id: string;
  opens_at: string | null;
  closes_at: string | null;
  time_zone: string;
  allow_resume: boolean;
  allow_late_entry: boolean;
  is_mandatory: boolean;
  cached_at: string;
  expires_at: string;
}

export interface OfflineQuestionData {
  id: string;
  exam_id: string;
  question_text: string;
  options: unknown;
  marks: number;
  question_type: string;
  position: number | null;
  section_id?: string | null;
  section_label?: string | null;
  section_instruction?: string | null;
  media?: Array<{ type?: string; url: string; caption?: string; bucket?: string; path?: string }> | null;
  content_json?: unknown;
  cachedImages?: Record<string, string | Blob>; // path -> Blob (preferred) or base64 data URL
}

export interface OfflineExamAttempt {
  id: string;
  exam_id: string;
  student_id: string;
  started_at: string;
  submitted_at: string | null;
  duration_seconds: number | null;
  answers: unknown;
  status: 'in_progress' | 'submitted' | 'synced' | 'failed';
  last_updated: string;
  sync_attempts: number;
  last_sync_error?: string;
  question_order?: string[];
  shuffled_options?: Record<string, Record<string, string>>;
  correct_answer_map?: Record<string, string>;
}

export interface OfflineAnswer {
  attempt_id: string;
  question_id: string;
  sub_key?: string;
  student_answer: string | null;
  answered_at: string;
}

export interface SyncQueueItem {
  id: string;
  attempt_id: string;
  exam_id: string;
  student_id: string;
  action: 'submit' | 'update_answers';
  data: unknown;
  created_at: string;
  retry_count: number;
  last_retry_at?: string;
  error?: string;
}

const DB_NAME = 'gila-uni-exam-offline';
const DB_VERSION = 1;
let dbInstance: IDBPDatabase | null = null;
let dbPromise: Promise<IDBPDatabase> | null = null;

export async function getOfflineDB(): Promise<IDBPDatabase> {
  if (dbInstance) return dbInstance;
  if (dbPromise) return dbPromise;
  dbPromise = openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('exams')) {
        const examStore = db.createObjectStore('exams', { keyPath: 'id' });
        examStore.createIndex('exam_id', 'exam_id', { unique: false });
        examStore.createIndex('expires_at', 'expires_at', { unique: false });
      }
      if (!db.objectStoreNames.contains('questions')) {
        const qStore = db.createObjectStore('questions', { keyPath: 'id' });
        qStore.createIndex('exam_id', 'exam_id', { unique: false });
      }
      if (!db.objectStoreNames.contains('attempts')) {
        const aStore = db.createObjectStore('attempts', { keyPath: 'id' });
        aStore.createIndex('exam_id', 'exam_id', { unique: false });
        aStore.createIndex('student_id', 'student_id', { unique: false });
        aStore.createIndex('status', 'status', { unique: false });
      }
      if (!db.objectStoreNames.contains('answers')) {
        const ansStore = db.createObjectStore('answers', { keyPath: ['attempt_id', 'question_id'] });
        ansStore.createIndex('attempt_id', 'attempt_id', { unique: false });
      }
      if (!db.objectStoreNames.contains('sync_queue')) {
        const syncStore = db.createObjectStore('sync_queue', { keyPath: 'id' });
        syncStore.createIndex('created_at', 'created_at', { unique: false });
      }
    },
  });
  const db = await dbPromise;
  dbInstance = db;
  return db;
}

export async function cacheExamData(exam: OfflineExamData, questions: OfflineQuestionData[]): Promise<void> {
  const db = await getOfflineDB();
  const tx = db.transaction(['exams', 'questions'], 'readwrite');
  await tx.objectStore('exams').put(exam);
  for (const q of questions) await tx.objectStore('questions').put(q);
  await tx.done;
}

export async function getCachedExam(examId: string): Promise<OfflineExamData | null> {
  const db = await getOfflineDB();
  const exam = await db.get('exams', examId);
  if (!exam) return null;
  if (new Date(exam.expires_at) < new Date()) { const tx = db.transaction(['exams', 'questions'], 'readwrite'); await tx.objectStore('exams').delete(examId); const idx = tx.objectStore('questions').index('exam_id'); let cur = await idx.openCursor(examId); while (cur) { await cur.delete(); cur = await cur.continue(); } await tx.done; return null; }
  return exam;
}


export async function getCachedQuestions(examId: string): Promise<OfflineQuestionData[]> {
  const db = await getOfflineDB();
  return db.getAllFromIndex("questions", "exam_id", examId);
}

export async function createOfflineAttempt(a: OfflineExamAttempt): Promise<void> {
  const db = await getOfflineDB(); await db.put('attempts', a);
}



export async function getInProgressAttempt(examId: string, studentId: string): Promise<OfflineExamAttempt | null> {
  const db = await getOfflineDB();
  const all = await db.getAllFromIndex("attempts", "exam_id", examId);
  return all.find(a => a.student_id === studentId && a.status === "in_progress" && !a.submitted_at) ?? null;
}

export async function updateAttemptStatus(id: string, status: OfflineExamAttempt['status'], error?: string): Promise<void> {
  const db = await getOfflineDB();
  const a = await db.get('attempts', id);
  if (a) { a.status = status; a.last_updated = new Date().toISOString();
    if (status === 'failed' && error) { a.last_sync_error = error; a.sync_attempts += 1; }
    await db.put('attempts', a); }
}



export async function getInProgressAttemptsForStudent(studentId: string): Promise<OfflineExamAttempt[]> {
  const db = await getOfflineDB();
  const all = await db.getAllFromIndex("attempts", "student_id", studentId);
  return all.filter(a => a.status === "in_progress" && !a.submitted_at);
}

export async function getSubmittedNotSyncedExamIds(studentId: string): Promise<Set<string>> {
  const db = await getOfflineDB();
  const all = await db.getAllFromIndex("attempts", "student_id", studentId);
  const ids = new Set<string>();
  for (const a of all) { if (a.status === "submitted") ids.add(a.exam_id); }
  return ids;
}

export async function saveAnswer(ans: OfflineAnswer): Promise<void> {
  const db = await getOfflineDB(); await db.put('answers', ans);
}

export async function getAnswersForAttempt(id: string): Promise<Record<string, string>> {
  const db = await getOfflineDB();
  const all = await db.getAllFromIndex('answers', 'attempt_id', id);
  const r: Record<string, string> = {};
  for (const a of all) { if (a.student_answer !== null) r[a.question_id] = a.student_answer; }
  return r;
}

/** Delete locally stored answers for an attempt (after they are safely on the server). */
export async function deleteAnswersForAttempt(attemptId: string): Promise<void> {
  const db = await getOfflineDB();
  const tx = db.transaction('answers', 'readwrite');
  const idx = tx.objectStore('answers').index('attempt_id');
  let cur = await idx.openCursor(attemptId);
  while (cur) { await cur.delete(); cur = await cur.continue(); }
  await tx.done;
}

/** Remove the cached exam paper (questions + images + exam record) once it is no longer needed. */
export async function purgeCachedExam(examId: string): Promise<void> {
  const db = await getOfflineDB();
  const tx = db.transaction(['exams', 'questions'], 'readwrite');
  await tx.objectStore('exams').delete(examId);
  const idx = tx.objectStore('questions').index('exam_id');
  let cur = await idx.openCursor(examId);
  while (cur) { await cur.delete(); cur = await cur.continue(); }
  await tx.done;
}

export async function addToSyncQueue(item: SyncQueueItem): Promise<void> {
  const db = await getOfflineDB(); await db.put('sync_queue', item);
}


export async function getPendingSyncItems(): Promise<SyncQueueItem[]> {
  const db = await getOfflineDB();
  const all = await db.getAll('sync_queue');
  return all.filter(i => i.retry_count < 5);
}

export async function removeSyncItem(id: string): Promise<void> {
  const db = await getOfflineDB(); await db.delete('sync_queue', id);
}

export async function updateSyncItemRetry(id: string, error: string): Promise<void> {
  const db = await getOfflineDB();
  const item = await db.get('sync_queue', id);
  if (item) { item.retry_count += 1; item.last_retry_at = new Date().toISOString(); item.error = error;
    await db.put('sync_queue', item); }
}

/**
 * Remove local IndexedDB attempt and sync_queue records that no longer exist on
 * the server (e.g. after admin retake resets them). This lets the student retake
 * the exam locally without clearing all IndexedDB data.
 */
export async function cleanupStaleAttempts(
  studentId: string,
  serverExamIds: Set<string>
): Promise<void> {
  const db = await getOfflineDB();
  const all = await db.getAllFromIndex('attempts', 'student_id', studentId);
  for (const a of all) {
    if (!serverExamIds.has(a.exam_id)) {
      // Server no longer has this attempt — retake was reset. Delete local records.
      await db.delete('attempts', a.id);
      // Also clean up related sync_queue items
      const syncItems = await db.getAll('sync_queue');
      for (const s of syncItems) {
        if (s.attempt_id === a.id) await db.delete('sync_queue', s.id);
      }
    }
  }
}
