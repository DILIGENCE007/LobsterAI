import { ArrowsPointingOutIcon, ChatBubbleBottomCenterTextIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useEffect, useRef, useState } from 'react';

import { imageRegionCoordinates } from '../../../../shared/imageEditing/geometry';
import type { ImageEditMessageSnapshot } from '../../../../shared/imageEditing/types';
import { i18nService } from '../../../services/i18n';
import { imageEditTitle } from '../../../services/imageEditing';
import { useImageEditSnapshotImage } from '../../../services/imageEditSnapshots';
import Modal from '../../common/Modal';

const t = (key: string) => i18nService.t(key);

interface RegionViewProps {
  snapshot: ImageEditMessageSnapshot;
  selected: string | undefined;
  onSelect?: (id: string) => void;
}

function SnapshotImage({ snapshot, selected, onSelect, src, loading }: RegionViewProps & { src?: string; loading: boolean }) {
  return <div className="relative w-full overflow-hidden rounded-lg bg-surface-raised"
    style={{ aspectRatio: `${snapshot.source.width} / ${snapshot.source.height}`,
      backgroundImage: 'conic-gradient(#8881 25%, transparent 0 50%, #8881 0 75%, transparent 0)', backgroundSize: '16px 16px' }}>
    {src
      ? <img src={src} alt={snapshot.source.title} draggable={false} className="absolute inset-0 h-full w-full" />
      : <span className="absolute inset-0 flex items-center justify-center p-4 text-center text-xs text-muted">
        {t(loading ? 'imageEditLoading' : 'imageEditSnapshotUnavailable')}
      </span>}
    {src && snapshot.regions.map((region, index) => {
      const active = selected === region.id;
      const style = { left: `${region.x * 100}%`, top: `${region.y * 100}%`, width: `${region.width * 100}%`, height: `${region.height * 100}%` };
      const className = `absolute border-2 ${active ? 'border-blue-600 bg-blue-500/15' : 'border-dashed border-blue-500 bg-blue-500/5'}`;
      const badge = <span className="absolute -left-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded bg-blue-600 px-1 text-[11px] font-semibold leading-none text-white shadow-sm">{index + 1}</span>;
      return onSelect
        ? <button key={region.id} type="button" data-image-edit-region={index + 1} aria-pressed={active}
          aria-label={`${t('imageEditRegionLabel').replace('{number}', String(index + 1))}: ${region.text}`}
          onClick={() => onSelect(region.id)} className={`${className} focus:outline-none focus:ring-2 focus:ring-blue-400`} style={style}>{badge}</button>
        : <span key={region.id} data-image-edit-region={index + 1} className={className} style={style} aria-hidden="true">{badge}</span>;
    })}
  </div>;
}

function RegionDetails({ snapshot, selected, onSelect }: RegionViewProps) {
  return <div className="space-y-2">
    <p className="text-[11px] leading-4 text-muted">{t('imageEditCoordinateHint')}</p>
    {snapshot.regions.map((region, index) => {
      const coordinates = imageRegionCoordinates(region, snapshot.source);
      return <button key={region.id} type="button" onClick={() => onSelect?.(region.id)} aria-pressed={selected === region.id}
        className={`block w-full rounded-lg border px-2.5 py-2 text-left text-xs transition-colors ${selected === region.id ? 'border-primary/40 bg-primary/5' : 'border-border hover:bg-surface-raised'}`}>
        <span className="flex items-start gap-2">
          <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded bg-blue-600 px-0.5 text-[10px] text-white">{index + 1}</span>
          <span className="min-w-0 whitespace-pre-wrap break-words text-foreground">{region.text}</span>
        </span>
        <span className="mt-2 block space-y-1 text-[11px] leading-4 text-muted">
          <span className="block">{t('imageEditCoordinatePercent')} <span className="font-mono tabular-nums text-secondary">{coordinates.percent.map(value => `${value}%`).join(', ')}</span></span>
          <span className="block">{t('imageEditCoordinatePixels')} <span className="font-mono tabular-nums text-secondary">{coordinates.pixels.join(', ')}</span></span>
        </span>
      </button>;
    })}
  </div>;
}

