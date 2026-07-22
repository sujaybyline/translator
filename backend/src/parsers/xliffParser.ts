import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { TranslatableSegment, XliffParseResult, XliffVersion } from '../types/index.js';

const PARSER_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  allowBooleanAttributes: true,
  preserveOrder: false,
  trimValues: false,
  processEntities: false, // XXE / entity expansion protection
  ignoreDeclaration: false,
  ignorePiTags: false,
  removeNSPrefix: false,
  parseTagValue: false,
  parseAttributeValue: false,
  cdataPropName: '__cdata',
  commentPropName: '#comment',
  textNodeName: '#text',
};

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function detectVersion(root: Record<string, unknown>, rawXml: string): XliffVersion {
  const xliff = (root.xliff ?? root['xliff:xliff']) as Record<string, unknown> | undefined;
  const versionAttr = xliff?.['@_version'];
  if (typeof versionAttr === 'string') {
    if (versionAttr.startsWith('1.')) return '1.2';
    if (versionAttr.startsWith('2.')) return '2.0';
  }
  if (/<trans-unit[\s>]/i.test(rawXml)) return '1.2';
  if (/<unit[\s>]/i.test(rawXml) && /<segment[\s>]/i.test(rawXml)) return '2.0';
  return 'unknown';
}

function detectSourceLanguage(root: Record<string, unknown>, version: XliffVersion): string | null {
  const xliff = (root.xliff ?? root['xliff:xliff']) as Record<string, unknown> | undefined;
  if (!xliff) return null;

  if (version === '2.0') {
    const src = xliff['@_srcLang'] ?? xliff['@_source-language'];
    if (typeof src === 'string' && src.trim()) return src.trim();
  }

  const files = asArray(xliff.file ?? xliff['xliff:file']);
  for (const file of files) {
    if (!file || typeof file !== 'object') continue;
    const f = file as Record<string, unknown>;
    const src = f['@_source-language'] ?? f['@_srcLang'];
    if (typeof src === 'string' && src.trim()) return src.trim();
  }

  return typeof xliff['@_srcLang'] === 'string' ? xliff['@_srcLang'] : null;
}

function extractInnerXml(block: string, tagName: string): { content: string; present: boolean } {
  const paired = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const pairedMatch = block.match(paired);
  if (pairedMatch) {
    return { content: pairedMatch[1], present: true };
  }
  const selfClosing = new RegExp(`<${tagName}\\b[^>]*/>`, 'i');
  if (selfClosing.test(block)) {
    return { content: '', present: true };
  }
  return { content: '', present: false };
}

function attrId(attrs: string): string | null {
  const match = attrs.match(/\bid\s*=\s*(["'])([^"']*)\1/i);
  return match?.[2] ?? null;
}

/**
 * Extract segments from raw XML so mixed-content order (text + inline tags) is preserved.
 */
function extractXliff12FromRaw(rawXml: string): TranslatableSegment[] {
  const segments: TranslatableSegment[] = [];
  const unitRegex = /<trans-unit\b([^>]*)>([\s\S]*?)<\/trans-unit>/gi;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = unitRegex.exec(rawXml)) !== null) {
    const attrs = match[1];
    const inner = match[2];
    const id = attrId(attrs) ?? `tu-${index}`;
    const source = extractInnerXml(inner, 'source');
    const sourceText = source.content.trim();
    if (!sourceText) {
      index += 1;
      continue;
    }
    const target = extractInnerXml(inner, 'target');
    segments.push({
      id,
      locator: `1.2:0:${id}`,
      sourceText,
      targetText: target.present ? target.content : undefined,
      hasExistingTarget: target.present,
    });
    index += 1;
  }

  return segments;
}

function extractXliff20FromRaw(rawXml: string): TranslatableSegment[] {
  const segments: TranslatableSegment[] = [];
  const unitRegex = /<unit\b([^>]*)>([\s\S]*?)<\/unit>/gi;
  let unitMatch: RegExpExecArray | null;
  let unitIndex = 0;

  while ((unitMatch = unitRegex.exec(rawXml)) !== null) {
    const unitAttrs = unitMatch[1];
    const unitInner = unitMatch[2];
    const unitId = attrId(unitAttrs) ?? `unit-${unitIndex}`;
    const segRegex = /<segment\b([^>]*)>([\s\S]*?)<\/segment>/gi;
    let segMatch: RegExpExecArray | null;
    let segIndex = 0;

    while ((segMatch = segRegex.exec(unitInner)) !== null) {
      const segAttrs = segMatch[1];
      const segInner = segMatch[2];
      const segId = attrId(segAttrs) ?? `${unitId}-${segIndex}`;
      const source = extractInnerXml(segInner, 'source');
      const sourceText = source.content.trim();
      if (!sourceText) {
        segIndex += 1;
        continue;
      }
      const target = extractInnerXml(segInner, 'target');
      segments.push({
        id: segId,
        locator: `2.0:0:${unitId}:${segId}`,
        sourceText,
        targetText: target.present ? target.content : undefined,
        hasExistingTarget: target.present,
      });
      segIndex += 1;
    }
    unitIndex += 1;
  }

  return segments;
}

export function validateXml(rawXml: string): { valid: boolean; error?: string } {
  const result = XMLValidator.validate(rawXml, {
    allowBooleanAttributes: true,
  });
  if (result === true) return { valid: true };
  return {
    valid: false,
    error: `Invalid XML: ${result.err.msg} at line ${result.err.line}`,
  };
}

export function parseXliff(rawXml: string): XliffParseResult {
  const trimmed = rawXml.trim();
  if (!trimmed) {
    throw new Error('Empty file: no content to parse.');
  }

  // Block DOCTYPE / external entities (XXE)
  if (/<!DOCTYPE/i.test(trimmed) || /<!ENTITY/i.test(trimmed)) {
    throw new Error('Invalid XLIFF: DOCTYPE and ENTITY declarations are not allowed.');
  }

  const xmlCheck = validateXml(trimmed);
  if (!xmlCheck.valid) {
    throw new Error(xmlCheck.error ?? 'Invalid XML');
  }

  const parser = new XMLParser(PARSER_OPTIONS);
  const root = parser.parse(trimmed) as Record<string, unknown>;

  if (!root.xliff && !root['xliff:xliff']) {
    throw new Error('Invalid XLIFF: root <xliff> element not found.');
  }

  const version = detectVersion(root, trimmed);
  if (version === 'unknown') {
    throw new Error('Unsupported XLIFF version. Supported: 1.2 and 2.0.');
  }

  const segments =
    version === '1.2' ? extractXliff12FromRaw(trimmed) : extractXliff20FromRaw(trimmed);
  if (segments.length === 0) {
    throw new Error('No translatable segments found in the XLIFF file.');
  }

  const seen = new Set<string>();
  const unique = segments.filter((s) => {
    const key = `${s.locator}|${s.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const sourceLanguage = detectSourceLanguage(root, version);
  const xliff = (root.xliff ?? root['xliff:xliff']) as Record<string, unknown>;
  const targetLanguage =
    (typeof xliff['@_trgLang'] === 'string' && xliff['@_trgLang']) ||
    (typeof xliff['@_target-language'] === 'string' && xliff['@_target-language']) ||
    null;

  return {
    version,
    sourceLanguage,
    targetLanguage,
    segments: unique,
    rawXml: trimmed,
  };
}

export function isSupportedXliffExtension(filename: string): boolean {
  const lower = filename.toLowerCase();
  return lower.endsWith('.xlf') || lower.endsWith('.xliff');
}
