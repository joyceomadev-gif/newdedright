/**
 * Page through a Supabase query in 1000-row batches so we can return more than
 * the PostgREST default cap of 1000 rows. Call sites that need to render lists
 * exceeding 1000 records use this instead of a single `select()`.
 *
 * `build()` MUST return a fresh query each call (so `.range()` can be applied
 * to a clean state per page).
 */
export async function fetchAllPaged<T>(
  build: () => {
    range: (
      from: number,
      to: number,
    ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
  },
  pageSize = 1000,
  hardCap = 50000,
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  while (from < hardCap) {
    const to = from + pageSize - 1;
    const { data, error } = await build().range(from, to);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    all.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

