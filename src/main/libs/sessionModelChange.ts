import { CoworkSystemMessageKind } from '../../common/coworkSystemMessages';
import type { CoworkModelChange } from '../../shared/cowork/modelChange';
import { ProviderRegistry } from '../../shared/providers/constants';
import type { CoworkSession, CoworkStore } from '../coworkStore';
import { resolveRawApiConfig } from './claudeSettings';

function effectiveModelRef(store: CoworkStore, session: CoworkSession): string {
  const explicitModel = session.modelOverride.trim() || store.getAgent(session.agentId)?.model?.trim();
  if (explicitModel) return explicitModel;
  const { config, providerMetadata } = resolveRawApiConfig();
  if (!config?.model) return '';
  const providerId = ProviderRegistry.getOpenClawProviderId(providerMetadata?.providerName ?? '');
  return providerId ? `${providerId}/${config.model}` : config.model;
}

/** Persist a display-only notice after a successful, explicit session model change. */
export function recordSessionModelChange(
  store: CoworkStore,
  previous: CoworkSession | null,
  current: CoworkSession,
): CoworkSession {
  // The loaded tail may contain only assistant/tool messages from a long turn.
  if (!previous || !store.getLatestUserMessage(previous.id)) return current;
  const previousModelRef = effectiveModelRef(store, previous);
  const nextModelRef = effectiveModelRef(store, current);
  const sameModel = previousModelRef === nextModelRef
    || ((!previousModelRef.includes('/') || !nextModelRef.includes('/'))
      && previousModelRef.split('/').slice(-1)[0] === nextModelRef.split('/').slice(-1)[0]);
  if (sameModel && (previous.modelPresetId ?? null) === (current.modelPresetId ?? null)) return current;
  if (!previousModelRef || !nextModelRef) return current;

  const modelChange: CoworkModelChange = {
    previousModelRef,
    nextModelRef,
    previousPresetId: previous.modelPresetId,
    nextPresetId: current.modelPresetId,
  };
  store.addMessage(current.id, {
    type: 'system',
    content: '',
    metadata: { kind: CoworkSystemMessageKind.ModelChanged, modelChange },
  });
  return store.getSession(current.id) ?? current;
}
