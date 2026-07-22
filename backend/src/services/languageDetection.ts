import { franc } from 'franc-min';

const ISO6393_TO_NAME: Record<string, string> = {
  eng: 'English',
  deu: 'German',
  ger: 'German',
  fra: 'French',
  fre: 'French',
  spa: 'Spanish',
  ara: 'Arabic',
  hin: 'Hindi',
  por: 'Portuguese',
  ita: 'Italian',
  nld: 'Dutch',
  pol: 'Polish',
  rus: 'Russian',
  jpn: 'Japanese',
  zho: 'Chinese',
  kor: 'Korean',
  tur: 'Turkish',
  swe: 'Swedish',
  und: 'Unknown',
};

const ISO6391_TO_NAME: Record<string, string> = {
  en: 'English',
  de: 'German',
  fr: 'French',
  es: 'Spanish',
  ar: 'Arabic',
  hi: 'Hindi',
  pt: 'Portuguese',
  it: 'Italian',
  nl: 'Dutch',
  pl: 'Polish',
  ru: 'Russian',
  ja: 'Japanese',
  zh: 'Chinese',
  ko: 'Korean',
  tr: 'Turkish',
  sv: 'Swedish',
};

export function languageCodeToName(code: string | null | undefined): string {
  if (!code) return 'Unknown';
  const normalized = code.trim().toLowerCase().replace('_', '-');
  const primary = normalized.split('-')[0] ?? normalized;
  if (ISO6391_TO_NAME[primary]) return ISO6391_TO_NAME[primary];
  if (ISO6393_TO_NAME[primary]) return ISO6393_TO_NAME[primary];
  return code;
}

/**
 * Prefer XLIFF-declared source language; fall back to franc detection on segment text.
 */
export function detectSourceLanguage(
  declared: string | null,
  sampleTexts: string[],
): { code: string; name: string; method: 'declared' | 'detected' | 'unknown' } {
  if (declared && declared.trim()) {
    const code = declared.trim();
    return { code, name: languageCodeToName(code), method: 'declared' };
  }

  const sample = sampleTexts.slice(0, 40).join(' ').slice(0, 5000);
  if (sample.trim().length < 10) {
    return { code: 'und', name: 'Unknown', method: 'unknown' };
  }

  const detected = franc(sample, { minLength: 10 });
  if (!detected || detected === 'und') {
    return { code: 'und', name: 'Unknown', method: 'unknown' };
  }

  return {
    code: detected,
    name: languageCodeToName(detected),
    method: 'detected',
  };
}
