import { store } from '../store';
import {
  clearDraftAttachments,
  clearDraftBrowserAnnotationBatches,
  clearDraftSelectedTextSnippets,
  setDraftCollaborationMode,
  setDraftKitIds,
  setDraftPrompt,
  setDraftSkillIds,
} from '../store/slices/coworkSlice';
import { clearActiveKits } from '../store/slices/kitSlice';
import { clearSelection } from '../store/slices/quickActionSlice';
import type { Agent } from '../types/agent';
import { CoworkCollaborationMode } from '../types/cowork';
import { agentService } from './agent';
import { coworkService } from './cowork';

const EXPERT_HOME_DRAFT_KEY = '__home__';

/** Prepare a fresh draft only. Creating a session remains an explicit user action. */
export function openExpertDraft(agent: Agent, prompt: string): void {
  coworkService.clearSession(); // Invalidate any outstanding session navigation.
  agentService.switchAgent(agent.id);
  store.dispatch(clearSelection());
  store.dispatch(clearActiveKits());
  store.dispatch(clearDraftAttachments(EXPERT_HOME_DRAFT_KEY));
  store.dispatch(clearDraftSelectedTextSnippets(EXPERT_HOME_DRAFT_KEY));
  store.dispatch(clearDraftBrowserAnnotationBatches(EXPERT_HOME_DRAFT_KEY));
  store.dispatch(setDraftKitIds({ draftKey: EXPERT_HOME_DRAFT_KEY, kitIds: [] }));
  store.dispatch(setDraftSkillIds({ draftKey: EXPERT_HOME_DRAFT_KEY, skillIds: agent.skillIds }));
  store.dispatch(setDraftCollaborationMode({ draftKey: EXPERT_HOME_DRAFT_KEY, mode: CoworkCollaborationMode.Default }));
  store.dispatch(setDraftPrompt({ sessionId: EXPERT_HOME_DRAFT_KEY, draft: prompt }));
}