function SnapshotPreview({ snapshot, selected, onSelect, preview, onClose }: RegionViewProps & { preview?: string; onClose: () => void }) {
  const image = useImageEditSnapshotImage(snapshot, preview, false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    closeRef.current?.focus();
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  return <Modal onClose={onClose} onEscape={onClose}
    overlayClassName="fixed inset-0 z-[10000] flex items-center justify-center bg-neutral-950/60 p-4 backdrop-blur-sm"
    className="max-h-[92vh] w-[1000px] max-w-full overflow-y-auto rounded-2xl border border-border bg-surface shadow-2xl">
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={t('imageEditSnapshot')} onKeyDown={event => {
      if (event.key !== 'Tab') return;
      const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])');
      if (!buttons?.length) return;
      const first = buttons[0]; const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }}>
      <div className="flex items-start gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-medium text-foreground">{t('imageEditSnapshot')}</h2>
          {snapshot.sourceVersionNumber && <span className="text-xs text-primary">{t('imageEditSourceVersion').replace('{version}', String(snapshot.sourceVersionNumber))}</span>}
          <p className="mt-1 truncate text-xs text-muted" title={snapshot.source.title}>{snapshot.source.title} · {snapshot.source.width} × {snapshot.source.height}</p>
          <p className="mt-1 text-xs text-muted">{t('imageEditSnapshotHint')}</p>
        </div>
        <button ref={closeRef} type="button" onClick={onClose} aria-label={t('close')} className="rounded-lg p-1.5 text-muted hover:bg-surface-raised"><XMarkIcon className="h-5 w-5" /></button>
      </div>
      <div className="grid items-start gap-5 p-5 md:grid-cols-[minmax(0,1fr)_270px]">
        <div className="flex min-w-0 flex-col items-center justify-center">
          <div className="max-w-full" style={{ width: `min(100%, ${62 * snapshot.source.width / snapshot.source.height}vh)` }}>
            <SnapshotImage snapshot={snapshot} selected={selected} onSelect={onSelect} src={image.src} loading={image.loading} />
          </div>
          {image.failed && <p className="mt-2 text-xs text-muted">{t('imageEditSnapshotUnavailable')}</p>}
        </div>
        <div className="max-h-[62vh] min-w-0 overflow-y-auto">
          <h3 className="mb-3 text-xs font-medium text-foreground">{t('imageEditRegionCoordinates')}</h3>
          <RegionDetails snapshot={snapshot} selected={selected} onSelect={onSelect} />
        </div>
      </div>
    </div>
  </Modal>;
}

export function ImageEditMessageCard({ snapshot, fallback }: { snapshot: ImageEditMessageSnapshot; fallback?: string }) {
  const image = useImageEditSnapshotImage(snapshot, fallback, true);
  const [selected, setSelected] = useState(snapshot.regions[0]?.id);
  const [open, setOpen] = useState(false);
  return <div data-image-edit-snapshot={snapshot.requestId} className="mt-2 w-64 max-w-full overflow-hidden rounded-xl border border-border bg-surface text-foreground">
    <div className="flex items-center gap-1.5 px-3 pb-1 pt-2.5 text-xs">
      <ChatBubbleBottomCenterTextIcon className="h-3.5 w-3.5 shrink-0 text-primary" />
      <span className="font-medium">{imageEditTitle(snapshot.operation)}</span>
      <span className="ml-auto text-[10px] text-muted">{t('imageEditSnapshot')}</span>
    </div>
    <div className="px-3 pb-2 text-[11px] text-muted">
      {snapshot.sourceVersionNumber ? `${t('imageEditSourceVersion').replace('{version}', String(snapshot.sourceVersionNumber))} · ` : ''}
      {snapshot.source.width} × {snapshot.source.height}
    </div>
    <button type="button" onClick={() => setOpen(true)} aria-label={t('imageEditSnapshotView')} className="group relative block w-full px-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary">
      <SnapshotImage snapshot={snapshot} selected={selected} src={image.src} loading={image.loading} />
      <span className="absolute bottom-2 right-4 rounded-md bg-black/55 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"><ArrowsPointingOutIcon className="h-3.5 w-3.5" /></span>
    </button>
    {snapshot.regions.length > 0 && <details className="px-3 py-2.5">
      <summary className="cursor-pointer text-xs text-primary">
        {t('imageEditCoordinates')}<span className="ml-2 text-[11px] text-muted">{t('imageEditRegions').replace('{count}', String(snapshot.regions.length))}</span>
      </summary>
      <div className="mt-2 max-h-64 overflow-y-auto"><RegionDetails snapshot={snapshot} selected={selected} onSelect={setSelected} /></div>
    </details>}
    {open && <SnapshotPreview snapshot={snapshot} selected={selected} onSelect={setSelected} preview={image.src} onClose={() => setOpen(false)} />}
  </div>;
}
