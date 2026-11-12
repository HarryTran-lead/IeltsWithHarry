type PageResult<T> = { data: T[] | null; error: { message: string } | null };

/** Every row of a query, read in pages: the API returns at most 1,000 rows per request,
 * so a learner with more saved words would otherwise silently lose the rest.
 * `page` must apply a stable order. Most learners need one request; `maxRows` caps the worst case. */
export async function fetchAllRows<T>(page: (from: number, to: number) => PromiseLike<PageResult<T>>, pageSize = 1000, maxRows = 20000): Promise<PageResult<T>> {
  const rows: T[] = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const result = await page(from, from + pageSize - 1);
    if (result.error) return { data: rows, error: result.error };
    const data = result.data ?? [];
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return { data: rows, error: null };
}
