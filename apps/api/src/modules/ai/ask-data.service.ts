import { HttpStatus, Injectable } from '@nestjs/common';
import { ASK_DATA_MAX_ROWS, type AskDataResponse, askDataLlmSchema } from '@staffos/shared';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { type Actor, hasRole } from '../../common/auth/actor';
import { AppException } from '../../common/errors/app.exception';
import { todayInDubai } from '../../common/errors/prisma-errors';
import type { Prisma } from '../../generated/prisma/client';
import { LlmService, untrusted } from '../../infra/llm/llm.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { guardSql, UnsafeQueryError } from './sql-guard';

const READER_ROLE = 'staffos_report_reader';

/** JSON-safe cell values: bigint/Decimal → number, Date → ISO string. */
function cell(v: unknown): unknown {
  if (typeof v === 'bigint') return Number(v);
  if (v instanceof Date) return v.toISOString();
  if (v && typeof v === 'object' && 'toNumber' in v && typeof v.toNumber === 'function') {
    return (v as { toNumber: () => number }).toNumber();
  }
  return v;
}

/**
 * US-AI-02 "Ask your data": the model writes SQL, which is checked by `guardSql` and then run
 * in a READ ONLY transaction, as a role that can only read the reporting views, with a 5 s
 * statement timeout and at most 500 rows. The views hold every client's data, so only roles that
 * already see all clients may use it.
 */
@Injectable()
export class AskDataService {
  private readerRole?: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
    private readonly audit: AuditService,
    @InjectPinoLogger(AskDataService.name) private readonly logger: PinoLogger,
  ) {}

  async ask(question: string, actor: Actor): Promise<AskDataResponse> {
    if (!hasRole(actor, 'SUPER_ADMIN', 'HR_MANAGER', 'FINANCE')) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN',
        'Ask your data covers every client, so it is limited to HR, Finance and admins.',
      );
    }
    const { data } = await this.llm.run({
      feature: 'ASK_DATA',
      prompt: 'ask-data.v1',
      vars: { today: todayInDubai(), question: untrusted(question, 1_000) },
      schema: askDataLlmSchema,
    });
    let sql: string;
    try {
      sql = guardSql(data.sql);
    } catch (err) {
      if (!(err instanceof UnsafeQueryError)) throw err;
      this.logger.warn({ reason: err.message, sql: data.sql }, 'Ask-data query refused');
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'UNSAFE_QUERY',
        'The generated query was refused for safety. Try rephrasing the question.',
        { reason: err.message, sql: data.sql },
      );
    }
    const raw = await this.execute(sql, data.sql);
    const truncated = raw.length > ASK_DATA_MAX_ROWS;
    const rows = raw
      .slice(0, ASK_DATA_MAX_ROWS)
      .map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, cell(v)])));
    const columns = rows[0] ? Object.keys(rows[0]) : [];
    const has = (c: string | null | undefined) => (c && columns.includes(c) ? c : null);
    const x = has(data.chart.x);
    const y = has(data.chart.y);
    await this.audit.record({
      action: 'ASK_DATA',
      entity: 'report',
      after: { question, sql: data.sql, rows: rows.length },
    });
    return {
      question,
      answer: data.answer,
      sql: data.sql,
      columns,
      rows,
      truncated,
      chart:
        x && y && data.chart.type !== 'none'
          ? { type: data.chart.type, x, y }
          : { type: 'none', x: null, y: null },
    };
  }

  private async execute(sql: string, original: string): Promise<Record<string, unknown>[]> {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          // Constant statements only; the validated query is the single dynamic one.
          await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
          await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '5s'");
          if (await this.hasReaderRole(tx))
            await tx.$executeRawUnsafe(`SET LOCAL ROLE ${READER_ROLE}`);
          return tx.$queryRawUnsafe<Record<string, unknown>[]>(sql);
        },
        { timeout: 10_000 },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const timeout = /statement timeout|57014/.test(message);
      this.logger.warn({ err: message, sql: original }, 'Ask-data query failed');
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        timeout ? 'QUERY_TIMEOUT' : 'QUERY_FAILED',
        timeout
          ? 'That question took too long to answer. Try a narrower question.'
          : 'That question couldn’t be answered from the reports. Try rephrasing it.',
        { sql: original },
      );
    }
  }

  /** Whether the migration could create the reader role and grant it to us (cached). */
  private async hasReaderRole(tx: Prisma.TransactionClient): Promise<boolean> {
    if (this.readerRole === undefined) {
      const [row] = await tx.$queryRaw<{ ok: boolean }[]>`
        SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${READER_ROLE})
          THEN pg_has_role(current_user, ${READER_ROLE}, 'SET') ELSE FALSE END AS ok`;
      this.readerRole = Boolean(row?.ok);
      if (!this.readerRole)
        this.logger.warn('Reader role missing: ask-data runs read-only without it');
    }
    return this.readerRole;
  }
}
