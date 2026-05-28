/**
 * Resolves the Node.js Express Backend Base URL dynamically.
 * Handles AI Studio Developer Sandboxes, shared links, localhost, and production domains.
 */
export function getBackendBaseUrl(): string {
  // If we are on mobile (Capacitor) or a specialized domain, check for environment override
  const envNodeUrl = import.meta.env.VITE_API_NODE_URL;
  if (envNodeUrl && envNodeUrl.trim()) {
    return envNodeUrl.replace(/\/$/, "");
  }

  // If we are currently running inside the AI Studio sandbox (Run or Pre / Shared view)
  const currentOrigin = window.location.origin;
  if (currentOrigin && currentOrigin.includes("europe-west2.run.app")) {
    return currentOrigin.replace(/\/$/, "");
  }

  // Default Fallback: Persistent AI Studio URL (Shared view is perfect since it stays online longer)
  return "https://ais-pre-zrifqkgbujknyfw6lb6hhi-7031768075.europe-west2.run.app";
}

/**
 * Builds the absolute URL for the proxy-media endpoint.
 */
export function getProxyMediaUrl(targetUrl: string): string {
  if (!targetUrl) return "";
  const baseUrl = getBackendBaseUrl();
  return `${baseUrl}/api/proxy-media?url=${encodeURIComponent(targetUrl)}`;
}
