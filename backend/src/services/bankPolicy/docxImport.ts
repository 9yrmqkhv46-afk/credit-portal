/**
 * 2026 Bank Policy Engine — .docx import (parse an edited Word doc back to a policy).
 *
 * A .docx is a zip; the text lives in `word/document.xml`. We extract text per
 * paragraph, find the `<<< BEGIN/END POLICY PARAMETERS >>>` markers, and read
 * the `key = value` lines between them. Values are applied onto a base policy
 * (the current active version) so anything not present is preserved.
 *
 * This makes the Word document the editable source of truth for the engine.
 */

import JSZip from 'jszip';
import { BankPolicy } from './types';
import { applyParamsToPolicy, ApplyResult } from './docxFormat';

const BEGIN = '<<< BEGIN POLICY PARAMETERS >>>';
const END = '<<< END POLICY PARAMETERS >>>';

function unescapeXml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
}

/**
 * Extract the document text as an array of lines (one per Word paragraph).
 * Within a paragraph, all <w:t> runs are concatenated.
 */
export function extractDocxLines(documentXml: string): string[] {
  // Split on paragraph boundaries so each paragraph becomes one logical line.
  const paragraphs = documentXml.split(/<\/w:p>/);
  const lines: string[] = [];
  for (const para of paragraphs) {
    const runs = [...para.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => unescapeXml(m[1]));
    lines.push(runs.join(''));
  }
  return lines;
}

/** Parse `key = value` lines between the BEGIN/END markers into a map. */
export function parseParamLines(lines: string[]): Map<string, string> {
  const kv = new Map<string, string>();
  let inBlock = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (line.includes(BEGIN)) { inBlock = true; continue; }
    if (line.includes(END)) break;
    if (!inBlock) continue;
    if (!line || !line.includes('=')) continue;
    // Drop any trailing "(allowed: ...)" / "(...)" hint after the value.
    const cleaned = line.replace(/\s*\((?:allowed:)?[^)]*\)\s*$/i, '');
    const eq = cleaned.indexOf('=');
    const key = cleaned.slice(0, eq).trim();
    const value = cleaned.slice(eq + 1).trim();
    if (key) kv.set(key, value);
  }
  return kv;
}

export interface DocxImportResult extends ApplyResult {
  brandCode: string;
}

/**
 * Parse an uploaded .docx buffer and apply its parameters onto `base`.
 * Throws if the document has no parameters block or the brand doesn't match.
 */
export async function importPolicyDocx(buffer: Buffer, base: BankPolicy): Promise<DocxImportResult> {
  const zip = await JSZip.loadAsync(buffer);
  const docFile = zip.file('word/document.xml');
  if (!docFile) throw new Error('Not a valid .docx document (missing word/document.xml).');

  const xml = await docFile.async('string');
  const lines = extractDocxLines(xml);
  const kv = parseParamLines(lines);

  if (kv.size === 0) {
    throw new Error('No "Policy Parameters" block found. Use the document downloaded from this system and keep the BEGIN/END markers.');
  }

  const docBrand = kv.get('brandCode')?.trim();
  if (docBrand && docBrand !== base.brandCode) {
    throw new Error(`This document is for ${docBrand}, not ${base.brandCode}. Upload it against the matching bank.`);
  }

  const result = applyParamsToPolicy(base, kv);
  return { ...result, brandCode: base.brandCode };
}
