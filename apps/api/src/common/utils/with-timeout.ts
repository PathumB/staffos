/** Rejects if `promise` doesn't settle within `ms`. Bounds calls to external systems (CLAUDE.md §7). */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label = 'operation',
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
