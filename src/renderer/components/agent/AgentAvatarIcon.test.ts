import { AgentId, AgentSource } from '@shared/agent';
import { DefaultAgentAvatarIcon } from '@shared/agent/avatar';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';

import { isPresetExpert } from '../../utils/agentDisplay';
import AgentAvatarIcon from './AgentAvatarIcon';

const render = (id: string, source: AgentSource, icon: string) => renderToStaticMarkup(
  React.createElement(AgentAvatarIcon, { value: icon, expertFallback: isPresetExpert({ id, source }) }),
);

test('preset experts use the bot for both empty and legacy normalized default avatars', () => {
  for (const icon of ['', DefaultAgentAvatarIcon]) {
    expect(render('office-expert', AgentSource.Preset, icon)).toContain('expert-default.webp');
  }
});

test('main and custom agents retain their existing default icons regardless of names or IDs', () => {
  for (const icon of ['', DefaultAgentAvatarIcon, 'agent-avatar-svg:code']) {
    expect(render(AgentId.Main, AgentSource.Preset, icon)).not.toContain('expert-default.webp');
    expect(render('office-expert', AgentSource.Custom, icon)).not.toContain('expert-default.webp');
  }
  expect(isPresetExpert({ id: 'unknown-source' })).toBe(false);
});

test('explicit preset images and non-default SVGs take priority over the fallback', () => {
  const url = 'https://ydhardwarecommon.nosdn.127.net/expert.webp';
  expect(render('expert', AgentSource.Preset, url)).toContain(`src="${url}"`);
  expect(render('expert', AgentSource.Preset, url)).not.toContain('expert-default.webp');
  expect(render('expert', AgentSource.Preset, 'agent-avatar-svg:code'))
    .toBe(render('expert', AgentSource.Custom, 'agent-avatar-svg:code'));
  expect(render('expert', AgentSource.Preset, 'agent-avatar-svg:code')).not.toContain('expert-default.webp');
});
