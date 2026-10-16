import { BrowserWindow, type Rectangle } from 'electron';
import path from 'path';

import { DesktopCompanionSurface } from '../../shared/desktopCompanion/constants';

export interface CompanionWindowEnvironment {
  preloadPath: string;
  rendererDirectory: string;
  devServerUrl?: string;
  title: string;
}

export interface CompanionWindowOptions {
  surface: DesktopCompanionSurface;
  bounds: Rectangle;
  focusable: boolean;
}

const PANEL_BLUR_DELAY_MS = 120;

/** Dismiss an inactive composer, preserving native file pickers and brief focus handoffs. */
export function dismissCompanionPanelOnBlur(win: BrowserWindow, dismiss: () => void): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let sheetOpen = false;
  const cancel = () => { clearTimeout(timer); timer = undefined; };
  win.on('blur', () => {
    cancel();
    // Native dialogs may begin just after blur. Allow them to establish their
    // sheet/disabled-owner state before deciding this was an outside click.
    timer = setTimeout(() => {
      timer = undefined;
      if (win.isDestroyed() || !win.isVisible() || win.isFocused() || sheetOpen || !win.isEnabled()) return;
      if (win.getChildWindows().some(child => !child.isDestroyed() && child.isVisible() && child.isModal())) return;
      dismiss();
    }, PANEL_BLUR_DELAY_MS);
  });
  win.on('sheet-begin', () => { sheetOpen = true; cancel(); });
  win.on('sheet-end', () => { sheetOpen = false; });
  win.on('focus', cancel);
  win.on('hide', cancel);
  win.on('closed', cancel);
}

/** Companion surfaces are transparent, frameless, always-on-top windows. */
export function createCompanionWindow(env: CompanionWindowEnvironment, options: CompanionWindowOptions): BrowserWindow {
  const isSelection = options.surface === DesktopCompanionSurface.Selection;
  const isScreenshot = options.surface === DesktopCompanionSurface.Screenshot;
  const win = new BrowserWindow({
    ...options.bounds,
    title: env.title,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    // Cards draw their own soft shadow inside a transparent margin.
    hasShadow: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    enableLargerThanScreen: isScreenshot,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: options.focusable,
    // Native panels can hide on app deactivation even when our result card is pinned.
    ...(process.platform === 'darwin' && options.surface !== DesktopCompanionSurface.Result ? { type: 'panel' as const } : {}),
    webPreferences: {
      preload: env.preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      navigateOnDragDrop: false,
      spellcheck: false,
      ...(options.surface === DesktopCompanionSurface.LanguageTools ? { autoplayPolicy: 'no-user-gesture-required' as const } : {}),
    },
  });
  win.setMenu(null);
  // The selection toolbar sits above menus of the app it is attached to.
  win.setAlwaysOnTop(true, isScreenshot ? 'screen-saver' : isSelection ? 'pop-up-menu' : 'floating');
  if (process.platform === 'darwin') {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: isSelection || isScreenshot, skipTransformProcessType: true });
  }
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  // The quick panel runs the home page's composer, which needs the main renderer's styles and store.
  // Screenshot selection must not wait for chat, Markdown, or language-tool modules to initialize.
  const page = isScreenshot ? 'companion-screenshot.html'
    : options.surface === DesktopCompanionSurface.Panel ? 'companion-composer.html' : 'desktop-companion.html';
  const loading = env.devServerUrl
    ? win.loadURL(new URL(`${page}?surface=${options.surface}`, env.devServerUrl).href)
    : win.loadFile(path.join(env.rendererDirectory, page), { query: { surface: options.surface } });
  void loading.catch(error => console.error(`[DesktopCompanion] ${options.surface} renderer failed to load`, error));
  return win;
}
