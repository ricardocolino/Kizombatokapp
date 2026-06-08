/**
 * Parses a media URL which might be a JSON array string and handles R2 Worker rewrite.
 * @param mediaUrl The media URL string from the database.
 * @returns The first URL if it's an array, or the original string.
 */
export function parseMediaUrl(mediaUrl: string | null | undefined): string {
  if (!mediaUrl) return '';
  
  let targetUrl = mediaUrl.trim();

  // If it's already a valid url in JSON array form, unpack it
  if (targetUrl.startsWith('[') && targetUrl.endsWith(']')) {
    try {
      const urls = JSON.parse(targetUrl);
      targetUrl = Array.isArray(urls) ? (urls[0] || '') : targetUrl;
    } catch {
      // Not a JSON array
    }
  }

  // Rewrite R2 URL to Worker URL if configured (to fix CORS/Playback)
  const workerUrl = import.meta.env.VITE_R2_WORKER_URL;
  if (workerUrl && targetUrl.includes('r2.dev')) {
    try {
      const url = new URL(targetUrl);
      // If it's the R2 domain, swap it for the worker domain
      if (url.hostname.includes('r2.dev')) {
        return `${workerUrl.replace(/\/$/, '')}${url.pathname}${url.search}`;
      }
    } catch {
      // Invalid URL, return as is
    }
  }
  
  return targetUrl;
}
