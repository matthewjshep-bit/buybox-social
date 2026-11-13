// Someone's photo, made ready in the browser before it's sent: cropped to the
// middle square and shrunk to a small JPEG, small enough to keep with their
// account. (Browser only: it draws on a canvas.)
export const PHOTO_SIZE = 256;

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
