/** Run in the signed-in browser using the existing authenticated client. */
export async function regradeExams(client, { dryRun = true, backupConfirmed = false } = {}) {
  if (!dryRun && !backupConfirmed) throw new Error("Export the database first and confirm backupConfirmed before applying corrections.");
  const { data, error } = await client.rpc("exam_grading_maintenance", { _dry_run: dryRun });
  if (error) throw error;
  console.log(dryRun ? "DRY RUN — no data changed" : "Correction applied", {
    questionKeysChanged: data.question_keys_changed,
    attemptsChanged: data.attempts_changed,
    blockedAttempts: data.blocked_attempts,
  });
  console.table(data.samples);
  return data;
}