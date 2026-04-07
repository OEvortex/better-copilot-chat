/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type ColorsTheme, Theme } from './theme.js';
import { lightSemanticColors } from './semantic-tokens.js';

const aetherLightColors: ColorsTheme = {
  type: 'light',
  Background: '#f8f9fa',
  Foreground: '#5c6166',
  LightBlue: '#55b4d4',
  AccentBlue: '#399ee6',
  AccentPurple: '#a37acc',
  AccentCyan: '#4cbf99',
  AccentGreen: '#86b300',
  AccentYellow: '#f2ae49',
  AccentRed: '#f07171',
  AccentYellowDim: '#8B7000',
  AccentRedDim: '#993333',
  DiffAdded: '#86b300',
  DiffRemoved: '#f07171',
  Comment: '#ABADB1',
  Gray: '#CCCFD3',
  GradientColors: ['#399ee6', '#86b300'],
};

export const AetherLight: Theme = new Theme(
  'Aether Light',
  'light',
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      background: aetherLightColors.Background,
      color: aetherLightColors.Foreground,
    },
    'hljs-comment': {
      color: aetherLightColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-quote': {
      color: aetherLightColors.AccentCyan,
      fontStyle: 'italic',
    },
    'hljs-string': {
      color: aetherLightColors.AccentGreen,
    },
    'hljs-constant': {
      color: aetherLightColors.AccentCyan,
    },
    'hljs-number': {
      color: aetherLightColors.AccentPurple,
    },
    'hljs-keyword': {
      color: aetherLightColors.AccentYellow,
    },
    'hljs-selector-tag': {
      color: aetherLightColors.AccentYellow,
    },
    'hljs-attribute': {
      color: aetherLightColors.AccentYellow,
    },
    'hljs-variable': {
      color: aetherLightColors.Foreground,
    },
    'hljs-variable.language': {
      color: aetherLightColors.LightBlue,
      fontStyle: 'italic',
    },
    'hljs-title': {
      color: aetherLightColors.AccentBlue,
    },
    'hljs-section': {
      color: aetherLightColors.AccentGreen,
      fontWeight: 'bold',
    },
    'hljs-type': {
      color: aetherLightColors.LightBlue,
    },
    'hljs-class .hljs-title': {
      color: aetherLightColors.AccentBlue,
    },
    'hljs-tag': {
      color: aetherLightColors.LightBlue,
    },
    'hljs-name': {
      color: aetherLightColors.AccentBlue,
    },
    'hljs-builtin-name': {
      color: aetherLightColors.AccentYellow,
    },
    'hljs-meta': {
      color: aetherLightColors.AccentYellow,
    },
    'hljs-symbol': {
      color: aetherLightColors.AccentRed,
    },
    'hljs-bullet': {
      color: aetherLightColors.AccentYellow,
    },
    'hljs-regexp': {
      color: aetherLightColors.AccentCyan,
    },
    'hljs-link': {
      color: aetherLightColors.LightBlue,
    },
    'hljs-deletion': {
      color: aetherLightColors.AccentRed,
    },
    'hljs-addition': {
      color: aetherLightColors.AccentGreen,
    },
    'hljs-emphasis': {
      fontStyle: 'italic',
    },
    'hljs-strong': {
      fontWeight: 'bold',
    },
    'hljs-literal': {
      color: aetherLightColors.AccentCyan,
    },
    'hljs-built_in': {
      color: aetherLightColors.AccentRed,
    },
    'hljs-doctag': {
      color: aetherLightColors.AccentRed,
    },
    'hljs-template-variable': {
      color: aetherLightColors.AccentCyan,
    },
    'hljs-selector-id': {
      color: aetherLightColors.AccentRed,
    },
  },
  aetherLightColors,
  lightSemanticColors,
);
