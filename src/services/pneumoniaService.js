import fs from 'node:fs/promises';

/** Calls the separate FastAPI ML service supplied in the project document. */
export async function runPneumoniaPrediction(file) {
  const endpoint = process.env.PNEUMONIA_API_URL;
  if (!endpoint) return { status: 'not_configured', message: 'PNEUMONIA_API_URL is not configured.' };
  if (!['image/jpeg', 'image/png', 'image/jpg'].includes(file.mimetype)) {
    return { status: 'skipped', message: 'Pneumonia inference supports JPG and PNG images only.' };
  }

  try {
    const bytes = await fs.readFile(file.path);
    const form = new FormData();
    form.append('file', new Blob([bytes], { type: file.mimetype }), file.originalname);
    const response = await fetch(endpoint, { method: 'POST', body: form, signal: AbortSignal.timeout(120000) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { status: 'unavailable', message: `ML service returned HTTP ${response.status}.` };
    }
    if (payload?.success && payload?.result) {
      return { ...payload.result, status: 'completed', disclaimer: 'AI-assisted screening output only; not a diagnosis. A qualified clinician must interpret the report.' };
    }
    return { status: 'unavailable', message: 'ML service returned an unexpected response.' };
  } catch (error) {
    return { status: 'unavailable', message: error.name === 'TimeoutError' ? 'ML service timed out.' : 'ML service could not be reached or inference failed.' };
  }
}
