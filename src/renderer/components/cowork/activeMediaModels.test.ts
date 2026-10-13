import { describe, expect, test } from 'vitest';

import type { MediaModel } from '../../types/mediaGeneration';
import { activeMediaModels } from './activeMediaModels';

const model = (modelId: string, displayName: string, mediaType: MediaModel['mediaType']): MediaModel => ({
  modelId,
  displayName,
  mediaType,
  provider: 'test',
  generationTimeout: 60,
  pricing: {},
});

const NO_MODELS = { image: [], video: [] };

describe('activeMediaModels', () => {
  test('has nothing to show without a selection', () => {
    expect(activeMediaModels(undefined, NO_MODELS)).toEqual([]);
    expect(activeMediaModels({ mode: 'none' }, NO_MODELS)).toEqual([]);
  });

  test('names a single image model from the selection before the model list loads', () => {
    expect(activeMediaModels({ mode: 'image', modelId: 'seedream-4', modelName: 'Seedream 4.0' }, NO_MODELS))
      .toEqual([{ mode: 'image', modelId: 'seedream-4', name: 'Seedream 4.0' }]);
  });

  test('names both models of an image and video pair from the loaded lists', () => {
    const selection = {
      mode: 'auto' as const,
      modelId: 'seedream-4',
      modelName: 'Seedream 4.0',
      imageModelId: 'seedream-4',
      videoModelId: 'seedance-pro',
    };
    const models = { image: [model('seedream-4', 'Seedream 4.0', 'image')], video: [model('seedance-pro', 'Seedance Pro', 'video')] };
    expect(activeMediaModels(selection, models)).toEqual([
      { mode: 'image', modelId: 'seedream-4', name: 'Seedream 4.0' },
      { mode: 'video', modelId: 'seedance-pro', name: 'Seedance Pro' },
    ]);
    // Without the lists, the second name falls back to the model id.
    expect(activeMediaModels(selection, NO_MODELS)[1]).toEqual({ mode: 'video', modelId: 'seedance-pro', name: 'seedance-pro' });
  });

  test('uses canonical ids for renamed models', () => {
    expect(activeMediaModels({ mode: 'image', modelId: 'canvas-20', modelName: 'Canvas 2.0' }, NO_MODELS))
      .toEqual([{ mode: 'image', modelId: 'gpt-image-2', name: 'gpt-image-2' }]);
  });
});
