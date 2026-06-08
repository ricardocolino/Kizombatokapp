
/**
 * Parses a media URL which might be a JSON array string.
 * @param mediaUrl The media URL string from the database.
 * @returns The first URL if it's an array, or the original string.
 */
export function parseMediaUrl(mediaUrl: string | null | undefined): string {
  if (!mediaUrl) return '';
  
  // If it's already a valid URL (starts with http), return it
  if (mediaUrl.startsWith('http')) {
    // But check if it's a JSON string that happens to start with http (unlikely but possible)
    if (!mediaUrl.startsWith('["') && !mediaUrl.startsWith('{"')) {
      return mediaUrl;
    }
  }

  try {
    if (mediaUrl.startsWith('[') && mediaUrl.endsWith(']')) {
      const urls = JSON.parse(mediaUrl);
      mediaUrl = Array.isArray(urls) ? urls[0] : mediaUrl;
    }
  } catch {
    // Not a JSON array
  }
  
  // Rewrite R2 URL to Worker URL if configured (to fix CORS/Playback)
  const workerUrl = import.meta.env.VITE_R2_WORKER_URL;
  if (workerUrl && mediaUrl.includes('r2.dev')) {
    try {
      const url = new URL(mediaUrl);
      // If it's the old R2 domain, swap it for the worker domain
      if (url.hostname.includes('r2.dev')) {
        return `${workerUrl.replace(/\/$/, '')}${url.pathname}${url.search}`;
      }
    } catch {
      // Invalid URL, return as is
    }
  }
  
  return mediaUrl;
}
