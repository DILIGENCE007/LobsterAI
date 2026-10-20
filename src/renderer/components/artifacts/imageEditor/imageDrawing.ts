import { ImageEditorTool, type ImageMark, type ImagePoint } from '../../../../shared/imageEditing/types';
import { i18nService } from '../../../services/i18n';

export function drawImageMark(context: CanvasRenderingContext2D, mark: ImageMark, width: number, height: number): void {
  if (!mark.points.length) return;
  const points = mark.points.map(p => ({ x: p.x * width, y: p.y * height }));
  const first = points[0];
  const last = points[points.length - 1];
  const stroke = mark.width * Math.max(width, height);
  context.save(); context.strokeStyle = mark.color; context.fillStyle = mark.color;
  context.lineWidth = stroke; context.lineCap = 'round'; context.lineJoin = 'round';
  if (mark.tool === ImageEditorTool.Text) {
    context.font = `${stroke * 6}px sans-serif`; context.textBaseline = 'top';
    (mark.text ?? '').split('\n').forEach((line, i) => context.fillText(line, first.x, first.y + i * stroke * 7.5));
  } else if (mark.tool === ImageEditorTool.Rectangle) {
    context.strokeRect(first.x, first.y, last.x - first.x, last.y - first.y);
  } else {
    context.beginPath(); context.moveTo(first.x, first.y);
    points.slice(1).forEach(p => context.lineTo(p.x, p.y));
    if (points.length === 1) context.lineTo(first.x + 0.01, first.y);
    context.stroke();
    if (mark.tool === ImageEditorTool.Arrow) {
      const angle = Math.atan2(last.y - first.y, last.x - first.x);
      const head = Math.max(stroke * 4, width * 0.014);
      context.beginPath(); context.moveTo(last.x, last.y);
      context.lineTo(last.x - head * Math.cos(angle - Math.PI / 6), last.y - head * Math.sin(angle - Math.PI / 6));
      context.moveTo(last.x, last.y);
      context.lineTo(last.x - head * Math.cos(angle + Math.PI / 6), last.y - head * Math.sin(angle + Math.PI / 6)); context.stroke();
    }
  }
  context.restore();
}

export async function loadEditorImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error(i18nService.t('imageEditFailed'))); image.src = dataUrl;
  });
}

export function exportImageDrawing(image: HTMLImageElement, marks: ImageMark[], width = image.naturalWidth, height = image.naturalHeight, mask = false): string {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d'); if (!context) throw new Error(i18nService.t('imageEditFailed'));
  context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
  if (mask) { context.fillStyle = '#000000'; context.fillRect(0, 0, width, height); }
  else context.drawImage(image, 0, 0, width, height);
  marks.forEach(mark => drawImageMark(context, mask ? { ...mark, color: '#ffffff' } : mark, width, height));
  return canvas.toDataURL('image/png');
}

/** Stroke eraser affects annotations only; geometry is measured in original-image pixels. */
export function imageMarkHit(mark: ImageMark, point: ImagePoint, width: number, height: number): boolean {
  const px = point.x * width, py = point.y * height;
  const points = mark.points.map(p => ({ x: p.x * width, y: p.y * height }));
  const first = points[0]; if (!first) return false;
  const tolerance = Math.max(mark.width * Math.max(width, height), Math.max(width, height) * 0.012);
  if (mark.tool === ImageEditorTool.Text) return px >= first.x - tolerance && py >= first.y - tolerance
    && px <= first.x + (mark.text?.length ?? 1) * tolerance * 3.6 && py <= first.y + tolerance * 8;
  if (mark.tool === ImageEditorTool.Rectangle) {
    const last = points[points.length - 1];
    points.splice(1, points.length - 1, { x: last.x, y: first.y }, last, { x: first.x, y: last.y }, first);
  }
  if (points.length === 1) return Math.hypot(px - first.x, py - first.y) <= tolerance;
  return points.slice(1).some((end, i) => {
    const start = points[i]; const dx = end.x - start.x, dy = end.y - start.y;
    const fraction = Math.max(0, Math.min(1, ((px - start.x) * dx + (py - start.y) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(px - start.x - fraction * dx, py - start.y - fraction * dy) <= tolerance;
  });
}
