import {
  ArrowPathIcon,
  ArrowUpRightIcon,
  Bars3BottomLeftIcon,
  BookOpenIcon,
  ChatBubbleLeftEllipsisIcon,
  CheckIcon,
  Cog6ToothIcon,
  EllipsisHorizontalIcon,
  LanguageIcon,
  NoSymbolIcon,
  PencilSquareIcon,
  SpeakerWaveIcon,
  Square2StackIcon,
} from '@heroicons/react/24/outline';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  CompanionQuickAnswerEventType,
  type CompanionQuickAnswerTurn,
  type DesktopCompanionSelection,
  type DesktopCompanionSelectionCommand,
  DesktopCompanionSelectionCommandType,
  DesktopCompanionSelectionMode,
  type DesktopCompanionState,
} from '../../../shared/desktopCompanion/constants';
import { LanguageTool } from '../../../shared/desktopCompanion/languageTools';
import { CompanionSelectionAction } from '../../../shared/desktopCompanion/selectionActions';
import { i18nService } from '../../services/i18n';
import {
  SelectionAnswer,
  SelectionCardHeader,
  SelectionComposer,
  SelectionError,
  type SelectionIcon,
  SelectionThinking,
  SourceQuote,
  SwapLabel,
} from './SelectionCard';
import { useMeasuredSurface } from './useMeasuredSurface';
import { usePointerPassThrough } from './usePointerPassThrough';

const t = (key: string) => i18nService.t(key);

/** Each action keeps one icon, on its toolbar button and in its card's title. */
const ACTION_ICONS: Record<CompanionSelectionAction, SelectionIcon> = {
  [CompanionSelectionAction.Translate]: LanguageIcon,
  [CompanionSelectionAction.Explain]: BookOpenIcon,
  [CompanionSelectionAction.Summarize]: Bars3BottomLeftIcon,
  [CompanionSelectionAction.Polish]: PencilSquareIcon,
  [CompanionSelectionAction.Ask]: ChatBubbleLeftEllipsisIcon,
};

/** How long "Copied" stays on the toolbar before it goes away. */
const COPIED_TOOLBAR_MS = 650;

const actionLabel = (action: CompanionSelectionAction) => t(`desktopCompanionAction${action.charAt(0).toUpperCase()}${action.slice(1)}`);

interface Streaming {
  requestId: string;
  text: string;
}

interface MenuItem {
  key: string;
  icon: SelectionIcon;
  label: string;
  run: () => void;
  /** Settings-like entries sit below a divider in a quieter color. */
  secondary?: boolean;
}

