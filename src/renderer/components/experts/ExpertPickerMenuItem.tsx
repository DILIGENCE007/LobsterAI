import { ArrowUpRightIcon, CheckIcon, ChevronRightIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { ExpertUiEvent } from '@shared/agent/presets';
import React, { useRef, useState } from 'react';
import { useSelector } from 'react-redux';

import { i18nService } from '../../services/i18n';
import type { RootState } from '../../store';
import { getAgentDisplayName } from '../../utils/agentDisplay';
import AgentAvatarIcon from '../agent/AgentAvatarIcon';
import ExpertIcon from '../icons/ExpertIcon';

interface ExpertPickerMenuItemProps {
  disabled?: boolean;
  onOpen: () => void;
  onSelect: (agentId: string) => void;
  onExplore: () => void;
}

/** Kept inside the add-menu DOM so its existing outside-click handling applies. */
const ExpertPickerMenuItem: React.FC<ExpertPickerMenuItemProps> = ({ disabled, onOpen, onSelect, onExplore }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const { agents, currentAgentId } = useSelector((state: RootState) => state.agent);
  const t = (key: string) => i18nService.t(key);
  const matching = agents.filter(agent => agent.enabled && `${getAgentDisplayName(agent)} ${agent.description}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const show = () => {
    if (disabled) return;
    onOpen();
    setOpen(true);
  };

  return (
    <div className="relative" onMouseLeave={() => setOpen(false)}>
      <button type="button" role="menuitem" aria-haspopup="menu" aria-expanded={open} disabled={disabled}
        onMouseEnter={show} onFocus={onOpen} onClick={() => { show(); searchRef.current?.focus(); }}
        onKeyDown={event => {
          if (event.key === 'ArrowRight') {
            event.preventDefault();
            show();
            requestAnimationFrame(() => searchRef.current?.focus());
          }
        }}
        className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-foreground disabled:opacity-50 ${open ? 'bg-surface-raised' : 'hover:bg-surface-raised'}`}>
        <ExpertIcon className="h-5 w-5 shrink-0 text-secondary" />
        <span className="flex-1">{t('expertSummonMenu')}</span><ChevronRightIcon className="h-4 w-4 text-secondary" />
      </button>
      {open && <div className="absolute left-full top-0 z-50 pl-2">
        <div role="menu" aria-label={t('expertInstalled')} className="flex max-h-[60vh] w-72 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-popover">
          <div className="shrink-0 border-b border-border p-3">
            <p className="mb-2 text-xs font-medium text-secondary">{t('expertInstalled')}</p>
            <div className="relative"><MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted" /><input ref={searchRef} value={query} onChange={event => setQuery(event.target.value)} aria-label={t('expertSearchInstalled')} placeholder={t('expertSearchInstalled')} className="h-9 w-full rounded-lg border border-border bg-background pl-8 pr-2 text-sm text-foreground outline-none focus:border-primary" /></div>
          </div>
          <div className="min-h-0 overflow-y-auto p-1.5">
            {matching.length === 0 ? <p className="px-3 py-6 text-center text-xs text-muted">{t('expertInstalledEmpty')}</p> : matching.map(agent => (
              <button key={agent.id} type="button" role="menuitemradio" aria-checked={agent.id === currentAgentId} onClick={() => onSelect(agent.id)}
                className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left text-sm text-foreground hover:bg-surface-raised focus:bg-surface-raised">
                <AgentAvatarIcon value={agent.icon} className="h-7 w-7 shrink-0" iconClassName="h-5 w-5" />
                <span className="min-w-0 flex-1 truncate">{getAgentDisplayName(agent)}</span>
                {agent.id === currentAgentId && <CheckIcon className="h-4 w-4 shrink-0 text-primary" />}
              </button>
            ))}
          </div>
          <div className="shrink-0 border-t border-border p-1.5"><button type="button" role="menuitem" onClick={() => { onExplore(); window.dispatchEvent(new Event(ExpertUiEvent.OpenPlaza)); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-primary hover:bg-primary/5"><ArrowUpRightIcon className="h-4 w-4" />{t('expertExploreMore')}</button></div>
        </div>
      </div>}
    </div>
  );
};

export default ExpertPickerMenuItem;
