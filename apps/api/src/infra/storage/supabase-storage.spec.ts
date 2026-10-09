import { SupabaseStorage } from './storage.service';

describe('SupabaseStorage (private bucket, signed URLs)', () => {
  const realFetch = global.fetch;
  let calls: { url: string; init: RequestInit }[];
  afterEach(() => {
    global.fetch = realFetch;
  });
  beforeEach(() => {
    calls = [];
    global.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      if (String(url).includes('/object/sign/')) {
        return Response.json({ signedURL: '/object/sign/documents/a/b.pdf?token=t' });
      }
      return Response.json({});
    }) as typeof fetch;
  });

  const storage = new SupabaseStorage('https://x.supabase.co', 'sb_secret_test', 'documents');
  const KEY =
    'candidate/0190a000-0000-7000-8000-000000000001/0190a000-0000-7000-8000-000000000002.pdf';

  it('sends the secret key as apikey and Bearer, never upserting', async () => {
    await storage.put(KEY, Buffer.from('%PDF'), 'application/pdf');
    const { url, init } = calls[0]!;
    expect(url).toBe(`https://x.supabase.co/storage/v1/object/documents/${KEY}`);
    expect(init.headers).toMatchObject({
      apikey: 'sb_secret_test',
      Authorization: 'Bearer sb_secret_test',
      'x-upsert': 'false',
    });
  });

  it('returns a short-lived signed download URL', async () => {
    const link = await storage.signedUrl(KEY, 300, 'CV Karim.pdf');
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ expiresIn: 300 });
    expect(link).toBe(
      'https://x.supabase.co/storage/v1/object/sign/documents/a/b.pdf?token=t&download=CV%20Karim.pdf',
    );
  });

  it('fails loudly on storage errors', async () => {
    global.fetch = jest.fn(async () => new Response('no', { status: 403 })) as typeof fetch;
    await expect(storage.put(KEY, Buffer.from('x'), 'application/pdf')).rejects.toThrow(/403/);
  });

  it('refuses keys it did not generate (no path traversal)', async () => {
    await expect(
      storage.put('../users/x.pdf', Buffer.from('x'), 'application/pdf'),
    ).rejects.toThrow(/Invalid storage key/);
    expect(calls).toHaveLength(0);
  });
});
