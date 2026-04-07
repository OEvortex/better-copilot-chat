/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type ColorsTheme, Theme } from './theme.js';
import { darkSemanticColors } from './semantic-tokens.js';

const aetherDarkColors: ColorsTheme = {
  type: 'dark',
  Background: '#0b0e14',
  Foreground: '#bfbdb6',
  LightBlue: '#59C2FF',
  AccentBlue: '#39BAE6',
  AccentPurple: '#D2A6FF',
  AccentCyan: '#95E6CB',
  AccentGreen: '#AAD94C',
  AccentYellow: '#FFD700',
  AccentRed: '#F26D78',
  AccentYellowDim: '#8B7530',
  AccentRedDim: '#8B3A4A',
  DiffAdded: '#AAD94C',
  DiffRemoved: '#F26D78',
  Comment: '#646A71',
  Gray: '#3D4149',
  GradientColors: ['#FFD700', '#da7959'],
};

export const AetherDark: Theme = new Theme(
  'Aether Dark',
  'dark',
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      background: aetherDarkColors.Background,
      color: aetherDarkColors.Foreground,
    },
    'hljs-keyword': {
      color: aetherDarkColors.AccentYellow,
    },
    'hljs-literal': {
      color: aetherDarkColors.AccentPurple,
    },
    'hljs-symbol': {
      color: aetherDarkColors.AccentCyan,
    },
    'hljs-name': {
      color: aetherDarkColors.LightBlue,
    },
    'hljs-link': {
      color: aetherDarkColors.AccentBlue,
    },
    'hljs-function .hljs-keyword': {
      color: aetherDarkColors.AccentYellow,
    },
    'hljs-subst': {
      color: aetherDarkColors.Foreground,
    },
    'hljs-string': {
      color: aetherDarkColors.AccentGreen,
    },
    'hljs-title': {
      color: aetherDarkColors.AccentYellow,
    },
    'hljs-type': {
      color: aetherDarkColors.AccentBlue,
    },
    'hljs-attribute': {
      color: aetherDarkColors.AccentYellow,
    },
    'hljs-bullet': {
      color: aetherDarkColors.AccentYellow,
    },
    'hljs-addition': {
      color: aetherDarkColors.AccentGreen,
    },
    'hljs-variable': {
      color: aetherDarkColors.Foreground,
    },
    'hljs-template-tag': {
      color: aetherDarkColors.AccentYellow,
    },
    'hljs-template-variable': {
      color: aetherDarkColors.AccentYellow,
    },
    'hljs-comment': {
      color: aetherDarkColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-quote': {
      color: aetherDarkColors.AccentCyan,
      fontStyle: 'italic',
    },
    'hljs-deletion': {
      color: aetherDarkColors.AccentRed,
    },
    'hljs-meta': {
      color: aetherDarkColors.AccentYellow,
    },
    'hljs-doctag': {
      fontWeight: 'bold',
    },
    'hljs-strong': {
      fontWeight: 'bold',
    },
    'hljs-emphasis': {
      fontStyle: 'italic',
    },
  },
  aetherDarkColors,
  darkSemanticColors,
);