export default function SelectionSurface({ state }: { state: DesktopCompanionState }) {
  const api = window.electron.desktopCompanion;
  const [selection, setSelection] = useState<DesktopCompanionSelection | null>(null);
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<CompanionQuickAnswerTurn[]>([]);
  const [streaming, setStreaming] = useState<Streaming | null>(null);
  const [error, setError] = useState('');
  const [input, setInput] = useState('');
  const [copied, setCopied] = useState(false);
  const streamRef = useRef<Streaming | null>(null);
  const selectionRef = useRef<DesktopCompanionSelection | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>();
  const answering = selection?.mode === DesktopCompanionSelectionMode.Answer;
  useMeasuredSurface(rootRef, !!selection, `${selection?.id ?? ''}:${selection?.mode ?? ''}`);

  const setStream = (value: Streaming | null) => { streamRef.current = value; setStreaming(value); };
  const command = useCallback((value: DesktopCompanionSelectionCommand) => { void api.selectionCommand(value); }, [api]);
  const setPassThrough = useCallback((passThrough: boolean) => {
    command({ type: DesktopCompanionSelectionCommandType.PassThrough, passThrough });
  }, [command]);
  usePointerPassThrough(selection?.id, setPassThrough);

  useEffect(() => api.onSelection(next => {
    const previous = selectionRef.current;
    selectionRef.current = next;
    setSelection(next);
    if (!next || next.id !== previous?.id || next.action !== previous?.action) {
      clearTimeout(copiedTimer.current);
      setStream(null);
      setTurns([]);
      setQuestion('');
      setError('');
      setInput('');
      setCopied(false);
    }
  }), [api]);

  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  useEffect(() => api.onQuickAnswer(event => {
    const current = streamRef.current;
    if (!current || event.requestId !== current.requestId) return;
    if (event.type === CompanionQuickAnswerEventType.Delta) {
      setStream({ ...current, text: current.text + event.text });
    } else if (event.type === CompanionQuickAnswerEventType.Done) {
      if (current.text.trim()) setTurns(previous => [...previous, { role: 'assistant', content: current.text }]);
      setStream(null);
    } else {
      setError(event.message);
      setStream(null);
    }
  }), [api]);

  // Keep the newest text in view while it streams.
  useEffect(() => {
    const body = bodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, [streaming?.text, turns.length]);

  const ask = useCallback((action: CompanionSelectionAction, history: CompanionQuickAnswerTurn[], firstQuestion?: string) => {
    const current = selectionRef.current;
    if (!current) return;
    const requestId = crypto.randomUUID();
    setStream({ requestId, text: '' });
    setError('');
    void api.startQuickAnswer({ requestId, action, text: current.text, question: firstQuestion, history }).then(result => {
      if (!result.success && streamRef.current?.requestId === requestId) {
        setError(result.error || t('desktopCompanionRequestFailed'));
        setStream(null);
      }
    }).catch(() => {
      if (streamRef.current?.requestId === requestId) { setError(t('desktopCompanionRequestFailed')); setStream(null); }
    });
  }, [api]);

  // Toolbar and menu actions enter the same answer flow; Ask waits for a question first.
  const autoAnswerAction = answering && selection.action !== CompanionSelectionAction.Ask
    && selection.action !== CompanionSelectionAction.Translate ? selection.action : null;
  useEffect(() => {
    if (autoAnswerAction) ask(autoAnswerAction, []);
  }, [ask, autoAnswerAction, selection?.id]);

  const run = (action: CompanionSelectionAction) => {
    if (action === CompanionSelectionAction.Translate) {
      void api.openLanguageTool({ tool: LanguageTool.Translate, text: selectionRef.current?.text });
      return;
    }
    command({ type: DesktopCompanionSelectionCommandType.Run, action });
    if (action === CompanionSelectionAction.Ask) {
      command({ type: DesktopCompanionSelectionCommandType.FocusInput });
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  };

  const submit = () => {
    const text = input.trim();
    const current = selectionRef.current;
    if (!text || !current?.action || streamRef.current) return;
    setInput('');
    if (current.action === CompanionSelectionAction.Ask && !question && turns.length === 0) {
      setQuestion(text);
      ask(CompanionSelectionAction.Ask, [], text);
      return;
    }
    const history: CompanionQuickAnswerTurn[] = [...turns, { role: 'user', content: text }];
    setTurns(history);
    ask(current.action, history, question || undefined);
  };

  const latestAnswer = streaming?.text || [...turns].reverse().find(turn => turn.role === 'assistant')?.content || '';

  const flashCopied = () => {
    clearTimeout(copiedTimer.current);
    setCopied(true);
    copiedTimer.current = setTimeout(() => setCopied(false), 1_400);
  };

  const copyAnswer = () => {
    if (!latestAnswer) return;
    void api.copyText(latestAnswer).then(flashCopied);
  };

  // The toolbar confirms the copy before it steps aside.
  const copySelection = () => {
    const current = selectionRef.current;
    if (!current) return;
    void api.copyText(current.text).then(() => {
      clearTimeout(copiedTimer.current);
      setCopied(true);
      copiedTimer.current = setTimeout(() => command({ type: DesktopCompanionSelectionCommandType.Dismiss }), COPIED_TOOLBAR_MS);
    });
  };

  const toTask = async () => {
    const current = selectionRef.current;
    if (!current) return;
    const prompt = t('desktopCompanionTaskFromSelection').replace('{text}', current.text).replace('{answer}', latestAnswer);
    await api.setDraft({ prompt, attachments: [], workingDirectory: state.draft.workingDirectory });
    await api.selectSession(null);
    await api.selectionCommand({ type: DesktopCompanionSelectionCommandType.Dismiss });
    if (!state.panelVisible) await api.togglePanel();
  };

  // Re-sends whatever went unanswered: the pending follow-up, or the first request.
  const retry = () => {
    const current = selectionRef.current;
    if (!current?.action) return;
    ask(current.action, turns[turns.length - 1]?.role === 'user' ? turns : [], question || undefined);
  };

  // Drops the newest answer and asks for it again with the same history.
  const regenerate = () => {
    const current = selectionRef.current;
    if (!current?.action || streamRef.current || turns[turns.length - 1]?.role !== 'assistant') return;
    const history = turns.slice(0, -1);
    setTurns(history);
    ask(current.action, history[history.length - 1]?.role === 'user' ? history : [], question || undefined);
  };

  useEffect(() => {
    if (!answering) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.isComposing) command({ type: DesktopCompanionSelectionCommandType.Dismiss });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [answering, command]);

  if (!selection) return null;

  if (!answering) {
    const actionItem = (value: CompanionSelectionAction): MenuItem => ({
      key: value, icon: ACTION_ICONS[value], label: actionLabel(value), run: () => run(value),
    });
    const tools: MenuItem[] = [
      actionItem(CompanionSelectionAction.Translate),
      { key: 'copy', icon: copied ? CheckIcon : Square2StackIcon, label: '', run: copySelection },
      {
        key: 'read',
        icon: SpeakerWaveIcon,
        label: t('desktopToolsReadAloud'),
        run: () => { void api.openLanguageTool({ tool: LanguageTool.Tts, text: selection.text }); },
      },
      actionItem(CompanionSelectionAction.Summarize),
    ];
    const menu: MenuItem[] = [
      actionItem(CompanionSelectionAction.Explain),
      actionItem(CompanionSelectionAction.Ask),
      { key: 'exclude', icon: NoSymbolIcon, label: t('desktopCompanionSelectionExclude'), run: () => command({ type: DesktopCompanionSelectionCommandType.ExcludeApp }), secondary: true },
      { key: 'settings', icon: Cog6ToothIcon, label: t('desktopCompanionSelectionSettings'), run: () => command({ type: DesktopCompanionSelectionCommandType.Settings }), secondary: true },
    ];
    const menuOpen = selection.menuOpen;
    return (
      <div className="sel-surface" data-menu={selection.menuUp ? 'up' : 'down'}>
        <div className="sel-stack">
          <div className="sel-toolbar" ref={rootRef} role="toolbar" aria-label={t('desktopCompanionSelection')}>
            {tools.map(({ key, icon: ToolIcon, label, run: onClick }) => (
              <button key={key} type="button" className="sel-tool" data-done={key === 'copy' && copied} onClick={onClick}>
                <ToolIcon />
                {key === 'copy'
                  ? <SwapLabel off={t('desktopCompanionSelectionCopy')} on={t('desktopCompanionSelectionCopied')} showOn={copied} />
                  : <span>{label}</span>}
              </button>
            ))}
            <span className="sel-sep" aria-hidden="true" />
            <button
              type="button"
              className="sel-tool sel-more"
              data-active={menuOpen}
              title={t('desktopCompanionSelectionMore')}
              aria-label={t('desktopCompanionSelectionMore')}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => command({ type: DesktopCompanionSelectionCommandType.More, open: !menuOpen })}
            >
              <EllipsisHorizontalIcon />
            </button>
          </div>
          {menuOpen && (
            <div className="sel-menu" role="menu">
              {menu.map(({ key, icon: ItemIcon, label, run: onClick, secondary }, index) => (
                <div key={key} className="sel-menu-group" data-divided={secondary && !menu[index - 1]?.secondary}>
                  <button type="button" role="menuitem" className="sel-menu-item" data-secondary={secondary} onClick={onClick}>
                    <ItemIcon /><span>{label}</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  const action = selection.action ?? CompanionSelectionAction.Explain;
  const awaitingQuestion = action === CompanionSelectionAction.Ask && !question && turns.length === 0 && !streaming;
  const showActions = !!latestAnswer && !streaming;

  return (
    <div className="sel-surface">
      <div className="sel-card" ref={rootRef} style={{ maxHeight: selection.cardMaxHeight }}>
        <SelectionCardHeader
          icon={ACTION_ICONS[action]}
          title={actionLabel(action)}
          pinned={selection.pinned}
          onPin={() => command({ type: DesktopCompanionSelectionCommandType.Pin, pinned: !selection.pinned })}
          onClose={() => command({ type: DesktopCompanionSelectionCommandType.Dismiss })}
        />
        <div className="sel-scroll" ref={bodyRef} aria-live="polite">
          <SourceQuote key={selection.id} text={selection.text} />
          {question && <p className="sel-question">{question}</p>}
          {turns.map((turn, index) => turn.role === 'user'
            ? <p key={index} className="sel-question">{turn.content}</p>
            : <SelectionAnswer key={index} text={turn.content} />)}
          {streaming && (streaming.text
            ? <SelectionAnswer text={streaming.text} streaming />
            : <SelectionThinking label={t('desktopCompanionAnswerThinking')} />)}
          {error && (
            <SelectionError
              message={error}
              action={<button type="button" onClick={retry}>{t('desktopCompanionAnswerRetry')}</button>}
            />
          )}
        </div>
        {showActions && (
          <div className="sel-actions">
            <button type="button" className="sel-icon" data-done={copied} onClick={copyAnswer}
              title={t(copied ? 'desktopCompanionSelectionCopied' : 'desktopCompanionSelectionCopy')}
              aria-label={t(copied ? 'desktopCompanionSelectionCopied' : 'desktopCompanionSelectionCopy')}>
              {copied ? <CheckIcon /> : <Square2StackIcon />}
            </button>
            {turns[turns.length - 1]?.role === 'assistant' && (
              <button type="button" className="sel-icon" onClick={regenerate}
                title={t('desktopCompanionAnswerRegenerate')} aria-label={t('desktopCompanionAnswerRegenerate')}>
                <ArrowPathIcon />
              </button>
            )}
            <button type="button" className="sel-action sel-action-end" onClick={() => { void toTask(); }}>
              {t('desktopCompanionAnswerToTask')}<ArrowUpRightIcon />
            </button>
          </div>
        )}
        <SelectionComposer
          inputRef={inputRef}
          value={input}
          placeholder={t(awaitingQuestion ? 'desktopCompanionAnswerAskPlaceholder' : 'desktopCompanionAnswerFollowUp')}
          onChange={setInput}
          onSubmit={submit}
          onStop={streaming ? () => { void api.abortQuickAnswer(streaming.requestId); setStream(null); } : undefined}
          onPointerDown={() => command({ type: DesktopCompanionSelectionCommandType.FocusInput })}
        />
      </div>
    </div>
  );
}
