import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { ImageEditOperation } from '../../shared/imageEditing/types';
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
  const service = () => new ImageEditingService({ directory: path.join(directory, 'private'),
    getCwd: id => id === 'session' ? directory : undefined,
    get: key => values.has(key) ? JSON.parse(values.get(key)!) : undefined,
    set: (key, value) => { values.set(key, JSON.stringify(value)); }, changed: vi.fn(), publish });
  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lobster-image-edit-test-'));
    original = path.join(directory, 'original.png'); await fs.writeFile(original, fixture()); values.clear(); publish.mockClear();
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
});
