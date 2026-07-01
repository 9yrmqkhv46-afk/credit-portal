/**
 * 2026 Bank Policy Engine — detailed PDF generation (pdfkit).
 *
 * Produces a polished, multi-section PDF policy document for a single bank,
 * derived from the same structured summary model used everywhere else so it
 * never drifts from the engine. Returned as a Buffer for streaming to the client.
 */

import PDFDocument from 'pdfkit';
import { BankPolicy } from './types';
import { buildBankSummary, DocSection } from './summaries';
import { serializePolicyParams } from './docxFormat';

const TEAL = '#01696f';
const GOLD = '#b8860b';
const INK = '#1a2233';
const MUTED = '#6b7280';

function renderSection(doc: PDFKit.PDFDocument, s: DocSection): void {
  const size = s.level <= 1 ? 15 : s.level === 2 ? 13 : 11;
  doc.moveDown(0.5).fillColor(s.level <= 2 ? TEAL : INK).fontSize(size).font('Helvetica-Bold').text(s.heading);
  doc.fillColor(INK).font('Helvetica').fontSize(9.5);
  for (const p of s.paragraphs ?? []) doc.moveDown(0.2).text(p, { align: 'left' });
  for (const b of s.bullets ?? []) if (b) doc.text(`•  ${b}`, { indent: 10 });
  if (s.table) {
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(MUTED).text(s.table.headers.join('    '));
    doc.font('Helvetica').fillColor(INK);
    for (const row of s.table.rows) doc.text(row.join('    '));
  }
  for (const c of s.children ?? []) renderSection(doc, c);
}

/** Build a detailed PDF policy document for one bank. Resolves to a Buffer. */
export function buildPolicyPdf(policy: BankPolicy): Promise<Buffer> {
  const model = buildBankSummary(policy);
  const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: model.title, Author: '2026 Bank Policy Engine' } });

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Cover header
    doc.rect(0, 0, doc.page.width, 96).fill(TEAL);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(20).text(policy.bankName, 48, 30);
    doc.font('Helvetica').fontSize(11).fillColor('#d7f2f3').text('2026 Lending Policy Summary (Modelling Assumptions)', 48, 58);
    doc.fillColor('#bfe6e8').fontSize(9).text(`Version ${policy.policyVersion}  ·  Brand ${policy.brandCode}`, 48, 76);
    doc.moveDown(3);
    doc.fillColor(GOLD).font('Helvetica-Oblique').fontSize(8.5).text('Modelled estimates for indicative comparison only — not official lender policy or a credit decision.', 48, 104);
    doc.moveDown(1);

    // Narrative sections
    doc.y = 130;
    for (const s of model.sections) renderSection(doc, s);

    // Appendix: exact machine-readable parameters (what the engine uses)
    doc.addPage();
    doc.fillColor(TEAL).font('Helvetica-Bold').fontSize(15).text('Appendix — Exact Policy Parameters');
    doc.fillColor(MUTED).font('Helvetica').fontSize(8.5).text('The precise values the engine applies. These are what the editable Word document round-trips.');
    doc.moveDown(0.5);
    doc.font('Courier').fontSize(8.5).fillColor(INK);
    for (const line of serializePolicyParams(policy)) {
      doc.text(`${line.key} = ${line.value}`);
    }

    doc.end();
  });
}
