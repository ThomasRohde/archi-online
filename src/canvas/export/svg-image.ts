export async function rasterizeSvg(
  svg: string,
  width: number,
  height: number,
  scale = 1,
): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D is unavailable');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('PNG encoding failed');
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function supportsPngClipboard(): boolean {
  return (
    typeof navigator !== 'undefined'
    && Boolean(navigator.clipboard)
    && typeof navigator.clipboard.write === 'function'
    && typeof ClipboardItem !== 'undefined'
  );
}

export async function copyPngBlobToClipboard(blob: Promise<Blob>): Promise<void> {
  if (!supportsPngClipboard()) {
    throw new Error(
      'Copying images to the clipboard is not supported in this browser — export a PNG instead.',
    );
  }
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}
