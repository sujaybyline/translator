/**
 * Rebuild XLIFF by surgically updating <target> elements in the original XML.
 * Preserves declaration, namespaces, attributes, and non-translatable structure.
 */

import type { XliffVersion } from '../types/index.js';

export interface SegmentTranslation {
  id: string;
  translatedText: string;
}

function escapeXmlText(text: string): string {
  // If the translation already contains markup (restored inline tags), do not
  // escape tag brackets — only escape bare & that aren't entities.
  if (/<[a-zA-Z_/]/.test(text)) {
    return text.replace(/&(?!(?:#\d+|#x[\da-fA-F]+|[a-zA-Z][\w.-]*);)/g, '&amp;');
  }
  return text
    .replace(/&(?!(?:#\d+|#x[\da-fA-F]+|[a-zA-Z][\w.-]*);)/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function setTargetLanguageAttrs(xml: string, version: XliffVersion, targetLang: string): string {
  let result = xml;

  if (version === '2.0') {
    if (/\btrgLang\s*=/.test(result)) {
      result = result.replace(/\btrgLang\s*=\s*(["'])[^"']*\1/i, `trgLang=$1${targetLang}$1`);
    } else {
      result = result.replace(/<xliff\b([^>]*)>/i, `<xliff$1 trgLang="${targetLang}">`);
    }
  } else {
    // XLIFF 1.2 — target-language usually on <file>
    if (/\btarget-language\s*=/.test(result)) {
      result = result.replace(
        /\btarget-language\s*=\s*(["'])[^"']*\1/gi,
        `target-language=$1${targetLang}$1`,
      );
    } else {
      result = result.replace(
        /<file\b([^>]*)>/i,
        `<file$1 target-language="${targetLang}">`,
      );
    }
  }

  return result;
}

/**
 * Update or insert <target> for XLIFF 1.2 trans-units matched by id.
 */
function applyXliff12(xml: string, translations: Map<string, string>): string {
  return xml.replace(
    /<trans-unit\b([^>]*)>([\s\S]*?)<\/trans-unit>/gi,
    (full, attrs: string, inner: string) => {
      const idMatch = attrs.match(/\bid\s*=\s*(["'])([^"']*)\1/i);
      const id = idMatch?.[2];
      if (!id || !translations.has(id)) return full;

      const translated = escapeXmlText(translations.get(id)!);
      let newInner: string;

      if (/<target\b[\s\S]*?<\/target>/i.test(inner)) {
        newInner = inner.replace(
          /<target\b([^>]*)>[\s\S]*?<\/target>/i,
          (_t, tAttrs: string) => {
            let attrsOut = tAttrs;
            if (/\bstate\s*=/.test(attrsOut)) {
              attrsOut = attrsOut.replace(/\bstate\s*=\s*(["'])[^"']*\1/i, 'state=$1translated$1');
            } else {
              attrsOut = `${attrsOut} state="translated"`;
            }
            return `<target${attrsOut}>${translated}</target>`;
          },
        );
      } else if (/<target\b[^>]*\/>/i.test(inner)) {
        newInner = inner.replace(
          /<target\b[^>]*\/>/i,
          `<target state="translated">${translated}</target>`,
        );
      } else {
        // Insert target after source
        if (/<\/source>/i.test(inner)) {
          newInner = inner.replace(
            /<\/source>/i,
            `</source>\n        <target state="translated">${translated}</target>`,
          );
        } else {
          newInner = `${inner}\n        <target state="translated">${translated}</target>`;
        }
      }

      return `<trans-unit${attrs}>${newInner}</trans-unit>`;
    },
  );
}

/**
 * Update or insert <target> for XLIFF 2.0 segments.
 * Matches by segment id, or unit id when segment has no id and only one segment.
 */
function applyXliff20(xml: string, translations: Map<string, string>): string {
  return xml.replace(
    /<unit\b([^>]*)>([\s\S]*?)<\/unit>/gi,
    (unitFull, unitAttrs: string, unitInner: string) => {
      const unitIdMatch = unitAttrs.match(/\bid\s*=\s*(["'])([^"']*)\1/i);
      const unitId = unitIdMatch?.[2] ?? '';

      const newUnitInner = unitInner.replace(
        /<segment\b([^>]*)>([\s\S]*?)<\/segment>/gi,
        (segFull, segAttrs: string, segInner: string) => {
          const segIdMatch = segAttrs.match(/\bid\s*=\s*(["'])([^"']*)\1/i);
          const segId = segIdMatch?.[2];
          const candidates = [segId, unitId, segId ? `${unitId}-${segId}` : undefined].filter(
            Boolean,
          ) as string[];

          let translated: string | undefined;
          for (const c of candidates) {
            if (translations.has(c)) {
              translated = translations.get(c);
              break;
            }
          }
          // Also try keys that end with this seg id
          if (translated == null && segId) {
            for (const [key, value] of translations) {
              if (key === segId || key.endsWith(`:${segId}`) || key.endsWith(`-${segId}`)) {
                translated = value;
                break;
              }
            }
          }
          if (translated == null) return segFull;

          const escaped = escapeXmlText(translated);
          let newSegInner: string;

          if (/<target\b[\s\S]*?<\/target>/i.test(segInner)) {
            newSegInner = segInner.replace(
              /<target\b([^>]*)>[\s\S]*?<\/target>/i,
              (_t, tAttrs: string) => `<target${tAttrs}>${escaped}</target>`,
            );
          } else if (/<target\b[^>]*\/>/i.test(segInner)) {
            newSegInner = segInner.replace(/<target\b[^>]*\/>/i, `<target>${escaped}</target>`);
          } else if (/<\/source>/i.test(segInner)) {
            newSegInner = segInner.replace(
              /<\/source>/i,
              `</source>\n        <target>${escaped}</target>`,
            );
          } else {
            newSegInner = `${segInner}\n        <target>${escaped}</target>`;
          }

          // Mark segment as translated when state attr exists or add it
          let newSegAttrs = segAttrs;
          if (/\bstate\s*=/.test(newSegAttrs)) {
            newSegAttrs = newSegAttrs.replace(
              /\bstate\s*=\s*(["'])[^"']*\1/i,
              'state=$1translated$1',
            );
          }

          return `<segment${newSegAttrs}>${newSegInner}</segment>`;
        },
      );

      return `<unit${unitAttrs}>${newUnitInner}</unit>`;
    },
  );
}

export function rebuildXliff(options: {
  rawXml: string;
  version: XliffVersion;
  translations: SegmentTranslation[];
  targetLanguageCode?: string;
}): string {
  const { rawXml, version, translations, targetLanguageCode = 'de' } = options;
  const map = new Map(translations.map((t) => [t.id, t.translatedText]));

  let result = version === '2.0' ? applyXliff20(rawXml, map) : applyXliff12(rawXml, map);
  result = setTargetLanguageAttrs(result, version, targetLanguageCode);
  return result;
}

export function buildOutputFilename(originalFilename: string, langCode = 'de'): string {
  const lower = originalFilename.toLowerCase();
  if (lower.endsWith('.xliff')) {
    return originalFilename.replace(/\.xliff$/i, `_${langCode}.xliff`);
  }
  if (lower.endsWith('.xlf')) {
    return originalFilename.replace(/\.xlf$/i, `_${langCode}.xlf`);
  }
  return `${originalFilename}_${langCode}.xliff`;
}
