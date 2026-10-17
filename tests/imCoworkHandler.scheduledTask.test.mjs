import assert from 'node:assert/strict';
import EventEmitter from 'node:events';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { IMCoworkHandler } = require('../dist-electron/main/im/imCoworkHandler.js');

class FakeRuntime extends EventEmitter {
  constructor() {
    super();
    this.startCalls = [];
    this.continueCalls = [];
  }

  async startSession(sessionId, prompt, options = {}) {
    this.startCalls.push({ sessionId, prompt, options });
  }

  async continueSession(sessionId, prompt, options = {}) {
    this.continueCalls.push({ sessionId, prompt, options });
  }

  stopSession() {}
  stopAllSessions() {}
  respondToPermission() {}
  isSessionActive() { return false; }
  getSessionConfirmationMode() { return 'text'; }
}

class FakeCoworkStore {
  constructor() {
    this.config = {
      workingDirectory: process.cwd(),
      systemPrompt: '',
      executionMode: 'auto',
      agentEngine: 'openclaw',
    };
    this.sessions = new Map();
    this.sessionCounter = 0;
    this.messageCounter = 0;
  }

  getConfig() {
    return this.config;
  }

  getAgent() {
    return null;
  }

  createSession(title, cwd, systemPrompt, executionMode) {
    const id = `session-${++this.sessionCounter}`;
    const session = {
      id,
      title,
      cwd,
      systemPrompt,
      executionMode,
      claudeSessionId: null,
      status: 'idle',
      messages: [],
    };
    this.sessions.set(id, session);
    return session;
  }

  getSession(id) {
    return this.sessions.get(id) || null;
  }

  updateSession(id, updates) {
    const session = this.sessions.get(id);
    if (!session) return;
    Object.assign(session, updates);
  }

  addMessage(sessionId, message) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Unknown session: ${sessionId}`);
    }
    const created = {
      id: `message-${++this.messageCounter}`,
      timestamp: Date.now(),
      ...message,
    };
    session.messages.push(created);
    return created;
  }
}

class FakeIMStore {
  constructor() {
    this.mappings = [];
    this.settings = { skillsEnabled: false };
  }

  getIMSettings() {
    return this.settings;
  }

  listSessionMappings() {
    return [...this.mappings];
  }

  getSessionMapping(imConversationId, platform) {
    return this.mappings.find((entry) => (
      entry.imConversationId === imConversationId && entry.platform === platform
    )) || null;
  }

  getSessionMappingByCoworkSessionId(coworkSessionId) {
    return this.mappings.find((entry) => entry.coworkSessionId === coworkSessionId) || null;
  }

  createSessionMapping(imConversationId, platform, coworkSessionId) {
    const mapping = {
      imConversationId,
      platform,
      coworkSessionId,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
    };
    this.mappings.push(mapping);
    return mapping;
  }

  updateSessionLastActive(imConversationId, platform) {
    const mapping = this.getSessionMapping(imConversationId, platform);
    if (mapping) {
      mapping.lastActiveAt = Date.now();
    }
  }

  deleteSessionMapping(imConversationId, platform) {
    this.mappings = this.mappings.filter((entry) => (
      entry.imConversationId !== imConversationId || entry.platform !== platform
    ));
  }
}

function createMessage(overrides = {}) {
  return {
    platform: 'nim',
    messageId: 'im-msg-1',
    conversationId: 'conv-1',
    senderId: 'user-1',
    senderName: 'Tester',
    content: '2分钟后提醒我喝水',
    chatType: 'direct',
    timestamp: Date.parse('2026-03-15T16:28:00+08:00'),
    ...overrides,
  };
}

test('async reminder turns on channel-synced sessions are tracked lazily and relay back', async () => {
  const runtime = new FakeRuntime();
  const coworkStore = new FakeCoworkStore();
  const imStore = new FakeIMStore();
  const relayedReplies = [];

  const session = coworkStore.createSession('IM-dingtalk', process.cwd(), '', 'auto');
  imStore.createSessionMapping('default:user-42', 'dingtalk', session.id);

  const handler = new IMCoworkHandler({
    coworkRuntime: runtime,
    coworkStore,
    imStore,
    sendAsyncReply: async (platform, conversationId, text) => {
      relayedReplies.push({ platform, conversationId, text });
      return true;
    },
  });

  runtime.emit('message', session.id, {
    id: 'system-1',
    type: 'system',
    content: '⏰ 提醒：开会',
    timestamp: Date.now(),
    metadata: {},
  });
  runtime.emit('message', session.id, {
    id: 'assistant-1',
    type: 'assistant',
    content: '时间到了，记得开会。',
    timestamp: Date.now(),
    metadata: {},
  });
  runtime.emit('complete', session.id, null);

  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(relayedReplies, [
    {
      platform: 'dingtalk',
      conversationId: 'default:user-42',
      text: '时间到了，记得开会。',
    },
  ]);

  handler.destroy();
});

test('runs ordinary IM messages through agent execution', async () => {
  const runtime = new FakeRuntime();
  const coworkStore = new FakeCoworkStore();
  const imStore = new FakeIMStore();

  const handler = new IMCoworkHandler({
    coworkRuntime: runtime,
    coworkStore,
    imStore,
  });

  const pending = handler.processMessage(createMessage({ content: '帮我总结一下今天的会议纪要' }));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(runtime.startCalls.length, 1);
  assert.equal(runtime.startCalls[0].prompt, '帮我总结一下今天的会议纪要');

  runtime.emit('message', 'session-1', {
    id: 'assistant-1',
    type: 'assistant',
    content: '这是会议纪要摘要。',
    timestamp: Date.now(),
    metadata: {},
  });
  runtime.emit('complete', 'session-1', null);

  const reply = await pending;
  assert.equal(reply, '这是会议纪要摘要。');

  handler.destroy();
});
