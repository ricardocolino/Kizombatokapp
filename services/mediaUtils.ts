
/**
 * Extracts and parses all media URLs, which could be a plain URL,
 * a JSON array string (even if malformed, unescaped, or wrapped in outer quotes),
 * or a comma-separated/bracketed sequence.
 * 
 * @param mediaUrl The media URL or array/string of URLs from the database.
 * @returns An array of parsed and cleaned URLs.
 */
export function parseAllMediaUrls(mediaUrl: string | null | undefined): string[] {
  if (!mediaUrl) return [];
  
  const trimmed = mediaUrl.trim();
  if (!trimmed) return [];

  let urls: string[] = [];

  // Try standard JSON parse first
  try {
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        urls = parsed.filter(item => typeof item === 'string' && item.trim() !== '');
      }
    }
  } catch {
    // Failed JSON parsing, proceed to regex extraction
  }

  // If standard parsing yielded nothing, use a robust regex to extract any HTTP(S) URLs
  if (urls.length === 0) {
    const matches = trimmed.match(/(https?:\/\/[^"\s\\[\]),;]+)/g);
    if (matches && matches.length > 0) {
      urls = matches;
    } else {
      urls = [trimmed];
    }
  }

  // Rewrite R2 URLs to Worker URL if configured (to fix CORS/Playback)
  const workerUrl = import.meta.env.VITE_R2_WORKER_URL;
  return urls.map(url => {
    const trimmedUrl = url.trim();
    if (workerUrl && trimmedUrl.includes('r2.dev')) {
      try {
        const parsedUrl = new URL(trimmedUrl);
        if (parsedUrl.hostname.includes('r2.dev')) {
          return `${workerUrl.replace(/\/$/, '')}${parsedUrl.pathname}${parsedUrl.search}`;
        }
      } catch {
        // Invalid URL structure, keep as is
      }
    }
    return trimmedUrl;
  });
}

/**
 * Parses a media URL which might be a JSON array string.
 * @param mediaUrl The media URL string from the database.
 * @returns The first URL if it's an array, or the original string.
 */
export function parseMediaUrl(mediaUrl: string | null | undefined): string {
  const urls = parseAllMediaUrls(mediaUrl);
  return urls.length > 0 ? urls[0] : '';
}
