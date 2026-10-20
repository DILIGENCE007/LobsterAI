import {
  ArrowDownTrayIcon, ArrowRightIcon, ArrowsPointingOutIcon,
  ArrowUturnLeftIcon, ArrowUturnRightIcon, BackspaceIcon, ChatBubbleBottomCenterTextIcon, CursorArrowRaysIcon, PencilIcon, ScissorsIcon,
  SparklesIcon, Square2StackIcon, Square3Stack3DIcon, StopIcon,
} from '@heroicons/react/24/outline';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { imagePoint, imageRectangle, validImageSize } from '../../../../shared/imageEditing/geometry';
import {
  IMAGE_EDIT_MAX_REGIONS, IMAGE_EDIT_RATIOS, ImageEditOperation, ImageEditorTool,
  type ImageMark, type ImagePoint, type ImageRegion, type ImageVersion,
} from '../../../../shared/imageEditing/types';
import { i18nService } from '../../../services/i18n';
import { imageEditTitle, setImageEditDraft, submitImageEdit } from '../../../services/imageEditing';
import { type RootState, store } from '../../../store';
import { setDraftAttachments } from '../../../store/slices/coworkSlice';
import { commitImageDrawing, consumeImageEditorFocus, EMPTY_IMAGE_DOCUMENT, redoImageDrawing, setImageRegions, undoImageDrawing } from '../../../store/slices/imageEditorSlice';
import type { Artifact } from '../../../types/artifact';
import ImageRenderer from '../renderers/ImageRenderer';
import { drawImageMark, exportImageDrawing, imageMarkHit, loadEditorImage } from './imageDrawing';

const t = (key: string) => i18nService.t(key);
const Mode = { View: 'view', Markup: 'markup', Comment: 'comment', Erase: 'erase', Resize: 'resize' } as const;
type Mode = typeof Mode[keyof typeof Mode];
const buttonClass = 'inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-35';
const inputClass = 'min-w-0 rounded-lg border border-light-border bg-light-surface px-2 py-1.5 text-xs text-primary focus:border-accent focus:outline-none dark:border-dark-border dark:bg-dark-surface';
function ToolButton({ label, icon: Icon, active, children, className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string; icon?: React.ElementType; active?: boolean;
}) {
  return <button type="button" title={label} aria-label={label} aria-pressed={active} {...props}
    className={`${buttonClass} ${active ? 'bg-accent/10 text-accent' : 'text-secondary hover:bg-black/5 dark:hover:bg-white/10'} ${className}`}>
    {Icon && <Icon className="h-4 w-4 shrink-0" />}{children}
  </button>;
}

