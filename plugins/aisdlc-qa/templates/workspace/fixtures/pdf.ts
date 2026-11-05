// Proof for documents that open in a new tab (PDF reports, protocols). "A PDF opened" is not "the right PDF opened":
// capture the PDF response, then assert on its text. Chrome's PDF viewer tab has no usable title (page.title() is ""),
// so never assert toHaveTitle on it.
//
//   const pdf = await openedPdf(page, () => page.getByRole('link', { name: 'Alert Protocol' }).click());
//   expect(pdf.response.status()).toBe(200);
//   expect(pdf.text).toContain('Alert Protocol');        // identifies the document, from the scenario
//
// Works for blob: URLs too: the app fetches the PDF (that response is captured), then opens it in the new tab.
// Assert on the response and the text. The tab's URL is only reliable in a visible browser: headless Chromium has no
// PDF viewer, so a blob: PDF tab can stay on about:blank there.
import type { Page, Response } from '@playwright/test';

// The PDF the app fetched over HTTP(S); the blob: tab's own load also reports application/pdf but has no body.
const isPdf = (r: Response) =>
  /^https?:/.test(r.url()) && (r.headers()['content-type'] || '').toLowerCase().includes('application/pdf');

// Text of a PDF, pages joined by blank lines (pdf.js, Mozilla's PDF reader, run in Node).
export async function pdfText(data: Buffer | Uint8Array): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: new Uint8Array(data), isEvalSupported: false, useSystemFonts: false, verbosity: 0 });
  const doc = await task.promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    pages.push(content.items.map((it: any) => ('str' in it ? it.str : '')).join(' ').replace(/\s+/g, ' ').trim());
  }
  await task.destroy();
  return pages.join('\n\n');
}

// Run `trigger` (the click that opens the document) and wait for the new tab and the PDF response together.
// `match` narrows which response is the document when the app loads several (default: any application/pdf).
export async function openedPdf(page: Page, trigger: () => Promise<unknown>, match: (r: Response) => boolean = isPdf) {
  const [popup, response] = await Promise.all([
    page.waitForEvent('popup'),
    page.context().waitForEvent('response', match),
    trigger(),
  ]);
  // The browser often keeps no body: a tab that navigated straight to the PDF hands it to Chrome's viewer, and a fetch
  // turned into a blob: URL reports zero bytes. Then fetch the same URL again with the context's cookies (GET).
  let body = await response.body().catch(() => Buffer.alloc(0));
  if (!body.length) body = await (await page.context().request.get(response.url())).body();
  const text = await pdfText(body);
  // Apps often open an empty tab first and point it at the document once loaded; wait for that before returning.
  await popup.waitForURL((u) => u.href !== 'about:blank', { timeout: 5_000 }).catch(() => {});
  return { popup, response, text };
}
