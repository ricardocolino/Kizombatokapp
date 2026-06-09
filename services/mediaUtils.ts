/**
 * Converte media_url para um array de URLs.
 * Suporta:
 * - URL simples
 * - JSON array de URLs
 * - null/undefined
 */
export function parseMediaUrls(
  mediaUrl: string | null | undefined
): string[] {
  if (!mediaUrl) return [];

  try {
    // Se for um JSON Array
    if (mediaUrl.startsWith('[') && mediaUrl.endsWith(']')) {
      const urls = JSON.parse(mediaUrl);

      if (Array.isArray(urls)) {
        return urls.map((url) => rewriteR2Url(url));
      }
    }
  } catch (error) {
    console.error('Erro ao processar mediaUrl:', error);
  }

  // URL única
  return [rewriteR2Url(mediaUrl)];
}

/**
 * Reescreve URLs do R2 para o Worker
 */
function rewriteR2Url(url: string): string {
  const workerUrl = import.meta.env.VITE_R2_WORKER_URL;

  if (!workerUrl || !url?.includes('r2.dev')) {
    return url;
  }

  try {
    const parsedUrl = new URL(url);

    if (parsedUrl.hostname.includes('r2.dev')) {
      return `${workerUrl.replace(/\/$/, '')}${parsedUrl.pathname}${parsedUrl.search}`;
    }
  } catch {
    // Ignora URLs inválidas
  }

  return url;
}
