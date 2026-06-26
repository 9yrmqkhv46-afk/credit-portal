/**
 * 2026 Bank Policy Engine — real .docx generation.
 *
 * Builds an editable Microsoft Word document for a bank's policy (or the whole
 * library). The document has two parts:
 *   1. A human-readable policy summary (from summaries.ts).
 *   2. A "Policy Parameters" section — a loss-less `key = value` block that is
 *      the machine-readable SOURCE OF TRUTH. Editing these values and
 *      re-uploading the document updates the engine (see docxImport.ts).
 */

import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, BorderStyle,
} from 'docx';
import { BankPolicy } from './types';
import { buildBankSummary, buildCrossBankComparison, DocSection } from './summaries';
import { serializePolicyParams, enumHint } from './docxFormat';

const MONO = 'Consolas';

function sectionToParagraphs(s: DocSection): Paragraph[] {
  const out: Paragraph[] = [];
  const headingLevel =
    s.level <= 1 ? HeadingLevel.HEADING_1 : s.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3;
  out.push(new Paragraph({ text: s.heading, heading: headingLevel }));
  for (const p of s.paragraphs ?? []) out.push(new Paragraph({ children: [new TextRun(p)] }));
  for (const b of s.bullets ?? []) if (b) out.push(new Paragraph({ text: b, bullet: { level: 0 } }));
  for (const c of s.children ?? []) out.push(...sectionToParagraphs(c));
  return out;
}

function comparisonTable(section: DocSection): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [new Paragraph({ text: section.heading, heading: HeadingLevel.HEADING_1 })];
  for (const p of section.paragraphs ?? []) out.push(new Paragraph({ children: [new TextRun(p)] }));
  if (section.table) {
    const header = new TableRow({
      children: section.table.headers.map((h) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })] })),
    });
    const rows = section.table.rows.map(
      (r) => new TableRow({ children: r.map((c) => new TableCell({ children: [new Paragraph(c)] })) }),
    );
    out.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [header, ...rows] }));
  }
  return out;
}

/** The machine-readable parameters block (the editable source of truth). */
function parameterBlock(policy: BankPolicy): Paragraph[] {
  const out: Paragraph[] = [
    new Paragraph({ text: 'Policy Parameters (machine-readable — edit values after "=")', heading: HeadingLevel.HEADING_1 }),
    new Paragraph({
      children: [new TextRun({
        text: 'These key = value lines are the source of truth the lending engine reads. Edit only the value to the right of "=". Do not delete lines or change the key on the left. Percentages are decimals (0.95 = 95%). Re-upload this document to update the policy.',
        italics: true,
      })],
    }),
    new Paragraph({
      children: [new TextRun({ text: '<<< BEGIN POLICY PARAMETERS >>>', bold: true, font: MONO })],
    }),
  ];

  for (const line of serializePolicyParams(policy)) {
    const hint = enumHint(line.key);
    out.push(new Paragraph({
      children: [
        new TextRun({ text: `${line.key} = ${line.value}`, font: MONO, size: 18 }),
        ...(hint ? [new TextRun({ text: `   (allowed: ${hint})`, font: MONO, size: 16, color: '888888' })] : []),
      ],
      spacing: { after: 0 },
    }));
  }

  out.push(new Paragraph({ children: [new TextRun({ text: '<<< END POLICY PARAMETERS >>>', bold: true, font: MONO })] }));
  return out;
}

function titleBlock(text: string): Paragraph[] {
  return [
    new Paragraph({ text, heading: HeadingLevel.TITLE }),
    new Paragraph({ children: [new TextRun({ text: 'Modelling assumptions only — not official lender policy or a credit decision.', italics: true, color: '888888' })] }),
  ];
}

function dividerParagraph(): Paragraph {
  return new Paragraph({
    border: { bottom: { color: 'CCCCCC', space: 1, style: BorderStyle.SINGLE, size: 6 } },
    spacing: { before: 200, after: 200 },
  });
}

/** Build a Word document for a single bank's policy. */
export async function buildPolicyDocx(policy: BankPolicy): Promise<Buffer> {
  const doc = buildBankSummary(policy);
  const children: (Paragraph | Table)[] = [
    ...titleBlock(doc.title),
    ...doc.sections.flatMap(sectionToParagraphs),
    dividerParagraph(),
    ...parameterBlock(policy),
  ];
  const document = new Document({ sections: [{ children }] });
  return Packer.toBuffer(document);
}

/** Build a Word document for the whole policy library (all banks + comparison). */
export async function buildLibraryDocx(policies: BankPolicy[]): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [...titleBlock('2026 Bank Lending Policy Library')];

  for (const policy of policies) {
    const doc = buildBankSummary(policy);
    children.push(new Paragraph({ text: doc.title, heading: HeadingLevel.HEADING_1 }));
    children.push(...doc.sections.flatMap(sectionToParagraphs));
    children.push(...parameterBlock(policy));
    children.push(dividerParagraph());
  }
  children.push(...comparisonTable(buildCrossBankComparison(policies)));

  const document = new Document({ sections: [{ children }] });
  return Packer.toBuffer(document);
}
