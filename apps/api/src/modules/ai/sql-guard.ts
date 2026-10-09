import { ASK_DATA_MAX_ROWS, ASK_DATA_VIEWS } from '@staffos/shared';

export class UnsafeQueryError extends Error {}

/** Words that never belong in a read-only report query (checked outside string literals). */
const FORBIDDEN =
  /\b(insert|update|delete|merge|drop|alter|create|grant|revoke|truncate|copy|call|do|execute|prepare|set|reset|vacuum|analyze|lock|listen|notify|comment|security|into|returning|pg_sleep|lo_import|lo_export|dblink)\b/i;

/**
 * US-AI-02 gate for model-written SQL. Allows exactly one SELECT (or WITH … SELECT) that reads
 * only the whitelisted reporting views, and wraps it in a LIMIT. It is one layer of several: the
 * query also runs in a READ ONLY transaction, as a role that can only read the views, with a
 * 5-second statement timeout.
 */
export function guardSql(raw: string): string {
  let sql = raw.trim().replace(/;\s*$/, '');
  if (!sql) throw new UnsafeQueryError('Empty query.');
  if (sql.includes('\\')) throw new UnsafeQueryError('Backslashes are not allowed.');
  if (/\$\$|\$[a-z_]*\$/i.test(sql)) throw new UnsafeQueryError('Dollar quoting is not allowed.');
  // Check everything else with string literals blanked out ('' escapes included; with no
  // backslashes allowed, this matches how PostgreSQL itself splits literals).
  const bare = sql.replace(/'(?:[^']|'')*'/g, "''");
  if (/--|\/\*|\*\//.test(bare)) throw new UnsafeQueryError('Comments are not allowed.');
  if (bare.includes(';')) throw new UnsafeQueryError('Only one statement is allowed.');
  if (/"/.test(bare)) throw new UnsafeQueryError('Quoted identifiers are not allowed.');
  if (!/^(select|with)\b/i.test(bare))
    throw new UnsafeQueryError('Only SELECT queries are allowed.');
  const bad = FORBIDDEN.exec(bare);
  if (bad) throw new UnsafeQueryError(`"${bad[1]}" is not allowed.`);

  // FROM also appears inside EXTRACT(… FROM col), SUBSTRING(… FROM …), TRIM and IS DISTINCT FROM;
  // blank those out before looking for relations.
  const relations = bare
    .replace(/\b(?:extract|substring|trim|overlay|position)\s*\([^()]*\)/gi, '0')
    .replace(/\bdistinct\s+from\b/gi, '<>');
  // Every relation after FROM/JOIN must be a whitelisted view or a CTE defined in this query.
  const ctes = new Set(
    [...bare.matchAll(/(?:\bwith\b|,)\s*([a-z_][a-z0-9_]*)\s+as\s*\(/gi)].map((m) =>
      m[1]!.toLowerCase(),
    ),
  );
  const allowed = new Set<string>([...ASK_DATA_VIEWS, ...ctes]);
  for (const m of relations.matchAll(/\b(?:from|join)\s+([a-z_][a-z0-9_.]*)/gi)) {
    const name = m[1]!.toLowerCase();
    if (!allowed.has(name))
      throw new UnsafeQueryError(`Only the reporting views can be queried (got "${name}").`);
  }
  // A FROM with a sub-select or a function call (e.g. generate_series) is refused too.
  if (
    /\b(?:from|join)\s*\(\s*(?!select\b)/i.test(relations) ||
    /\b(?:from|join)\s+[a-z_][a-z0-9_.]*\s*\(/i.test(relations)
  ) {
    throw new UnsafeQueryError('Table functions are not allowed.');
  }
  sql = `SELECT * FROM (${sql}) AS q LIMIT ${ASK_DATA_MAX_ROWS + 1}`;
  return sql;
}
