/**
 * Swappable CRM sync (CLAUDE.md §3): business code sees `CrmProvider` only. Zoho CRM uses plain
 * REST with a self-client refresh token (free edition); tests replace `fetch`.
 */

export type CrmAccount = {
  name: string;
  phone?: string | null;
  website?: string | null;
  city?: string | null;
};
export type CrmContact = {
  accountId: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  title?: string | null;
};

export interface CrmProvider {
  readonly name: string;
  readonly configured: boolean;
  /** Creates or updates, returning the CRM record ids in input order. */
  upsertAccounts(accounts: (CrmAccount & { id?: string | null })[]): Promise<string[]>;
  upsertContacts(contacts: (CrmContact & { id?: string | null })[]): Promise<string[]>;
}

export class CrmError extends Error {}

const TIMEOUT_MS = 15_000;

export class ZohoCrmProvider implements CrmProvider {
  readonly name = 'Zoho CRM';
  readonly configured: boolean;
  private token?: { value: string; expiresAt: number };

  constructor(
    private readonly cfg: {
      clientId?: string;
      clientSecret?: string;
      refreshToken?: string;
      accountsUrl: string;
      apiUrl: string;
    },
  ) {
    this.configured = Boolean(cfg.clientId && cfg.clientSecret && cfg.refreshToken);
  }

  upsertAccounts(accounts: (CrmAccount & { id?: string | null })[]): Promise<string[]> {
    return this.upsert(
      'Accounts',
      accounts.map((a) => ({
        ...(a.id ? { id: a.id } : {}),
        Account_Name: a.name,
        Phone: a.phone ?? undefined,
        Website: a.website ?? undefined,
        Billing_City: a.city ?? undefined,
      })),
      ['Account_Name'],
    );
  }

  upsertContacts(contacts: (CrmContact & { id?: string | null })[]): Promise<string[]> {
    return this.upsert(
      'Contacts',
      contacts.map((c) => ({
        ...(c.id ? { id: c.id } : {}),
        First_Name: c.firstName,
        Last_Name: c.lastName,
        Email: c.email ?? undefined,
        Phone: c.phone ?? undefined,
        Title: c.title ?? undefined,
        Account_Name: { id: c.accountId },
      })),
      ['Email'],
    );
  }

  /** Zoho accepts up to 100 records per upsert call. */
  private async upsert(
    module: string,
    records: object[],
    duplicateCheck: string[],
  ): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 0; i < records.length; i += 100) {
      const res = await this.call(`/crm/v8/${module}/upsert`, {
        data: records.slice(i, i + 100),
        duplicate_check_fields: duplicateCheck,
      });
      const rows = (res.data ?? []) as {
        status?: string;
        message?: string;
        details?: { id?: string };
      }[];
      for (const row of rows) {
        if (row.status !== 'success' || !row.details?.id) {
          throw new CrmError(`Zoho ${module}: ${row.message ?? 'record rejected'}`);
        }
        ids.push(row.details.id);
      }
    }
    return ids;
  }

  private async call(path: string, body: object): Promise<{ data?: unknown[] }> {
    const res = await fetch(`${this.cfg.apiUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Zoho-oauthtoken ${await this.accessToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new CrmError(`Zoho returned ${res.status}`);
    return (await res.json()) as { data?: unknown[] };
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    if (!this.configured) throw new CrmError('Zoho is not configured.');
    const params = new URLSearchParams({
      refresh_token: this.cfg.refreshToken!,
      client_id: this.cfg.clientId!,
      client_secret: this.cfg.clientSecret!,
      grant_type: 'refresh_token',
    });
    const res = await fetch(`${this.cfg.accountsUrl}/oauth/v2/token`, {
      method: 'POST',
      body: params,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const json = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
      error?: string;
    };
    if (!res.ok || !json.access_token)
      throw new CrmError(`Zoho sign-in failed: ${json.error ?? res.status}`);
    this.token = {
      value: json.access_token,
      expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
    };
    return this.token.value;
  }
}
