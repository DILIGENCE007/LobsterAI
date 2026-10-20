import { ImageEditOperation, type ImageEditRequest } from './types';

export function imageEditPrompt(request: ImageEditRequest): string {
  const base = 'Edit the FIRST input image. Keep the subject, composition and all unrequested details unchanged. Return one edited image, not a description. ';
  switch (request.operation) {
    case ImageEditOperation.Comment:
      return base + 'Region coordinates below are percentages of the original image (left, top, width, height). '
        + request.regions.map((r, i) => `${i + 1}. [${[r.x, r.y, r.width, r.height].map(v => (v * 100).toFixed(1)).join(', ')}]: ${r.text}`).join('\n');
    case ImageEditOperation.Markup:
      return base + 'The SECOND image is an annotated guide. Follow its marks and text as editing instructions. Do not reproduce guide marks in the result. ' + (request.instruction || '');
    case ImageEditOperation.Erase:
      return base + 'The SECOND image is a black and white removal mask: WHITE marks the objects/area to remove; BLACK must be preserved. Remove the marked objects and fill their area naturally using the surrounding background. Do not include the mask in the result.';
    case ImageEditOperation.RemoveBackground:
      return 'Create a precise alpha matte of the foreground subject in the FIRST image. Return only a grayscale mask at the SAME composition and aspect ratio. The complete foreground subject must be solid pure WHITE, all background pure BLACK, with smooth gray antialiased edges. Include ALL visible surfaces of the subject: for a cup, its inner walls, rim and interior are WHITE too. Only see-through holes where the BACKGROUND is visible (such as inside a mug handle) are BLACK. Do not cut out dark surfaces or cup interiors. No colors, shadows, grid, text, new objects, outlines or movement. Do not draw the original photograph. This mask will be applied to the original pixels to create a transparent PNG.';
    case ImageEditOperation.Reframe:
      return base + `Change the canvas aspect ratio to ${request.aspectRatio}. Extend the surrounding scene naturally. Preserve the subject's proportions and appearance; do not stretch the image.`;
    default:
      throw new Error('Unsupported AI image edit operation');
  }
}
