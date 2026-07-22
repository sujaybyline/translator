/**
 * Protect XLIFF inline tags and common placeholder patterns before Gemini translation.
 * `<g>` text groups keep inner content translatable; technical tags are fully tokenized.
 */

const TECHNICAL_INLINE_PATTERN =
  /<(?:ph|x|bx|ex|bpt|ept|it|mrk|pc|sc|ec|cp|sm|em)(?:\s[^>]*)?(?:\/>|>[\s\S]*?<\/(?:ph|x|bx|ex|bpt|ept|it|mrk|pc|sc|ec|cp|sm|em)>)/gi;

const G_TEXT_GROUP_PATTERN = /<g(\s[^>]*)>([\s\S]*?)<\/g>/gi;

const PLACEHOLDER_PATTERNS: RegExp[] = [
  /%\w+(?:\.\w+)*%/g, // %Menu.SlideNumber%
  /\{\{[^{}]+\}\}/g,
  /\{[^{}]+\}/g,
  /%\d+\$?[sdif]/g,
  /\$\{[^}]+\}/g,
  /<\/?(?:break|emphasis|prosody|say-as|sub|phoneme|voice|audio|p|s|w)\b[^>]*\/?>/gi,
];

export interface ProtectionResult {
  protectedText: string;
  tokenMap: Record<string, string>;
  /** True when there is human-readable text for Gemini to translate */
  hasTranslatableText: boolean;
}

function createReplacer(tokenMap: Record<string, string>, indexRef: { value: number }) {
  return (match: string): string => {
    const token = `__PH_${indexRef.value}__`;
    tokenMap[token] = match;
    indexRef.value += 1;
    return token;
  };
}

function protectTechnicalTags(text: string, replaceMatch: (m: string) => string): string {
  return text.replace(TECHNICAL_INLINE_PATTERN, replaceMatch);
}

function protectGTextGroups(text: string, replaceMatch: (m: string) => string): string {
  return text.replace(G_TEXT_GROUP_PATTERN, (_full, attrs: string, inner: string) => {
    const open = replaceMatch(`<g${attrs}>`);
    const close = replaceMatch('</g>');
    const protectedInner = protectTechnicalTags(inner, replaceMatch);
    return `${open}${protectedInner}${close}`;
  });
}

function protectPlaceholderPatterns(text: string, replaceMatch: (m: string) => string): string {
  let working = text;
  for (const pattern of PLACEHOLDER_PATTERNS) {
    working = working.replace(pattern, (match) => {
      if (/^__PH_\d+__$/.test(match)) return match;
      return replaceMatch(match);
    });
  }
  return working;
}

/** Detect if protected string still has natural language to translate */
export function hasTranslatableText(protectedText: string): boolean {
  const stripped = protectedText
    .replace(/__PH_\d+__/g, ' ')
    .replace(/&[a-zA-Z#0-9]+;/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim();
  return /\p{L}{2,}/u.test(stripped);
}

export function protectPlaceholders(text: string): ProtectionResult {
  const tokenMap: Record<string, string> = {};
  const indexRef = { value: 0 };
  const replaceMatch = createReplacer(tokenMap, indexRef);

  let working = protectTechnicalTags(text, replaceMatch);
  working = protectGTextGroups(working, replaceMatch);
  working = protectPlaceholderPatterns(working, replaceMatch);

  return {
    protectedText: working,
    tokenMap,
    hasTranslatableText: hasTranslatableText(working),
  };
}

export function restorePlaceholders(
  translatedText: string,
  tokenMap: Record<string, string>,
): string {
  let result = translatedText;
  const tokens = Object.keys(tokenMap).sort((a, b) => b.length - a.length);
  for (const token of tokens) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const flexible = new RegExp(escaped.replace(/_/g, '_\\s*'), 'g');
    if (flexible.test(result)) {
      result = result.replace(flexible, tokenMap[token]);
    } else if (result.includes(token)) {
      result = result.split(token).join(tokenMap[token]);
    }
  }
  return result;
}

export function extractProtectedTokens(text: string): string[] {
  const matches = text.match(/__PH_\d+__/g) ?? [];
  return [...matches].sort();
}

export function validatePlaceholderIntegrity(
  originalProtected: string,
  translatedProtected: string,
): { ok: boolean; reason?: string } {
  const originalTokens = extractProtectedTokens(originalProtected);
  const translatedTokens = extractProtectedTokens(translatedProtected);

  if (originalTokens.length !== translatedTokens.length) {
    return {
      ok: false,
      reason: `Token count mismatch: expected ${originalTokens.length}, got ${translatedTokens.length}`,
    };
  }

  const originalSet = new Map<string, number>();
  for (const t of originalTokens) {
    originalSet.set(t, (originalSet.get(t) ?? 0) + 1);
  }
  const translatedSet = new Map<string, number>();
  for (const t of translatedTokens) {
    translatedSet.set(t, (translatedSet.get(t) ?? 0) + 1);
  }

  for (const [token, count] of originalSet) {
    if ((translatedSet.get(token) ?? 0) !== count) {
      return { ok: false, reason: `Missing or altered token: ${token}` };
    }
  }

  return { ok: true };
}
