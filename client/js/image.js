// Shrinks a photo in the browser before upload, using a <canvas>.
// Phone photos are often 3-8 MB; a 1024px JPEG is ~150 KB, uploads fast and is plenty for the AI.

const MAX_SIDE = 1024
const THUMB_SIDE = 160

async function loadBitmap(file) {
  try {
    // createImageBitmap decodes the file and applies the camera's rotation (EXIF orientation).
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error("That file couldn't be read as a photo. Try a JPEG or PNG.")
  }
}

function drawScaled(bitmap, maxSide, quality) {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', quality)
}

// Returns { image, thumbnail, previewUrl } where image and thumbnail are JPEG data URLs.
export async function preparePhoto(file) {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.')
  if (file.size > 25 * 1024 * 1024) throw new Error('That photo is over 25 MB. Please choose a smaller one.')

  const bitmap = await loadBitmap(file)
  const result = {
    image: drawScaled(bitmap, MAX_SIDE, 0.85),
    thumbnail: drawScaled(bitmap, THUMB_SIDE, 0.7),
    previewUrl: URL.createObjectURL(file),
  }
  bitmap.close()
  return result
}
