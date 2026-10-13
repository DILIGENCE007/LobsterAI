import React from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { i18nService } from '../../services/i18n';
import type { AppDispatch, RootState } from '../../store';
import type { MediaModel } from '../../types/mediaGeneration';
import {
  ACTIVE_CONTEXT_BADGE_BUTTON_CLASS,
  ACTIVE_CONTEXT_BADGE_ICON_CLASS,
  ACTIVE_CONTEXT_BADGE_ICON_WRAP_CLASS,
  ACTIVE_CONTEXT_BADGE_REMOVE_ICON_CLASS,
} from '../common/activeContextBadgeStyles';
import MagicIcon from '../icons/MagicIcon';
import XMarkIcon from '../icons/XMarkIcon';
import { activeMediaModels } from './activeMediaModels';
import { toggleMediaModelSelection } from './MediaModelPicker';

const EMPTY_MEDIA_MODELS: { image: MediaModel[]; video: MediaModel[] } = { image: [], video: [] };

/**
 * The image and video models picked from the add menu. A narrow prompt has no
 * media button in its toolbar, so these badges are where the choice shows.
 */
const ActiveMediaBadge: React.FC<{ draftKey: string }> = ({ draftKey }) => {
  const dispatch = useDispatch<AppDispatch>();
  const selection = useSelector((state: RootState) => state.cowork.mediaSelection[draftKey]);
  const ownerAccountKey = useSelector((state: RootState) => state.auth.ownerAccountKey);
  const accountGeneration = useSelector((state: RootState) => state.auth.accountGeneration);
  const cachedModels = useSelector((state: RootState) => state.cowork.mediaModels);
  const modelsOwnerAccountKey = useSelector((state: RootState) => state.cowork.mediaModelsOwnerAccountKey);
  const models = ownerAccountKey && ownerAccountKey === modelsOwnerAccountKey ? cachedModels : EMPTY_MEDIA_MODELS;
  const active = activeMediaModels(selection, models);

  if (!ownerAccountKey || active.length === 0) return null;

  return (
    <>
      {active.map(model => (
        <button
          type="button"
          key={model.mode}
          onClick={(event) => {
            event.stopPropagation();
            void toggleMediaModelSelection(
              dispatch,
              { draftKey, ownerAccountKey, accountGeneration },
              selection,
              model.mode,
              { modelId: model.modelId, displayName: model.name },
            );
          }}
          className={ACTIVE_CONTEXT_BADGE_BUTTON_CLASS}
          title={i18nService.t('clearMediaModel')}
        >
          <span className={ACTIVE_CONTEXT_BADGE_ICON_WRAP_CLASS}>
            <MagicIcon className={ACTIVE_CONTEXT_BADGE_ICON_CLASS} />
            <XMarkIcon className={ACTIVE_CONTEXT_BADGE_REMOVE_ICON_CLASS} />
          </span>
          <span className="min-w-0 truncate">
            {`${i18nService.t(model.mode === 'image' ? 'mediaImage' : 'mediaVideo')} · ${model.name}`}
          </span>
        </button>
      ))}
    </>
  );
};

export default ActiveMediaBadge;
