import { CoworkSteerRejectReason, type CoworkSteerRequest, type CoworkSteerResponse, CoworkSteerStatus } from '../../../shared/cowork/steer';
import { CoworkSessionStatusValue } from '../../types/cowork';

interface FollowUpResponse { success: boolean; error?: string }

interface FollowUpApi {
  getSession(sessionId: string): Promise<FollowUpResponse & { session?: { status: string } }>;
  continueSession(options: { sessionId: string; prompt: string }): Promise<FollowUpResponse>;
  submitSteer(options: CoworkSteerRequest): Promise<CoworkSteerResponse>;
}

/** Keep the task's context and model; active turns accept input through the existing steer API. */
export async function submitCompanionFollowUp(api: FollowUpApi, sessionId: string, text: string): Promise<FollowUpResponse> {
  const prompt = text.trim();
  if (!prompt) return { success: false };
  const current = await api.getSession(sessionId);
  if (!current.success || !current.session) return { success: false, error: current.error };
  if (current.session.status !== CoworkSessionStatusValue.Running) return api.continueSession({ sessionId, prompt });

  const result = await api.submitSteer({ sessionId, text: prompt, clientSteerId: crypto.randomUUID() });
  if (result.success && result.status === CoworkSteerStatus.Accepted) return { success: true };
  // The turn may have finished between reading its status and submitting the input.
  if (result.status === CoworkSteerStatus.Rejected && result.reason === CoworkSteerRejectReason.NoActiveTurn) {
    const latest = await api.getSession(sessionId);
    if (latest.success && latest.session && latest.session.status !== CoworkSessionStatusValue.Running) {
      return api.continueSession({ sessionId, prompt });
    }
  }
  return { success: false, error: result.error };
}
