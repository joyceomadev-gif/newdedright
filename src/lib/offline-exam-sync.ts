/**
 * Offline examination sync service.
 * 
 * Handles:
 * 1. Syncing offline exam attempts to server
 * 2. Handling failed syncs with retry logic
 * 3. Conflict detection and resolution
 * 4. Network recovery sync
 */

import { supabase } from '@/integrations/supabase/client';
import {
  getPendingSyncItems,
  removeSyncItem,
  updateSyncItemRetry,
  updateAttemptStatus,
  deleteAnswersForAttempt,
  purgeCachedExam,
  type SyncQueueItem,

} from './offline-exam-db';
import { useNetworkStatus } from './network-status';
import { useEffect, useRef, useCallback } from 'react';

export interface SyncResult {
  success: boolean;
  attemptId: string;
  error?: string;
  conflictDetected?: boolean;
  serverAttemptId?: string;
}


// Runtime validation for sync queue item data
function validateAttemptData(data: unknown): data is {
  exam_id: string;
  student_id: string;
  started_at: string;
  submitted_at: string;
  duration_seconds: number;
  answers: unknown[];
} {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.exam_id === "string" &&
    typeof d.student_id === "string" &&
    typeof d.started_at === "string" &&
    typeof d.submitted_at === "string" &&
    typeof d.duration_seconds === "number" &&
    Array.isArray(d.answers)
  );
}

// Core sync function
async function syncAttemptToServer(item: SyncQueueItem): Promise<SyncResult> {
  try {
    if (item.action === 'submit') {
      // Submit the exam attempt
      if (!validateAttemptData(item.data)) {
        return {
          success: false,
          attemptId: item.attempt_id,
          error: "Invalid sync queue item data structure",
        };
      }
      const attemptData = item.data;

      // Check if attempt already exists on server (conflict detection)
      const { data: existing } = await supabase
        .from('exam_attempts')
        .select('id')
        .eq('exam_id', attemptData.exam_id)
        .eq('student_id', attemptData.student_id)
        .single();

      if (existing) {
        // Attempt already exists - could be a duplicate or conflict
        return {
          success: true, // Consider it success to avoid infinite retries
          attemptId: item.attempt_id,
          conflictDetected: true,
          serverAttemptId: existing.id,
        };
      }

      // Submit via server-side scoring RPC
      const { data: result, error } = await supabase.rpc('submit_exam_attempt', {
        _exam_id: attemptData.exam_id,
        _student_id: attemptData.student_id,
        _started_at: attemptData.started_at,
        _submitted_at: attemptData.submitted_at,
        _duration_seconds: attemptData.duration_seconds,
        _answers: attemptData.answers as any,
      });

      if (error) throw error;

      return {
        success: true,
        attemptId: item.attempt_id,
        serverAttemptId: (result as { attempt_id?: string } | null)?.attempt_id,
      };
    }

    return {
      success: false,
      attemptId: item.attempt_id,
      error: `Unknown action: ${item.action}`,
    };
  } catch (error) {
    return {
      success: false,
      attemptId: item.attempt_id,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Batch sync function
export async function syncPendingAttempts(): Promise<SyncResult[]> {
  const items = await getPendingSyncItems();
  const results: SyncResult[] = [];

  for (const item of items) {
    const result = await syncAttemptToServer(item);
    results.push(result);

    if (result.success) {
      await removeSyncItem(item.id);
      await updateAttemptStatus(item.attempt_id, 'synced');
      // Answers are now on the server — clean up the local copy and cached paper
      try {
        await deleteAnswersForAttempt(item.attempt_id);
        await purgeCachedExam(item.exam_id);
      } catch { /* best effort */ }
    } else {

      await updateSyncItemRetry(item.id, result.error || 'Sync failed');
      
      // Check after increment - item.retry_count is stale, so check >= 4 means 5th attempt
      // (0→1, 1→2, 2→3, 3→4, 4→5: marks failed when DB shows 5)
      if (item.retry_count >= 4) {
        await updateAttemptStatus(item.attempt_id, 'failed', result.error);
        await removeSyncItem(item.id); // Clean up to prevent queue leak
      }
    }
  }

  return results;
}

// Hook for automatic sync on network recovery
export function useAutoSyncOnRecovery(options?: { onSyncComplete?: (result: { synced: number; failed: number }) => void }) {
  const networkStatus = useNetworkStatus();
  const syncInProgress = useRef(false);
  const lastSyncTime = useRef<Date | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const performSync = useCallback(async () => {
    if (syncInProgress.current) return;
    
    syncInProgress.current = true;
    try {
      const results = await syncPendingAttempts();
      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;
      
      if (successCount > 0 || failCount > 0) {
        optionsRef.current?.onSyncComplete?.({ synced: successCount, failed: failCount });
        lastSyncTime.current = new Date();
      }
    } finally {
      syncInProgress.current = false;
    }
  }, []);

  // Sync when coming back online
  useEffect(() => {
    if (networkStatus.isOnline && !syncInProgress.current) {
      // Small delay to ensure connection is stable
      const timer = setTimeout(() => {
        performSync();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [networkStatus.isOnline, performSync]);

  // Periodic sync check every 60s
  useEffect(() => {
    if (!networkStatus.isOnline) return;
    const iv = setInterval(() => { if (!syncInProgress.current) performSync(); }, 60000);
    return () => clearInterval(iv);
  }, [networkStatus.isOnline, performSync]);

  return {
    syncInProgress: syncInProgress.current,
    lastSyncTime: lastSyncTime.current,
    performSync,
  };
}
