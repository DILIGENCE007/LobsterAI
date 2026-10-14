import { useEffect, useRef, useState } from 'react';

import type { CompanionRecentTask } from '../../../shared/desktopCompanion/results';
import { i18nService } from '../../services/i18n';
import { submitCompanionFollowUp } from './companionFollowUp';
import { SelectionComposer, SelectionError } from './SelectionCard';

const t = (key: string) => i18nService.t(key);

interface FollowUpProps {
  task: CompanionRecentTask;
  onClose: () => void;
  onSubmitted: () => void;
}

export default function CompanionTaskFollowUp({ expanded, ...props }: FollowUpProps & { expanded: boolean }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Keep the composer mounted until the collapse finishes.
  const [retained, setRetained] = useState(expanded);
  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (expanded) {
      setRetained(true);
      // Focus even when reopening mid-collapse, without scrolling ahead of the animation.
      containerRef.current?.querySelector('input')?.focus({ preventScroll: !reduceMotion });
    } else if (reduceMotion) setRetained(false);
  }, [expanded]);

  return (
    <div className="result-follow-up" data-expanded={expanded}
      ref={element => {
        containerRef.current = element;
        if (element) element.inert = !expanded;
      }}
      onTransitionEnd={event => {
        if (event.target !== event.currentTarget || event.propertyName !== 'grid-template-rows') return;
        if (!expanded) setRetained(false);
        else event.currentTarget.querySelector('input')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }}>
      <div className="result-follow-up-reveal">
        {(expanded || retained) && <FollowUpComposer {...props} />}
      </div>
    </div>
  );
}

function FollowUpComposer({ task, onClose, onSubmitted }: FollowUpProps) {
  const [prompt, setPrompt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const submittingRef = useRef(false);

  const submit = async () => {
    if (!prompt.trim() || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError('');
    try {
      const result = await submitCompanionFollowUp(window.electron.cowork, task.id, prompt);
      if (result.success) onSubmitted();
      else setError(result.error || t('desktopCompanionRequestFailed'));
    } catch {
      setError(t('desktopCompanionRequestFailed'));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <div className="result-follow-up-content" data-empty={!prompt.trim()}
      onKeyDown={event => {
        if (event.key !== 'Escape' || event.nativeEvent.isComposing) return;
        event.preventDefault();
        event.stopPropagation();
        if (!submitting) onClose();
      }}>
      <SelectionComposer value={prompt} onChange={setPrompt} onSubmit={() => { void submit(); }}
        placeholder={t('desktopCompanionAnswerFollowUp')} disabled={submitting} />
      {error && <SelectionError message={error} />}
    </div>
  );
}
