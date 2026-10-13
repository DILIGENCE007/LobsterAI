import { canonicalizeMediaModelId, mediaModelDisplayName } from '@shared/mediaModelAliases';

import type { MediaGenerationSelection, MediaModel } from '../../types/mediaGeneration';

export interface ActiveMediaModel {
  mode: 'image' | 'video';
  modelId: string;
  name: string;
}

/**
 * The image and video models a draft generates with, named from the loaded
 * model lists when they are there and from the selection otherwise.
 */
export function activeMediaModels(
  selection: MediaGenerationSelection | undefined,
  models: { image: MediaModel[]; video: MediaModel[] },
): ActiveMediaModel[] {
  if (!selection || selection.mode === 'none') return [];
  const entry = (mode: ActiveMediaModel['mode'], rawModelId: string | undefined): ActiveMediaModel[] => {
    const modelId = canonicalizeMediaModelId(rawModelId);
    if (!modelId) return [];
    const listedName = models[mode].find(model => model.modelId === modelId)?.displayName;
    const selectedName = canonicalizeMediaModelId(selection.modelId) === modelId ? selection.modelName : undefined;
    return [{ mode, modelId, name: mediaModelDisplayName(modelId, listedName ?? selectedName) }];
  };
  return [
    ...entry('image', selection.imageModelId ?? (selection.mode === 'image' ? selection.modelId : undefined)),
    ...entry('video', selection.videoModelId ?? (selection.mode === 'video' ? selection.modelId : undefined)),
  ];
}
