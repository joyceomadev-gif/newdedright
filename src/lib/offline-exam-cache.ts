/**
 * Offline exam cache — lookup + image caching for offline use.
 */
import { supabase } from '@/integrations/supabase/client';
import { getCachedExam, getCachedQuestions, type OfflineExamData, type OfflineQuestionData } from './offline-exam-db';

export async function getCachedExamData(examId: string): Promise<{
  exam: OfflineExamData | null;
  questions: OfflineQuestionData[];
}> {
  const exam = await getCachedExam(examId);
  const questions = exam ? await getCachedQuestions(examId) : [];
  return { exam, questions };
}

// Fetch and cache a single image from Supabase storage as Blob (not base64)
async function fetchAndCacheImage(bucket: string, path: string): Promise<Blob | null> {
  try {
    const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
    if (!data?.signedUrl) return null;
    const response = await fetch(data.signedUrl);
    if (!response.ok) return null;
    return await response.blob();
  } catch {
    return null;
  }
}

// Cache all images for a question
async function fetchQuestionImages(media: Array<{ type?: string; url: string; caption?: string; bucket?: string; path?: string }> | null): Promise<Record<string, Blob>> {
  const cached: Record<string, Blob> = {};
  if (!media) return cached;
  for (const m of media) {
    const bucket = m.bucket ?? 'question-media';
    const p = m.path ?? m.url;
    if (!p) continue;
    const blob = await fetchAndCacheImage(bucket, p);
    if (blob) cached[p] = blob;
  }
  return cached;
}

// Fetch and cache all images for a list of questions
export async function cacheQuestionImages(questions: OfflineQuestionData[]): Promise<void> {
  for (const q of questions) {
    if (q.media && q.media.length > 0) {
      q.cachedImages = await fetchQuestionImages(q.media);
    }
  }
}
