import { useEffect, useRef, useState } from 'react';

import { CoworkSessionStatusValue } from '../../types/cowork';
import { type FollowUpResponse, submitCompanionFollowUp } from './companionFollowUp';

export const CompanionFollowUpPhase = {
  Steering: 'steering',
  Thinking: 'thinking',
} as const;

interface FollowUpActivity {
  prompt: string;
  phase: typeof CompanionFollowUpPhase[keyof typeof CompanionFollowUpPhase];
}

export function useCompanionFollowUp(sessionId: string, onRefresh: () => void) {
  const [activity, setActivity] = useState<FollowUpActivity | null>(null);
  const submitting = useRef(false);
  const cleanup = useRef(() => {});
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; cleanup.current(); };
  }, []);

  const submit = async (text: string): Promise<FollowUpResponse> => {
    const prompt = text.trim();
    if (!prompt || submitting.current) return { success: false };
    submitting.current = true;
    cleanup.current();
    setActivity({ prompt, phase: CompanionFollowUpPhase.Steering });
    let finished = false;
    const finish = () => {
      finished = true;
      cleanup.current();
      if (mounted.current) { setActivity(null); onRefresh(); }
    };
    try {
      const api = window.electron.cowork;
      const result = await submitCompanionFollowUp(api, sessionId, prompt, () => {
        if (!mounted.current) return;
        const finishSession = (data: { sessionId: string }) => {
          if (data.sessionId === sessionId) finish();
        };
        const stops = [
          api.onStreamComplete(finishSession),
          api.onStreamError(finishSession),
          api.onStreamSessionStatus(data => {
            if (data.status !== CoworkSessionStatusValue.Running) finishSession(data);
          }),
        ];
        cleanup.current = () => { stops.forEach(stop => stop()); cleanup.current = () => {}; };
      });
      if (!result.success) finish();
      else if (!finished && mounted.current) setActivity({ prompt, phase: CompanionFollowUpPhase.Thinking });
      return result;
    } catch (error) {
      finish();
      throw error;
    } finally {
      submitting.current = false;
    }
  };

  return { activity, submit };
}
