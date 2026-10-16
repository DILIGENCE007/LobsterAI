import { InformationCircleIcon } from '@heroicons/react/24/outline';
import React from 'react';
import { useSelector } from 'react-redux';

import type { CoworkModelChange } from '../../../shared/cowork/modelChange';
import type { ModelPresetId } from '../../../shared/modelPresets/constants';
import { i18nService } from '../../services/i18n';
import { modelPresetName } from '../../services/modelPresets';
import type { RootState } from '../../store';
import { matchesOpenClawModelRef } from '../../utils/openclawModelRef';
import Tooltip, { TooltipPosition } from '../ui/Tooltip';

const ModelChangeDivider: React.FC<{ change: CoworkModelChange }> = ({ change }) => {
  const models = useSelector((state: RootState) => state.model.availableModels);
  const displayName = (modelRef: string, presetId?: ModelPresetId | null): string => {
    if (presetId) return modelPresetName(presetId);
    const model = models.find(candidate => !candidate.presetId && matchesOpenClawModelRef(modelRef, candidate));
    return model?.name ?? (modelRef.includes('/') ? modelRef.slice(modelRef.indexOf('/') + 1) : modelRef);
  };
  const label = i18nService.t('coworkModelChanged')
    .replace('{previous}', displayName(change.previousModelRef, change.previousPresetId))
    .replace('{next}', displayName(change.nextModelRef, change.nextPresetId));
  const hint = i18nService.t('coworkModelSwitchHint');

  return (
    <div className="flex items-center gap-3 py-2 text-xs text-muted" role="status">
      <span className="h-px min-w-4 flex-1 bg-border-subtle" aria-hidden="true" />
      <div className="flex min-w-0 max-w-[80%] items-center gap-1.5">
        <span className="min-w-0 break-words text-center leading-5">{label}</span>
        <Tooltip content={hint} position={TooltipPosition.Top} multiline maxWidth="20rem">
          <button type="button" className="flex shrink-0 items-center rounded-full hover:text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" aria-label={hint}>
            <InformationCircleIcon className="h-4 w-4" aria-hidden="true" />
          </button>
        </Tooltip>
      </div>
      <span className="h-px min-w-4 flex-1 bg-border-subtle" aria-hidden="true" />
    </div>
  );
};

export default ModelChangeDivider;
