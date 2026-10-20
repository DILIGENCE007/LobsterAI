import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { imageEditMessageMetadata } from '../../shared/imageEditing/messageSnapshot';
import { type ImageEditMessageSnapshot,ImageEditOperation } from '../../shared/imageEditing/types';
import { ImageEditingService } from './imageEditing';

vi.mock('electron', () => ({ nativeImage: { createFromBuffer: (bytes: Buffer) => ({
  getSize: () => ({ width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }), isEmpty: () => false, toPNG: () => bytes,
}) } }));

function fixture(width = 640, height = 480) {
  const data = Buffer.alloc(33); Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(data);
  data.writeUInt32BE(13, 8); data.write('IHDR', 12);
  data.writeUInt32BE(width, 16); data.writeUInt32BE(height, 20); return data;
}

describe('immutable image versions and edit staging', () => {
  let directory: string;
  let original: string;
  const values = new Map<string, string>();
  const publish = vi.fn();
  const messages = new Map<string, { type: string; metadata: Record<string, unknown> }>();
  const saveMessageMetadata = vi.fn((_sessionId: string, messageId: string, metadata: Record<string, unknown>) => {
    messages.get(messageId)!.metadata = metadata;
  });
  const service = () => new ImageEditingService({ directory: path.join(directory, 'private'),
    getCwd: id => id === 'session' ? directory : undefined,
    get: key => values.has(key) ? JSON.parse(values.get(key)!) : undefined,
    set: (key, value) => { values.set(key, JSON.stringify(value)); }, changed: vi.fn(), publish,
    getMessage: (_sessionId, messageId) => messages.get(messageId) ?? null, saveMessageMetadata });
  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lobster-image-edit-test-'));
    original = path.join(directory, 'original.png'); await fs.writeFile(original, fixture()); values.clear(); publish.mockClear();
    messages.clear(); saveMessageMetadata.mockClear();
  });
  afterEach(async () => {
    if (path.dirname(directory) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith('lobster-image-edit-test-')) throw new Error('Unexpected fixture path');
    await fs.rm(directory, { recursive: true, force: true });
  });
  test('concurrent opens share one immutable source and leave the user file untouched', async () => {
    const edit = service();
    const input = { sessionId: 'session', title: 'original.png', filePath: original };
    const [a, b] = await Promise.all([edit.open(input), edit.open(input)]);
    expect(a.version.id).toBe(b.version.id);
    expect(edit.list({ sessionId: 'session', rootId: a.version.id })).toHaveLength(1);
    expect(a.version.filePath).not.toBe(original);
    await fs.writeFile(original, fixture(800, 600));
    expect((await edit.read({ sessionId: 'session', versionId: a.version.id })).dataUrl).toBe(a.dataUrl);
  });
  test('a queued edit freezes a saved output, and lineage survives service recreation', async () => {
    const edit = service(); const opened = await edit.open({ sessionId: 'session', title: 'original.png', filePath: original });
    const resized = await edit.save({ sessionId: 'session', sourceId: opened.version.id,
      operation: ImageEditOperation.Resize, dataUrl: `data:image/png;base64,${fixture(320, 240).toString('base64')}` });
    expect(publish).toHaveBeenCalledWith(resized);
    const request = await edit.stage({ sessionId: 'session', sourceId: resized.id, operation: ImageEditOperation.RemoveBackground });
    await fs.writeFile(resized.filePath, fixture(960, 720));
    expect((await fs.readFile(request.source.filePath)).readUInt32BE(16)).toBe(320);
    expect(service().resolve('session', request.id)).toEqual(request);
    expect(service().list({ sessionId: 'session', rootId: opened.version.id }).map(v => v.parentId)).toEqual([undefined, opened.version.id]);
  });
  test('rejects cross-session versions, invalid regions, and models that cannot edit before generation', async () => {
    const edit = service(); const opened = await edit.open({ sessionId: 'session', title: 'original.png', filePath: original });
    await expect(edit.stage({ sessionId: 'other', sourceId: opened.version.id, operation: ImageEditOperation.RemoveBackground })).rejects.toThrow();
    await expect(edit.stage({ sessionId: 'session', sourceId: opened.version.id, operation: ImageEditOperation.Comment,
      regions: [{ id: 'bad', x: 0.8, y: 0.2, width: 0.5, height: 0.2, text: 'change' }] })).rejects.toThrow();
    const request = await edit.stage({ sessionId: 'session', sourceId: opened.version.id, operation: ImageEditOperation.RemoveBackground });
    expect(() => edit.generation(request, { capabilities: 'text-to-image', parameterSpec: { images: { maxItems: 1 } } })).toThrow();
    const params = edit.generation(request, { capabilities: 'image editing', parameterSpec: { images: { maxItems: 2 } } });
    expect(params.params.images).toEqual([request.source.filePath]); expect(params.params.n).toBe(1);
  });
  test('sent metadata and image bytes survive later drafts, output replacement and service recreation', async () => {
    const edit = service();
    const { version } = await edit.open({ sessionId: 'session', title: 'original.png', filePath: original });
    const saved = await edit.save({ sessionId: 'session', sourceId: version.id, operation: ImageEditOperation.Resize,
      dataUrl: `data:image/png;base64,${fixture(320, 240).toString('base64')}` });
    const request = await edit.stage({ sessionId: 'session', sourceId: saved.id, operation: ImageEditOperation.Comment,
      regions: [{ id: 'r1', x: 0.2, y: 0.4, width: 0.5, height: 0.5, text: 'Add a dog' }] });
    messages.set('sent', { type: 'user', metadata: imageEditMessageMetadata([{ imageEdit: request }]) });
    request.regions[0].text = 'Later draft';
    request.regions[0].x = 0.1;
    await fs.writeFile(saved.filePath, fixture(960, 720));
    const restored = service();
    expect(restored.history({ sessionId: 'session', messageId: 'sent' })[0]).toMatchObject({
      sourceVersionNumber: 2, source: { width: 320, height: 240 },
      regions: [{ x: 0.2, text: 'Add a dog' }],
    });
    expect((await restored.readSnapshot({ sessionId: 'session', requestId: request.id })).dataUrl)
      .toBe(`data:image/png;base64,${fixture(320, 240).toString('base64')}`);
    await expect(restored.readSnapshot({ sessionId: 'other', requestId: request.id })).rejects.toThrow();
  });
  test('historical messages recover only the request with their exact frozen attachment path', async () => {
    const edit = service();
    const { version } = await edit.open({ sessionId: 'session', title: 'original.png', filePath: original });
    const input = { sessionId: 'session', sourceId: version.id, operation: ImageEditOperation.Comment,
      regions: [{ id: 'r1', x: 0.2, y: 0.4, width: 0.5, height: 0.5, text: 'Add a cat' }] };
    const first = await edit.stage(input);
    const second = await edit.stage({ ...input, regions: [{ ...input.regions[0], text: 'Add a dog' }] });
    // Simulate pre-snapshot requests, which did not record a display version number.
    const state = JSON.parse(values.get('image-editing:session')!);
    for (const request of state.requests) delete request.sourceVersionNumber;
    values.set('image-editing:session', JSON.stringify(state));
    messages.set('old', { type: 'user', metadata: {
      imageAttachmentPreviews: [{ localPath: first.source.filePath, name: version.title }], turnUsage: { totalTokens: 30 },
    } });
    const snapshots = service().history({ sessionId: 'session', messageId: 'old' });
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({ requestId: first.id, sourceVersionNumber: 1, regions: [{ text: 'Add a cat' }] });
    expect(snapshots[0].requestId).not.toBe(second.id);
    expect(messages.get('old')?.metadata).toMatchObject({ turnUsage: { totalTokens: 30 }, imageEdits: snapshots });
    expect(service().history({ sessionId: 'session', messageId: 'old' })).toEqual(snapshots);
    expect(saveMessageMetadata).toHaveBeenCalledTimes(1);
    for (const [messageId, type, previews] of [
      ['same-title', 'user', [{ localPath: original, name: version.title }]],
      ['no-path', 'user', [{ name: version.title }]],
      ['assistant', 'assistant', [{ localPath: first.source.filePath }]],
    ] as const) {
      messages.set(messageId, { type, metadata: { imageAttachmentPreviews: previews } });
      expect(service().history({ sessionId: 'session', messageId })).toEqual([]);
    }
    expect((messages.get('old')?.metadata.imageEdits as ImageEditMessageSnapshot[])[0].source.id).toBe(version.id);
  });
});
