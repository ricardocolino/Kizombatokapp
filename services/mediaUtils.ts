
/**
 * Parses a media URL which might be a JSON array string.
 * @param mediaUrl The media URL string from the database.
 * @returns The first URL if it's an array, or the original string.
 */
export function parseMediaUrl(mediaUrl: string | string[] | null | undefined | unknown): string | null {
  if (!mediaUrl) return null;
  
  let targetUrl = '';

  // If it's already an array, use the first element
  if (Array.isArray(mediaUrl)) {
    targetUrl = mediaUrl[0] || '';
  } else if (typeof mediaUrl === 'string') {
    const trimmed = mediaUrl.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          targetUrl = parsed[0] || '';
        } else {
          targetUrl = trimmed;
        }
      } catch {
        targetUrl = trimmed;
      }
    } else {
      targetUrl = trimmed;
    }
  } else {
    targetUrl = String(mediaUrl);
  }

  if (!targetUrl) return null;

  // Clean quotes if any got preserved
  targetUrl = targetUrl.replace(/^["']|["']$/g, '').trim();

  // Rewrite R2 URL or Workers URL to Worker URL proxy if configured (to fix CORS/Playback)
  const workerUrl = import.meta.env.VITE_R2_WORKER_URL;
  if (workerUrl && (targetUrl.includes('r2.dev') || targetUrl.includes('workers.dev'))) {
    try {
      const url = new URL(targetUrl);
      if (url.hostname.includes('r2.dev') || url.hostname.includes('workers.dev')) {
        return `${workerUrl.replace(/\/$/, '')}${url.pathname}${url.search}`;
      }
    } catch {
      // Invalid URL, return as is
    }
  }
  
  return targetUrl;
}
