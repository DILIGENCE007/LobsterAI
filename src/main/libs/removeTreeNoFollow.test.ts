import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, expect, test } from 'vitest';

import { removeTreeNoFollow, removeTreeNoFollowSync } from './removeTreeNoFollow';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

test.each([
  ['async', removeTreeNoFollow],
  ['sync', async (target: string) => removeTreeNoFollowSync(target)],
])('%s removal unlinks links and junctions without touching their targets', async (_name, remove) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lobster-remove-tree-'));
  roots.push(root);
  const external = path.join(root, 'external');
  fs.mkdirSync(external);
  fs.writeFileSync(path.join(external, 'keep.txt'), 'external');
  const tree = path.join(root, 'tree');
  fs.mkdirSync(path.join(tree, 'nested', 'deeper'), { recursive: true });
  fs.writeFileSync(path.join(tree, 'nested', 'deeper', 'file.txt'), 'owned');
  fs.symlinkSync(external, path.join(tree, 'nested', 'junction'), 'junction');
  fs.symlinkSync(path.join(root, 'absent'), path.join(tree, 'dangling'), 'junction');

  await remove(tree);

  expect(fs.existsSync(tree)).toBe(false);
  expect(fs.readFileSync(path.join(external, 'keep.txt'), 'utf8')).toBe('external');
  await expect(remove(tree)).resolves.toBeUndefined();
});