export default function ImageEditor({ artifact }: { artifact: Artifact }) {
  const dispatch = useDispatch();
  const bridge = window.electron?.artifact?.imageEditing;
  const [loaded, setLoaded] = useState<{ version: ImageVersion; dataUrl: string; image: HTMLImageElement }>();
  const loadedRef = useRef(loaded); loadedRef.current = loaded;
  const loadGeneration = useRef(0);
  const invalidateLoads = useCallback(() => { loadGeneration.current++; }, []);
  const [versions, setVersions] = useState<ImageVersion[]>([]);
  const [mode, setMode] = useState<Mode>(Mode.View);
  const [tool, setTool] = useState<ImageEditorTool>(ImageEditorTool.Pen);
  const [color, setColor] = useState('#f05252');
  const [brush, setBrush] = useState(4);
  const [maskBrush, setMaskBrush] = useState(30);
  const [brushPoint, setBrushPoint] = useState<ImagePoint>();
  const [activeMark, setActiveMark] = useState<ImageMark>();
  const activeMarkRef = useRef<ImageMark>();
  const [selection, setSelection] = useState<ImageRegion>();
  const [regionText, setRegionText] = useState('');
  const [textPoint, setTextPoint] = useState<ImagePoint>();
  const [textValue, setTextValue] = useState('');
  const [instruction, setInstruction] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [initialFailed, setInitialFailed] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [viewportSize, setViewportSize] = useState({ width: 500, height: 500 });
  const [space, setSpace] = useState(false);
  const [compare, setCompare] = useState(false);
  const [original, setOriginal] = useState<HTMLImageElement>();
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [locked, setLocked] = useState(true);
  const [ratio, setRatio] = useState<string>('16:9');
  const root = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const regionInput = useRef<HTMLTextAreaElement>(null);
  const drag = useRef<{ start: ImagePoint; pan?: { x: number; y: number; left: number; top: number } }>();
  const pending = useRef(new Set<string>());
  const key = loaded ? `${artifact.sessionId}:${loaded.version.id}` : '';
  const drawing = useSelector((state: RootState) => state.imageEditor.documents[key] ?? EMPTY_IMAGE_DOCUMENT);
  const focusRequest = useSelector((state: RootState) => state.imageEditor.focus);
  const drawingRef = useRef(drawing); drawingRef.current = drawing;

  const loadVersion = useCallback(async (version: ImageVersion) => {
    const generation = ++loadGeneration.current;
    const result = await bridge.read({ sessionId: artifact.sessionId, versionId: version.id });
    if (generation !== loadGeneration.current) return;
    if (!result.success) throw new Error(result.error);
    const image = await loadEditorImage(result.data.dataUrl);
    if (generation !== loadGeneration.current) return;
    setLoaded({ ...result.data, image }); setWidth(String(version.width)); setHeight(String(version.height));
    setZoom(1); setSelection(undefined); setTextPoint(undefined); setCompare(false); setNotice('');
  }, [artifact.sessionId, bridge]);

  useEffect(() => {
    if (!bridge) { setInitialFailed(true); return; }
    let alive = true;
    const generation = ++loadGeneration.current;
    setInitialFailed(false); setLoaded(undefined); setOriginal(undefined); setVersions([]);
    setMode(Mode.View); setSelection(undefined); setCompare(false); setError(''); setNotice('');
    pending.current.clear();
    const focus = store.getState().imageEditor.focus;
    const restoreVersion = focus?.source.sessionId === artifact.sessionId && (artifact.id === `image-edit-version-${focus.source.id}`
      || artifact.filePath === focus.source.originalPath || artifact.filePath === focus.source.filePath);
    const opening = restoreVersion ? bridge.read({ sessionId: artifact.sessionId, versionId: focus.source.id })
      : bridge.open({ sessionId: artifact.sessionId, title: artifact.title, filePath: artifact.filePath,
        dataUrl: artifact.filePath ? undefined : artifact.content });
    void opening.then(async result => {
      if (!result.success) throw new Error(result.error);
      const image = await loadEditorImage(result.data.dataUrl);
      const list = await bridge.list({ sessionId: artifact.sessionId, rootId: result.data.version.rootId });
      if (!alive || generation !== loadGeneration.current) return;
      setLoaded({ ...result.data, image }); setVersions(list.success ? list.data : [result.data.version]);
      setWidth(String(result.data.version.width)); setHeight(String(result.data.version.height));
    }).catch(error => { if (alive) { setError(error.message); setInitialFailed(true); } });
    return () => { alive = false; invalidateLoads(); };
  }, [artifact.id, artifact.content, artifact.filePath, artifact.sessionId, artifact.title, bridge, invalidateLoads]);

  useEffect(() => {
    if (!bridge) return;
    return bridge.onChanged(version => {
      const current = loadedRef.current;
      if (version.sessionId !== artifact.sessionId || version.rootId !== current?.version.rootId) return;
      setVersions(values => values.some(v => v.id === version.id) ? values : [...values, version]);
      if (version.requestId && pending.current.has(version.requestId)) {
        pending.current.delete(version.requestId); setNotice(t('imageEditSaved'));
        if (current.version.id === version.parentId) void loadVersion(version).catch(error => setError(error.message));
      }
    });
  }, [artifact.sessionId, bridge, loadVersion]);

  useEffect(() => {
    if (!focusRequest || focusRequest.source.sessionId !== artifact.sessionId || focusRequest.source.rootId !== loaded?.version.rootId) return;
    dispatch(consumeImageEditorFocus(focusRequest.id));
    setMode(Mode.Comment);
    void loadVersion(focusRequest.source).then(() => {
      const region = store.getState().imageEditor.documents[`${artifact.sessionId}:${focusRequest.source.id}`]?.regions.find(r => r.id === focusRequest.regionId);
      if (region) { setSelection(region); setRegionText(region.text); }
    }).catch(error => setError(error.message));
  }, [artifact.sessionId, dispatch, focusRequest, loaded?.version.rootId, loadVersion]);

  useEffect(() => {
    const element = viewport.current; if (!element) return;
    const observer = new ResizeObserver(() => setViewportSize({ width: element.clientWidth, height: element.clientHeight }));
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      setBrushPoint(undefined);
      setZoom(value => Math.min(8, Math.max(0.25, value * Math.exp(-event.deltaY * 0.002))));
    };
    observer.observe(element); element.addEventListener('wheel', wheel, { passive: false });
    return () => { observer.disconnect(); element.removeEventListener('wheel', wheel); };
  }, [loaded?.version.id]);

  useEffect(() => {
    const context = canvas.current?.getContext('2d'); if (!context || !loaded) return;
    context.clearRect(0, 0, loaded.version.width, loaded.version.height);
    if (compare && original) {
      const scale = Math.min(loaded.version.width / original.naturalWidth, loaded.version.height / original.naturalHeight);
      const w = original.naturalWidth * scale, h = original.naturalHeight * scale;
      context.drawImage(original, (loaded.version.width - w) / 2, (loaded.version.height - h) / 2, w, h);
      return;
    }
    context.drawImage(loaded.image, 0, 0, loaded.version.width, loaded.version.height);
    if (mode === Mode.Markup) drawing.marks.forEach(mark => drawImageMark(context, mark, loaded.version.width, loaded.version.height));
    if (mode === Mode.Erase) {
      context.save(); context.globalAlpha = 0.55;
      drawing.mask.forEach(mark => drawImageMark(context, { ...mark, color: '#f43f5e' }, loaded.version.width, loaded.version.height));
      context.restore();
    }
    if (activeMark) {
      context.save(); if (mode === Mode.Erase) context.globalAlpha = 0.55;
      drawImageMark(context, mode === Mode.Erase ? { ...activeMark, color: '#f43f5e' } : activeMark, loaded.version.width, loaded.version.height); context.restore();
    }
  }, [loaded, compare, original, drawing.marks, drawing.mask, activeMark, mode]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (!root.current?.contains(document.activeElement) || /INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement).tagName)) return;
      if (event.code === 'Space') { event.preventDefault(); setSpace(true); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault(); dispatch(event.shiftKey ? redoImageDrawing(key) : undoImageDrawing(key));
      }
      if (event.key === 'Escape') { setSelection(undefined); setTextPoint(undefined); setMode(Mode.View); }
    };
    const up = () => setSpace(false);
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', up); };
  }, [dispatch, key]);

  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (error) { setError(error instanceof Error ? error.message : t('imageEditFailed')); }
    finally { setBusy(false); }
  };
  const commit = (marks = drawingRef.current.marks, mask = drawingRef.current.mask) => dispatch(commitImageDrawing({ key, drawing: { marks, mask } }));
  const syncRegions = async (regions: ImageRegion[]) => {
    if (!loaded) return;
    if (regions.length) {
      const result = await bridge.stage({ sessionId: artifact.sessionId, sourceId: loaded.version.id, operation: ImageEditOperation.Comment, regions });
      if (!result.success) throw new Error(result.error);
      setImageEditDraft(result.data);
    } else {
      const attachments = store.getState().cowork.draftAttachments[artifact.sessionId] ?? [];
      dispatch(setDraftAttachments({ draftKey: artifact.sessionId, attachments: attachments.filter(a => a.imageEdit?.source.id !== loaded.version.id) }));
    }
    dispatch(setImageRegions({ key, regions })); setSelection(undefined); setRegionText('');
  };
  const generate = (operation: ImageEditOperation) => run(async () => {
    if (!loaded) return;
    const guideDataUrl = operation === ImageEditOperation.Markup ? exportImageDrawing(loaded.image, drawing.marks)
      : operation === ImageEditOperation.Erase ? exportImageDrawing(loaded.image, drawing.mask, loaded.version.width, loaded.version.height, true) : undefined;
    const result = await bridge.stage({ sessionId: artifact.sessionId, sourceId: loaded.version.id, operation, guideDataUrl,
      instruction, aspectRatio: operation === ImageEditOperation.Reframe ? ratio : undefined });
    if (!result.success) throw new Error(result.error);
    pending.current.add(result.data.id);
    try { await submitImageEdit(result.data); } catch (error) { pending.current.delete(result.data.id); throw error; }
    setNotice(t('imageEditPending'));
  });
  const save = (operation: ImageEditOperation) => run(async () => {
    if (!loaded) return;
    const w = operation === ImageEditOperation.Resize ? Number(width) : loaded.version.width;
    const h = operation === ImageEditOperation.Resize ? Number(height) : loaded.version.height;
    if (!validImageSize(w, h)) throw new Error(t('imageEditInvalidSize'));
    const dataUrl = exportImageDrawing(loaded.image, operation === ImageEditOperation.Markup ? drawing.marks : [], w, h);
    const result = await bridge.save({ sessionId: artifact.sessionId, sourceId: loaded.version.id, operation, dataUrl });
    if (!result.success) throw new Error(result.error);
    await loadVersion(result.data); setNotice(t('imageEditSaved')); setMode(Mode.View);
  });
  const previewBrush = (event: React.PointerEvent) => {
    if (mode !== Mode.Erase || !stage.current || busy || compare || space) { setBrushPoint(undefined); return; }
    const rect = stage.current.getBoundingClientRect();
    setBrushPoint(event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom
      ? imagePoint(event.clientX, event.clientY, rect) : undefined);
  };
  const pointerDown = (event: React.PointerEvent) => {
    previewBrush(event);
    if (!loaded || event.button !== 0 || busy || compare || !stage.current || !viewport.current) return;
    stage.current.focus(); stage.current.setPointerCapture(event.pointerId);
    const point = imagePoint(event.clientX, event.clientY, stage.current.getBoundingClientRect());
    drag.current = { start: point };
    if (space || mode === Mode.View || mode === Mode.Resize) {
      drag.current.pan = { x: event.clientX, y: event.clientY, left: viewport.current.scrollLeft, top: viewport.current.scrollTop }; return;
    }
    if (mode === Mode.Comment) {
      setSelection({ id: crypto.randomUUID(), ...imageRectangle(point, point), text: '' }); setRegionText(''); return;
    }
    if (mode === Mode.Markup && tool === ImageEditorTool.Text) { setTextPoint(point); setTextValue(''); return; }
    if (mode === Mode.Markup && tool === ImageEditorTool.Eraser) {
      const marks = drawingRef.current.marks.filter(mark => !imageMarkHit(mark, point, loaded.version.width, loaded.version.height));
      if (marks.length !== drawingRef.current.marks.length) commit(marks); return;
    }
    const mark: ImageMark = { id: crypto.randomUUID(), tool: mode === Mode.Erase ? ImageEditorTool.Pen : tool as ImageMark['tool'],
      points: [point], color, width: (mode === Mode.Erase ? maskBrush : brush) / 1000 };
    activeMarkRef.current = mark; setActiveMark(mark);
  };
  const pointerMove = (event: React.PointerEvent) => {
    previewBrush(event);
    if (!drag.current || !loaded || !stage.current) return;
    if (drag.current.pan && viewport.current) {
      viewport.current.scrollLeft = drag.current.pan.left - event.clientX + drag.current.pan.x;
      viewport.current.scrollTop = drag.current.pan.top - event.clientY + drag.current.pan.y; return;
    }
    const point = imagePoint(event.clientX, event.clientY, stage.current.getBoundingClientRect());
    if (mode === Mode.Comment) { setSelection(current => current && ({ ...current, ...imageRectangle(drag.current!.start, point) })); return; }
    if (activeMarkRef.current) {
      const current = activeMarkRef.current;
      const points = current.tool === ImageEditorTool.Pen ? [...current.points, point].slice(-10000) : [current.points[0], point];
      activeMarkRef.current = { ...current, points }; setActiveMark(activeMarkRef.current);
    }
  };
  const pointerUp = (event: React.PointerEvent) => {
    if (activeMarkRef.current && event.type !== 'pointercancel') {
      if (mode === Mode.Erase) commit(undefined, [...drawingRef.current.mask, activeMarkRef.current]);
      else commit([...drawingRef.current.marks, activeMarkRef.current]);
    }
    activeMarkRef.current = undefined; setActiveMark(undefined); drag.current = undefined;
    if (stage.current?.hasPointerCapture(event.pointerId)) stage.current.releasePointerCapture(event.pointerId);
    if (mode === Mode.Comment && event.type !== 'pointercancel') regionInput.current?.focus();
  };
  if (initialFailed) return <div className="flex h-full flex-col"><p className="px-4 py-2 text-xs text-muted">{error || t('imageEditUnsupported')}</p><div className="min-h-0 flex-1"><ImageRenderer artifact={artifact} /></div></div>;
  if (!loaded) return <div className="flex h-full items-center justify-center text-sm text-muted">{t('imageEditLoading')}</div>;
  const size = loaded.version;
  const fit = Math.min((viewportSize.width - 32) / size.width, (viewportSize.height - 32) / size.height, 1);
  const displayWidth = Math.max(1, size.width * Math.max(0.01, fit) * zoom);
  const displayHeight = Math.max(1, size.height * Math.max(0.01, fit) * zoom);
  const eraseCursor = mode === Mode.Erase && !space && !compare && !busy;
  const brushDiameter = maskBrush / 1000 * Math.max(displayWidth, displayHeight);
  const visibleRegions = drawing.regions.map(region => selection && region.id === selection.id ? selection : region);
  if (selection && !drawing.regions.some(region => region.id === selection.id)) visibleRegions.push(selection);
  const tools = [
    [Mode.Markup, PencilIcon, 'imageEditMarkup'], [Mode.Comment, ChatBubbleBottomCenterTextIcon, 'imageEditComment'],
    [Mode.Erase, BackspaceIcon, 'imageEditErase'], [Mode.Resize, ArrowsPointingOutIcon, 'imageEditResize'],
  ] as const;
  return <div ref={root} className="flex h-full min-h-0 flex-col text-primary" aria-label={t('imageEditTitle')}>
    <div className="flex items-center gap-2 border-b border-light-border px-3 py-2 dark:border-dark-border">
      <Square3Stack3DIcon className="h-4 w-4 text-muted" />
      <select aria-label={t('imageEditVersion')} className={`${inputClass} flex-1 border-0 bg-transparent`} value={size.id}
        onChange={event => { const version = versions.find(v => v.id === event.target.value); if (version) void run(() => loadVersion(version)); }}>
        {versions.map((version, i) => <option key={version.id} value={version.id}>{i === 0 ? t('imageEditOriginal') : `v${i + 1} · ${imageEditTitle(version.operation)}`} · {version.width} × {version.height}</option>)}
      </select>
      <ToolButton label={t('imageEditCompare')} icon={Square2StackIcon} active={compare} disabled={size.id === size.rootId || busy}
        onClick={() => void run(async () => {
          if (!original) { const result = await bridge.read({ sessionId: artifact.sessionId, versionId: size.rootId }); if (!result.success) throw new Error(result.error); setOriginal(await loadEditorImage(result.data.dataUrl)); }
          setCompare(!compare);
        })} />
      <ToolButton label={t('imageEditExport')} icon={ArrowDownTrayIcon} onClick={() => {
        const link = document.createElement('a'); link.href = loaded.dataUrl; link.download = size.title; link.click();
      }} />
    </div>
    <div className="flex flex-wrap items-center justify-center gap-0.5 border-b border-light-border px-2 py-2 dark:border-dark-border">
      {tools.slice(0, 2).map(([value, icon, label]) => <ToolButton key={value} label={t(label)} icon={icon} active={mode === value}
        disabled={busy} onClick={() => { setMode(mode === value ? Mode.View : value); setCompare(false); }}>{t(label)}</ToolButton>)}
      <ToolButton label={t('imageEditRemoveBackground')} icon={ScissorsIcon} disabled={busy} onClick={() => void generate(ImageEditOperation.RemoveBackground)}>{t('imageEditRemoveBackground')}</ToolButton>
      {tools.slice(2).map(([value, icon, label]) => <ToolButton key={value} label={t(label)} icon={icon} active={mode === value}
        disabled={busy} onClick={() => { setMode(mode === value ? Mode.View : value); setCompare(false); }}>{t(label)}</ToolButton>)}
    </div>
    {(mode === Mode.Markup || mode === Mode.Erase) && <div className="flex flex-wrap items-center gap-1 border-b border-light-border px-2 py-2 dark:border-dark-border">
      {mode === Mode.Markup && <>
        {[[ImageEditorTool.Pen, PencilIcon, 'imageEditPen'], [ImageEditorTool.Arrow, ArrowRightIcon, 'imageEditArrow'],
          [ImageEditorTool.Rectangle, StopIcon, 'imageEditRectangle'], [ImageEditorTool.Text, ChatBubbleBottomCenterTextIcon, 'imageEditText'],
          [ImageEditorTool.Eraser, BackspaceIcon, 'imageEditEraser']].map(([value, icon, label]) => <ToolButton key={String(value)} label={t(String(label))} icon={icon as React.ElementType}
            active={tool === value} onClick={() => setTool(value as ImageEditorTool)} />)}
        <input type="color" value={color} aria-label={t('imageEditColor')} onChange={event => setColor(event.target.value)} className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent" />
      </>}
      {mode === Mode.Erase && <span className="mr-1 flex items-center gap-1.5 text-xs text-secondary">
        <span className="flex h-6 w-6 items-center justify-center" aria-hidden="true">
          <span className="rounded-full border border-rose-400 bg-rose-400/20" style={{ width: 4 + maskBrush / 10, height: 4 + maskBrush / 10 }} />
        </span>{t('imageEditEraseBrush')}
      </span>}
      <input type="range" min={mode === Mode.Erase ? 8 : 1} max={mode === Mode.Erase ? 150 : 16}
        aria-label={t('imageEditBrushSize')} value={mode === Mode.Erase ? maskBrush : brush} className="min-w-12 max-w-24 flex-1 accent-accent"
        onChange={event => (mode === Mode.Erase ? setMaskBrush : setBrush)(Number(event.target.value))} />
      {mode === Mode.Erase && <output className="ml-1 text-[11px] tabular-nums text-muted">
        {t('imageEditBrushDiameter').replace('{size}', String(Math.round(maskBrush / 1000 * Math.max(size.width, size.height))))}
      </output>}
      <span className="flex-1" />
      <ToolButton label={t('imageEditUndo')} icon={ArrowUturnLeftIcon} disabled={!drawing.past.length} onClick={() => dispatch(undoImageDrawing(key))} />
      <ToolButton label={t('imageEditRedo')} icon={ArrowUturnRightIcon} disabled={!drawing.future.length} onClick={() => dispatch(redoImageDrawing(key))} />
    </div>}
    <div ref={viewport} onScroll={() => setBrushPoint(undefined)} className="relative min-h-32 flex-1 overflow-auto bg-black/[0.025] dark:bg-white/[0.025]">
      <div className="flex min-h-full min-w-full p-4" style={{ width: Math.max(viewportSize.width, displayWidth + 32), height: Math.max(viewportSize.height, displayHeight + 32) }}>
        <div ref={stage} tabIndex={0} role="img" aria-label={size.title} onPointerDown={pointerDown} onPointerMove={pointerMove}
          onPointerUp={pointerUp} onPointerCancel={pointerUp}
          onPointerEnter={previewBrush} onPointerLeave={() => setBrushPoint(undefined)}
          className="relative m-auto shrink-0 touch-none select-none shadow-md outline-none focus-visible:ring-2 focus-visible:ring-accent"
          style={{ width: displayWidth, height: displayHeight, cursor: space || mode === Mode.View ? 'grab' : eraseCursor ? 'none' : 'crosshair',
            backgroundColor: '#fff', backgroundImage: 'conic-gradient(#e5e7eb 25%, transparent 0 50%, #e5e7eb 0 75%, transparent 0)', backgroundSize: '16px 16px' }}>
          <canvas ref={canvas} width={size.width} height={size.height} className="h-full w-full" />
          {eraseCursor && brushPoint && <div data-image-erase-cursor aria-hidden="true"
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-rose-400/20"
            style={{ left: `${brushPoint.x * 100}%`, top: `${brushPoint.y * 100}%`, width: brushDiameter, height: brushDiameter, boxShadow: '0 0 0 1px rgba(0,0,0,.65)' }} />}
          {mode === Mode.Comment && !compare && <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
            {visibleRegions.map((region, i) => <g key={region.id}>
              <rect x={region.x} y={region.y} width={region.width} height={region.height} fill="rgba(59,130,246,.12)" stroke="#3b82f6" strokeWidth={2 / displayWidth} strokeDasharray={`${5 / displayWidth} ${3 / displayWidth}`} />
              <svg x={region.x} y={region.y} width={22 / displayWidth} height={22 / displayHeight} viewBox="0 0 22 22">
                <rect width="22" height="22" rx="6" fill="#2563eb" /><text x="11" y="15" textAnchor="middle" fontSize="12" fill="white">{i + 1}</text>
              </svg>
            </g>)}
          </svg>}
        </div>
      </div>
    </div>
    <div className={`flex items-center gap-2 border-t border-light-border px-3 dark:border-dark-border ${mode === Mode.Erase ? 'bg-accent/5 py-3 text-sm font-medium text-secondary' : 'py-1.5 text-[11px] text-muted'}`}>
      <CursorArrowRaysIcon className="h-4 w-4 shrink-0" /><span className={`flex-1 ${mode === Mode.Erase ? '' : 'truncate'}`}>{t(mode === Mode.View ? 'imageEditViewHint' : mode === Mode.Comment ? 'imageEditCommentHint' : mode === Mode.Erase ? 'imageEditEraseHint' : mode === Mode.Resize ? 'imageEditResizeHint' : 'imageEditMarkupHint')}</span>
      <button type="button" title={t('imageEditResetZoom')} onClick={() => { setZoom(1); setBrushPoint(undefined); }} className="shrink-0 rounded px-1.5 py-1 text-[11px] font-normal text-muted hover:bg-black/5 dark:hover:bg-white/10">{Math.round(Math.max(0.01, fit) * zoom * 100)}%</button>
    </div>
    <div className="max-h-[45%] shrink-0 overflow-y-auto">
      {mode === Mode.Comment && <div className="space-y-2 border-t border-light-border p-3 dark:border-dark-border">
        <textarea ref={regionInput} disabled={!selection} value={regionText} maxLength={4000} onChange={event => setRegionText(event.target.value)} placeholder={t('imageEditCommentPlaceholder')}
          className={`${inputClass} min-h-16 w-full resize-y`} />
        <div className="flex justify-end gap-2"><ToolButton label={t('imageEditCancel')} onClick={() => setSelection(undefined)}>{t('imageEditCancel')}</ToolButton>
          <button type="button" disabled={busy || !regionText.trim() || !selection?.width || !selection?.height || (drawing.regions.length >= IMAGE_EDIT_MAX_REGIONS && !drawing.regions.some(region => region.id === selection?.id))}
            className={`${buttonClass} bg-accent text-white`} onClick={() => selection && void run(() => {
              const updated = { ...selection, text: regionText.trim() };
              return syncRegions(drawing.regions.some(region => region.id === selection.id)
                ? drawing.regions.map(region => region.id === selection.id ? updated : region)
                : [...drawing.regions, updated]);
            })}>{t('imageEditAddComment')}</button></div>
      </div>}
      {mode === Mode.Comment && drawing.regions.length > 0 && <div className="space-y-1 px-3 pb-3">
        {drawing.regions.map((region, index) => <div key={region.id} className="flex items-center gap-2 rounded-lg bg-accent/5 px-2 py-1.5 text-xs">
          <span className="text-accent">{index + 1}</span><button type="button" className="flex-1 truncate text-left" onClick={() => { setSelection(region); setRegionText(region.text); }}>{region.text}</button>
          <ToolButton label={t('imageEditDelete')} icon={BackspaceIcon} disabled={busy} onClick={() => void run(() => syncRegions(drawing.regions.filter(r => r.id !== region.id)))} />
        </div>)}
      </div>}
      {textPoint && mode === Mode.Markup && <div className="flex gap-2 px-3 pb-3"><input autoFocus value={textValue} maxLength={1000} onChange={event => setTextValue(event.target.value)}
        placeholder={t('imageEditTextPlaceholder')} className={`${inputClass} flex-1`} onKeyDown={event => { if (event.key === 'Escape') setTextPoint(undefined); }} />
        <button type="button" className={`${buttonClass} bg-accent text-white`} disabled={!textValue.trim()} onClick={() => {
          commit([...drawing.marks, { id: crypto.randomUUID(), tool: ImageEditorTool.Text, points: [textPoint], color, width: brush / 1000, text: textValue }]); setTextPoint(undefined);
        }}>{t('imageEditText')}</button></div>}
      {(mode === Mode.Markup || mode === Mode.Erase) && <div className="flex flex-wrap items-center gap-2 border-t border-light-border p-3 dark:border-dark-border">
        {mode === Mode.Markup && <input className={`${inputClass} basis-full`} placeholder={t('imageEditInstruction')} value={instruction} maxLength={4000} onChange={event => setInstruction(event.target.value)} />}
        {mode === Mode.Markup && <button type="button" className={`${buttonClass} border border-light-border dark:border-dark-border`} disabled={busy || !drawing.marks.length} onClick={() => void save(ImageEditOperation.Markup)}>{t('imageEditSave')}</button>}
        <button type="button" className={`${buttonClass} ml-auto bg-accent text-white`} disabled={busy || !(mode === Mode.Erase ? drawing.mask.length : drawing.marks.length)}
          onClick={() => void generate(mode === Mode.Erase ? ImageEditOperation.Erase : ImageEditOperation.Markup)}><SparklesIcon className="h-4 w-4" />{t(mode === Mode.Erase ? 'imageEditGenerate' : 'imageEditToAI')}</button>
      </div>}
      {mode === Mode.Resize && <div className="space-y-3 border-t border-light-border p-3 text-xs dark:border-dark-border">
        <div className="font-medium">{t('imageEditPixels')}</div><div className="flex flex-wrap items-end gap-2">
          <label className="min-w-16 flex-1">{t('imageEditWidth')}<input className={`${inputClass} mt-1 w-full`} type="number" min="2" max="16384" value={width} onChange={event => { setWidth(event.target.value); if (locked) setHeight(String(Math.round(Number(event.target.value) * size.height / size.width))); }} /></label>
          <label className="min-w-16 flex-1">{t('imageEditHeight')}<input className={`${inputClass} mt-1 w-full`} type="number" min="2" max="16384" value={height} onChange={event => { setHeight(event.target.value); if (locked) setWidth(String(Math.round(Number(event.target.value) * size.width / size.height))); }} /></label>
          <button type="button" className={`${buttonClass} border border-light-border dark:border-dark-border`} disabled={busy || !validImageSize(Number(width), Number(height))} onClick={() => void save(ImageEditOperation.Resize)}>{t('imageEditSave')}</button>
        </div><label className="flex items-center gap-2 text-secondary"><input type="checkbox" checked={locked} onChange={event => setLocked(event.target.checked)} className="accent-accent" />{t('imageEditLockRatio')}</label>
        <div className="flex flex-wrap items-center gap-2 border-t border-light-border pt-3 dark:border-dark-border"><span className="flex-1 font-medium">{t('imageEditAIReframe')}</span>
          <select className={inputClass} aria-label={t('imageEditRatio')} value={ratio} onChange={event => setRatio(event.target.value)}>{IMAGE_EDIT_RATIOS.map(value => <option key={value}>{value}</option>)}</select>
          <button type="button" className={`${buttonClass} bg-accent text-white`} disabled={busy} onClick={() => void generate(ImageEditOperation.Reframe)}><SparklesIcon className="h-4 w-4" />{t('imageEditGenerate')}</button></div>
      </div>}
    </div>
    {(busy || error || notice) && <div role={error ? 'alert' : 'status'} className={`border-t border-light-border px-3 py-2 text-xs dark:border-dark-border ${error ? 'text-red-500' : 'text-muted'}`}>
      {error || (busy ? t('imageEditSaving') : notice)}
    </div>}
  </div>;
}
