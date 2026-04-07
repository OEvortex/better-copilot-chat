/**
 * @license
 * Copyright 2025 Aether team
 * SPDX-License-Identifier: Apache-2.0
 */

export type SupportedLanguage = 'en' | string;

export interface LanguageDefinition {
  /** The internal locale code used by the i18n system (e.g., 'en'). */
  code: SupportedLanguage;
  /** The standard name used in UI settings (e.g., 'en-US'). */
  id: string;
  /** The full English name of the language (e.g., 'English'). */
  fullName: string;
  /** The native name of the language (e.g., 'English'). */
  nativeName?: string;
}

export const SUPPORTED_LANGUAGES: readonly LanguageDefinition[] = [
  {
    code: 'en',
    id: 'en-US',
    fullName: 'English',
    nativeName: 'English',
  },
];

/**
 * Maps a locale code to its English language name.
 * Used for LLM output language instructions.
 */
export function getLanguageNameFromLocale(locale: SupportedLanguage): string {
  const lang = SUPPORTED_LANGUAGES.find((l) => l.code === locale);
  return lang?.fullName || 'English';
}

/**
 * Gets the language options for the settings schema.
 */
export function getLanguageSettingsOptions(): Array<{
  value: string;
  label: string;
}> {
  return [
    { value: 'auto', label: 'Auto (detect from system)' },
    ...SUPPORTED_LANGUAGES.map((l) => ({
      value: l.code,
      label: l.nativeName
        ? `${l.nativeName} (${l.fullName})`
        : `${l.fullName} (${l.id})`,
    })),
  ];
}

/**
 * Gets a string containing all supported language IDs (e.g., "en-US|zh-CN").
 */
export function getSupportedLanguageIds(separator = '|'): string {
  return SUPPORTED_LANGUAGES.map((l) => l.id).join(separator);
}
