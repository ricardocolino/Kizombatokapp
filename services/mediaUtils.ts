/**
 * Parses a media URL which might be a JSON array string and handles R2 Worker rewrite.
 * @param mediaUrl The media URL string from the database.
 * @returns The first URL if it's an array, or the original string.
 */
export function parseMediaUrl(mediaUrl: unknown): string {
  if (mediaUrl === null || mediaUrl === undefined) return '';

  // Handle case where mediaUrl is a real JS Array
  if (Array.isArray(mediaUrl)) {
    return mediaUrl.length > 0 ? parseMediaUrl(mediaUrl[0]) : '';
  }

  // Ensure it's a string
  let targetUrl = String(mediaUrl).trim();

  // If it's empty or represents a null/undefined string, return empty
  if (!targetUrl || targetUrl === 'null' || targetUrl === 'undefined') {
    return '';
  }

  // If it's already a valid url in JSON array form, unpack it
  if (targetUrl.startsWith('[') && targetUrl.endsWith(']')) {
    try {
      const urls = JSON.parse(targetUrl);
      if (Array.isArray(urls)) {
        return urls.length > 0 ? parseMediaUrl(urls[0]) : '';
      } else {
        targetUrl = String(urls);
      }
    } catch {
      // Not a JSON array
    }
  }

  // Ensure again we don't have empty or invalid value after extraction
  if (!targetUrl || targetUrl === 'null' || targetUrl === 'undefined') {
    return '';
  }

  // Rewrite R2 URL to Worker URL if configured (to fix CORS/Playback)
  const workerUrl = import.meta.env.VITE_R2_WORKER_URL;
  if (workerUrl && targetUrl.includes('r2.dev')) {
    try {
      // Prepend https:// if protocol is missing but domain contains r2.dev
      let tempUrlStr = targetUrl;
      if (!/^https?:\/\//i.test(tempUrlStr)) {
        tempUrlStr = 'https://' + tempUrlStr;
      }
      const url = new URL(tempUrlStr);
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
