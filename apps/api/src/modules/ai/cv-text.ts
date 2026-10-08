/** Extracts plain text from a CV for parsing. Scanned (image-only) PDFs yield little or no text. */
export async function extractCvText(buffer: Buffer, ext: 'pdf' | 'docx'): Promise<string> {
  if (ext === 'pdf') {
    // unpdf is ESM-only; a dynamic import keeps the CommonJS build working.
    const { extractText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    return normalise(text);
  }
  const mammoth = await import('mammoth');
  const { value } = await mammoth.extractRawText({ buffer });
  return normalise(value);
}

const normalise = (text: string) =>
  text
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
