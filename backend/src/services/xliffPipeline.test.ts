import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  protectPlaceholders,
  restorePlaceholders,
  validatePlaceholderIntegrity,
  hasTranslatableText,
} from './placeholderProtection.js';
import { parseXliff } from '../parsers/xliffParser.js';
import { rebuildXliff } from './xliffRebuilder.js';
import { validateGeneratedXliff } from '../validators/xliffValidator.js';

describe('placeholderProtection', () => {
  it('protects and restores inline ph tags', () => {
    const original = 'Hello <ph id="1">{username}</ph>';
    const { protectedText, tokenMap } = protectPlaceholders(original);
    assert.match(protectedText, /__PH_0__/);
    assert.ok(!protectedText.includes('<ph'));
    const restored = restorePlaceholders(
      protectedText.replace('Hello', 'Hallo'),
      tokenMap,
    );
    assert.equal(restored, 'Hallo <ph id="1">{username}</ph>');
  });

  it('protects g tags but keeps inner text translatable', () => {
    const original =
      '<bpt id="1"/><g ctype="x-text" id="t">MAHLE internal restricted (CL2)</g><ept id="1"/>';
    const { protectedText, tokenMap } = protectPlaceholders(original);
    assert.match(protectedText, /MAHLE internal restricted \(CL2\)/);
    assert.match(protectedText, /__PH_/);
    assert.equal(hasTranslatableText(protectedText), true);
    const restored = restorePlaceholders(
      protectedText.replace('MAHLE internal restricted (CL2)', 'MAHLE intern eingeschränkt (CL2)'),
      tokenMap,
    );
    assert.match(restored, /<g ctype="x-text" id="t">MAHLE intern eingeschränkt \(CL2\)<\/g>/);
  });

  it('skips technical-only segments', () => {
    const original = '<bpt id="1"/><ph id="2">%Menu.SlideNumber%</ph><ept id="1"/>';
    const { protectedText } = protectPlaceholders(original);
    assert.equal(hasTranslatableText(protectedText), false);
  });

  it('detects token mismatch', () => {
    const { protectedText } = protectPlaceholders('Hi {name}');
    const bad = protectedText.replace('__PH_0__', '');
    const result = validatePlaceholderIntegrity(protectedText, bad);
    assert.equal(result.ok, false);
  });
});

describe('xliffParser 1.2', () => {
  const sample = `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">
  <file source-language="en" datatype="plaintext" original="demo">
    <body>
      <trans-unit id="1">
        <source>Hello <ph id="1">{username}</ph></source>
        <target></target>
      </trans-unit>
      <trans-unit id="2">
        <source>Welcome to our platform</source>
      </trans-unit>
    </body>
  </file>
</xliff>`;

  it('parses version, language, and segments', () => {
    const parsed = parseXliff(sample);
    assert.equal(parsed.version, '1.2');
    assert.equal(parsed.sourceLanguage, 'en');
    assert.equal(parsed.segments.length, 2);
    assert.ok(parsed.segments[0].sourceText.includes('{username}'));
  });

  it('rebuilds with German targets and preserves placeholders', () => {
    const rebuilt = rebuildXliff({
      rawXml: sample,
      version: '1.2',
      translations: [
        { id: '1', translatedText: 'Hallo <ph id="1">{username}</ph>' },
        { id: '2', translatedText: 'Willkommen auf unserer Plattform' },
      ],
      targetLanguageCode: 'de',
    });
    assert.match(rebuilt, /target-language="de"/);
    assert.match(rebuilt, /Hallo <ph id="1">\{username\}<\/ph>/);
    assert.match(rebuilt, /Willkommen auf unserer Plattform/);
    const validation = validateGeneratedXliff(rebuilt);
    assert.equal(validation.valid, true, validation.errors.join('; '));
  });
});

describe('xliffParser 2.0', () => {
  const sample = `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="2.0" xmlns="urn:oasis:names:tc:xliff:document:2.0" srcLang="en">
  <file id="f1">
    <unit id="u1">
      <segment id="s1">
        <source>Hello <ph id="1">{username}</ph></source>
      </segment>
    </unit>
    <unit id="u2">
      <segment id="s2">
        <source>Click {{button}} to continue</source>
        <target>Click {{button}} to continue</target>
      </segment>
    </unit>
  </file>
</xliff>`;

  it('parses XLIFF 2.0 units and segments', () => {
    const parsed = parseXliff(sample);
    assert.equal(parsed.version, '2.0');
    assert.equal(parsed.sourceLanguage, 'en');
    assert.equal(parsed.segments.length, 2);
  });

  it('rebuilds XLIFF 2.0 with targets', () => {
    const rebuilt = rebuildXliff({
      rawXml: sample,
      version: '2.0',
      translations: [
        { id: 's1', translatedText: 'Hallo <ph id="1">{username}</ph>' },
        { id: 's2', translatedText: 'Klicken Sie auf {{button}}, um fortzufahren' },
      ],
      targetLanguageCode: 'de',
    });
    assert.match(rebuilt, /trgLang="de"/);
    assert.match(rebuilt, /Hallo <ph id="1">\{username\}<\/ph>/);
    assert.match(rebuilt, /\{\{button\}\}/);
    const validation = validateGeneratedXliff(rebuilt);
    assert.equal(validation.valid, true, validation.errors.join('; '));
  });
});
