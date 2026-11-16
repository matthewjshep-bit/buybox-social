// Someone's photo, made ready in the browser before it's sent: cropped to the
// middle square and shrunk to a small JPEG, small enough to keep with their
// account. (Browser only: it draws on a canvas.)
const PHOTO_SIZE = 256;

export async function resizePhoto(file: File) {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = PHOTO_SIZE;
  const side = Math.min(bitmap.width, bitmap.height);
  canvas
    .getContext("2d")!
    .drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
  return canvas.toDataURL("image/jpeg", 0.82);
}

// A banner image: the band across the top of a profile, from an image of
// their own. The image as added is kept (a little smaller: the "source"), and
// the band is drawn from it as they framed it: which point of the image sits
// at the band's middle (`x`, `y`, each from 0 to 1) and how large it is
// (`zoom`: 1 just fills the band; less shows more of the image, with its own
// edge colour around it, so a whole logo fits).
export const BANNER_WIDTH = 1200;
export const BANNER_HEIGHT = 360;
const SOURCE_MOST = 1600;

export type BannerFrame = { x: number; y: number; zoom: number };
export const BANNER_FRAME: BannerFrame = { x: 0.5, y: 0.5, zoom: 1 };
export const BANNER_ZOOM_MOST = 3;

type Sized = CanvasImageSource & { width: number; height: number };

// The smallest it goes: the whole image in the band, with a little room round it.
export const bannerZoomLeast = (image: { width: number; height: number }) => {
  const cover = Math.max(BANNER_WIDTH / image.width, BANNER_HEIGHT / image.height);
  const fit = Math.min(BANNER_WIDTH / image.width, BANNER_HEIGHT / image.height);
  return Math.min(1, (fit / cover) * 0.7);
};

const clamp = (n: number, least: number, most: number) => Math.min(most, Math.max(least, n));

export const clampFrame = (frame: BannerFrame, image: { width: number; height: number }): BannerFrame => ({
  x: clamp(frame.x, 0, 1),
  y: clamp(frame.y, 0, 1),
  zoom: clamp(frame.zoom, bannerZoomLeast(image), BANNER_ZOOM_MOST),
});

// The colour at the image's corner: what shows around it when it's smaller
// than the band, so a logo on white (or navy) sits on more of the same.
function edgeColor(image: Sized) {
  const dot = document.createElement("canvas");
  dot.width = dot.height = 1;
  const context = dot.getContext("2d")!;
  context.drawImage(image, 0, 0, 1, 1, 0, 0, 1, 1);
  const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
  return `rgb(${r}, ${g}, ${b})`;
}

// The band, drawn on a canvas of the band's shape (any size).
export function drawBanner(canvas: HTMLCanvasElement, image: Sized, frame: BannerFrame) {
  const context = canvas.getContext("2d")!;
  const scale = Math.max(canvas.width / image.width, canvas.height / image.height) * frame.zoom;
  const width = image.width * scale;
  const height = image.height * scale;
  context.fillStyle = edgeColor(image);
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, canvas.width / 2 - frame.x * width, canvas.height / 2 - frame.y * height, width, height);
}

// The band as it's saved: a small wide JPEG.
export function renderBanner(image: Sized, frame: BannerFrame) {
  const canvas = document.createElement("canvas");
  canvas.width = BANNER_WIDTH;
  canvas.height = BANNER_HEIGHT;
  drawBanner(canvas, image, frame);
  return canvas.toDataURL("image/jpeg", 0.82);
}

// An image someone picked, as it's kept: no wider or taller than it need be,
// a JPEG, anything see-through on white.
export async function bannerSource(file: File) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, SOURCE_MOST / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return { canvas, dataUrl: canvas.toDataURL("image/jpeg", 0.85) };
}

// An image by its address, ready to draw.
export const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("image"));
    image.src = src;
  });

// A photo of a listing, made ready in the browser: no larger than a screen
// needs, a JPEG, small enough to send and keep. Its size comes with it, so
// the page can lay it out before it loads.
const LISTING_PHOTO_MOST = 1600;
const LISTING_PHOTO_CHARS = 850_000;

export async function listingPhoto(file: File) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, LISTING_PHOTO_MOST / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  // A busy photo is pressed a little harder until it fits.
  let dataUrl = "";
  for (const quality of [0.8, 0.65, 0.5, 0.35]) {
    dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (dataUrl.length <= LISTING_PHOTO_CHARS) break;
  }
  if (dataUrl.length > LISTING_PHOTO_CHARS) throw new Error("too large");
  return { dataUrl, width: canvas.width, height: canvas.height };
}
