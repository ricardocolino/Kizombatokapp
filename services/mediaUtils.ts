
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
      return Array.isArray(urls) ? urls[0] : mediaUrl;
    }
  } catch {
    // Not a JSON array
  }
  
  return mediaUrl;
}
