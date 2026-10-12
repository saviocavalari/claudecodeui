import assert from 'node:assert/strict';

import { test } from 'vitest';

import i18n from '@/modules/i18n/config';
import { languages } from '@/modules/i18n/languages';

type Messages = { [key: string]: string | Messages };

function flatten(messages: Messages, prefix = ''): Map<string, string> {
  const flat = new Map<string, string>();
  for (const [key, value] of Object.entries(messages)) {
    if (typeof value === 'string') {
      flat.set(prefix + key, value);
    } else {
      for (const [nestedKey, nestedValue] of flatten(value, `${prefix}${key}.`)) {
        flat.set(nestedKey, nestedValue);
      }
    }
  }
  return flat;
}

const placeholdersOf = (text: string) =>
  [...text.matchAll(/\{\{\s*(\w+)/g)].map((match) => match[1]).sort().join(',');

const bundle = (language: string, namespace: string) =>
  flatten((i18n.getResourceBundle(language, namespace) ?? {}) as Messages);

// A language that is listed in the selector but missing from the resources
// makes i18next fall back to English for every string, with no error anywhere.
test('every language offered in the selector has bundled translations', () => {
  for (const language of languages) {
    assert.ok(i18n.hasResourceBundle(language.value, 'common'), `${language.value} has no translations loaded`);
  }
});

test('pt-BR is the language shown before the user picks one', () => {
  assert.equal(i18n.language, 'pt-BR');
});

test('pt-BR translations keep the placeholders of the English text', () => {
  const namespaces = i18n.options.ns as string[];

  for (const namespace of namespaces) {
    const english = bundle('en', namespace);
    for (const [key, translated] of bundle('pt-BR', namespace)) {
      const original = english.get(key);
      if (original !== undefined) {
        assert.equal(placeholdersOf(translated), placeholdersOf(original), `${namespace}:${key}`);
      }
    }
  }
});
