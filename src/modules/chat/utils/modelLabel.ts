/**
 * Model families, in the spelling they are shown in. The provider reports a
 * full id (`claude-opus-5-5`, `claude-haiku-4-5-20251001`); the footer shows
 * the family plus its version, and the exact id stays in the tooltip.
 */
const MODEL_FAMILY_LABELS: ReadonlyArray<readonly [token: string, label: string]> = [
  ['opus', 'Opus'],
  ['sonnet', 'Sonnet'],
  ['haiku', 'Haiku'],
  ['fable', 'Fable'],
];

/**
 * Reads the version that follows the family token in a Claude model id:
 * `claude-fable-5-2` -> "5.2", `claude-opus-5` -> "5",
 * `claude-haiku-4-5-20251001` -> "4.5" (the 8-digit snapshot date is not a
 * version part), `claude-opus-5[1m]` -> "5". An alias such as `fable` has no
 * version and yields `null`.
 */
const extractModelVersion = (normalized: string, familyToken: string): string | null => {
  const pattern = new RegExp(`${familyToken}-(\\d{1,2})(?:-(\\d{1,2}))?(?=$|-\\d{8}$|\\[)`);
  const match = normalized.match(pattern);
  if (!match) {
    return null;
  }

  return match[2] ? `${match[1]}.${match[2]}` : match[1];
};

/**
 * Shortens a reported model id to the label shown under a reply, or `null`
 * when there is nothing to show. Used by chat's MessageModelLabel.
 *
 * The family is followed by its version ("Fable 5.2", "Opus 5.5") so two
 * generations of the same family can be told apart, which the family alone
 * ("Fable") could not. An alias with no version in it ("fable") shows the
 * family alone. An id from no known family is shown verbatim rather than
 * dropped, so an unrecognized model still reports itself honestly. A `[1m]`
 * suffix is kept as "1M" instead of being folded into the base family: Claude
 * Code writes the base id on assistant rows today, but if a provider ever
 * reports the 1M variant it must not read as the 200K one.
 */
export const formatAnsweringModelLabel = (model: string | undefined): string | null => {
  const reportedModel = model?.trim();
  if (!reportedModel) {
    return null;
  }

  const normalized = reportedModel.toLowerCase();
  const family = MODEL_FAMILY_LABELS.find(([token]) => normalized.includes(token));
  if (!family) {
    return reportedModel;
  }

  const version = extractModelVersion(normalized, family[0]);
  const base = version ? `${family[1]} ${version}` : family[1];

  return normalized.endsWith('[1m]') ? `${base} 1M` : base;
};
