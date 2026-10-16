import { CheckIcon } from '@heroicons/react/24/outline';
import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { i18nService } from '../services/i18n';
import { MainView } from '../types/navigation';
import SidebarKitsIcon from './icons/SidebarKitsIcon';
import SidebarMcpIcon from './icons/SidebarMcpIcon';
import SkillIcon from './icons/SkillIcon';

const menuItems = [
  { view: MainView.Kits, label: 'kits', Icon: SidebarKitsIcon },
  { view: MainView.Skills, label: 'skills', Icon: SkillIcon },
  { view: MainView.Connectors, label: 'connectors', Icon: SidebarMcpIcon },
] as const;
const MENU_EDGE_GAP = 8;

type CapabilityView = typeof menuItems[number]['view'];

interface SidebarCapabilitiesMenuProps {
  activeView: MainView;
  isCollapsed: boolean;
  onSelect: (view: CapabilityView) => void;
  className: string;
  activeClassName: string;
  iconClassName: string;
}

const SidebarCapabilitiesMenu: React.FC<SidebarCapabilitiesMenuProps> = ({
  activeView,
  isCollapsed,
  onSelect,
  className,
  activeClassName,
  iconClassName,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = useId();
  const selectedIndex = menuItems.findIndex(item => item.view === activeView);
  const isActive = selectedIndex !== -1;

  useEffect(() => {
    // Entering Kits from the sidebar should keep its newly opened menu visible.
    if (!isActive || isCollapsed) setIsOpen(false);
  }, [isActive, isCollapsed]);

  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current || !menuRef.current) return;
    const trigger = triggerRef.current.getBoundingClientRect();
    const menu = menuRef.current.getBoundingClientRect();
    setPosition({
      top: Math.max(MENU_EDGE_GAP, Math.min(
        trigger.top - MENU_EDGE_GAP,
        window.innerHeight - menu.height - MENU_EDGE_GAP,
      )),
      left: Math.max(MENU_EDGE_GAP, Math.min(
        trigger.right + MENU_EDGE_GAP,
        window.innerWidth - menu.width - MENU_EDGE_GAP,
      )),
    });
    itemRefs.current[Math.max(0, selectedIndex)]?.focus();
  }, [isOpen, selectedIndex]);

  useEffect(() => {
    if (!isOpen) return;
    const dismissOutside = (event: Event) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setIsOpen(false);
    };
    const dismissOnReflow = () => setIsOpen(false);
    document.addEventListener('pointerdown', dismissOutside);
    document.addEventListener('focusin', dismissOutside);
    window.addEventListener('resize', dismissOnReflow);
    window.addEventListener('scroll', dismissOnReflow, true);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside);
      document.removeEventListener('focusin', dismissOutside);
      window.removeEventListener('resize', dismissOnReflow);
      window.removeEventListener('scroll', dismissOnReflow, true);
    };
  }, [isOpen]);

  const closeAndFocusTrigger = () => {
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const openKitsMenu = () => {
    onSelect(MainView.Kits);
    setIsOpen(true);
    itemRefs.current[0]?.focus();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        aria-current={isActive ? 'page' : undefined}
        title={i18nService.t('skillsAndConnectors')}
        className={isActive || isOpen ? activeClassName : className}
        onClick={openKitsMenu}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'ArrowRight') {
            event.preventDefault();
            openKitsMenu();
          } else if (event.key === 'Escape') {
            setIsOpen(false);
          }
        }}
      >
        <SidebarKitsIcon className={iconClassName} />
        <span className="min-w-0 flex-1 truncate">{i18nService.t('skillsAndConnectors')}</span>
      </button>
      {isOpen && !isCollapsed && createPortal(
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={i18nService.t('skillsAndConnectors')}
          className="non-draggable fixed z-[9999] w-48 max-w-[calc(100vw-16px)] rounded-2xl border border-border bg-surface p-2 text-foreground shadow-popover"
          style={position}
          onKeyDown={(event) => {
            const index = itemRefs.current.findIndex(item => item === document.activeElement);
            let nextIndex: number;
            if (event.key === 'ArrowDown') nextIndex = (index + 1) % menuItems.length;
            else if (event.key === 'ArrowUp') nextIndex = (index - 1 + menuItems.length) % menuItems.length;
            else if (event.key === 'Home') nextIndex = 0;
            else if (event.key === 'End') nextIndex = menuItems.length - 1;
            else if (event.key === 'Escape' || event.key === 'ArrowLeft') {
              event.preventDefault();
              event.stopPropagation();
              closeAndFocusTrigger();
              return;
            } else if (event.key === 'Tab') {
              // Resume the sidebar's natural tab order across the portal.
              closeAndFocusTrigger();
              return;
            } else return;
            event.preventDefault();
            itemRefs.current[nextIndex]?.focus();
          }}
        >
          {menuItems.map(({ view, label, Icon }, index) => {
            const isSelected = activeView === view;
            return (
              <button
                key={view}
                ref={(element) => { itemRefs.current[index] = element; }}
                type="button"
                role="menuitemradio"
                aria-checked={isSelected}
                tabIndex={-1}
                onClick={() => {
                  closeAndFocusTrigger();
                  onSelect(view);
                }}
                className={`flex h-10 w-full items-center gap-2.5 rounded-xl px-2.5 text-left text-[length:var(--lobster-text-sidebarCompact)] transition-colors hover:bg-black/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50 dark:hover:bg-white/[0.06] ${
                  isSelected ? 'bg-black/[0.04] font-medium dark:bg-white/[0.06]' : ''
                }`}
              >
                <Icon className="h-5 w-5 shrink-0 text-foreground/80" />
                <span className="min-w-0 flex-1 truncate">{i18nService.t(label)}</span>
                {isSelected && <CheckIcon aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
};

export default SidebarCapabilitiesMenu;
