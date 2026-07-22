import { validateXml, parseXliff } from '../parsers/xliffParser.js';

export interface XliffValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateGeneratedXliff(xml: string): XliffValidationResult {
  const errors: string[] = [];

  if (!xml.trim()) {
    return { valid: false, errors: ['Generated XLIFF is empty.'] };
  }

  const xmlCheck = validateXml(xml);
  if (!xmlCheck.valid) {
    errors.push(xmlCheck.error ?? 'Invalid XML');
    return { valid: false, errors };
  }

  if (!/<xliff\b/i.test(xml)) {
    errors.push('Missing root <xliff> element.');
  }

  try {
    const parsed = parseXliff(xml);
    if (parsed.segments.length === 0) {
      errors.push('Generated XLIFF has no translation units.');
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : 'XLIFF structure validation failed.');
  }

  // Basic well-formedness: target tags present for translated content
  const hasTargets = /<target[\s>]/i.test(xml);
  if (!hasTargets) {
    errors.push('Generated XLIFF contains no <target> elements.');
  }

  return { valid: errors.length === 0, errors };
}
