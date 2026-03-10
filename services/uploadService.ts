import { Capacitor } from '@capacitor/core';

const WORKER_URL = import.meta.env.VITE_UPLOAD_WORKER_URL;

/**
 * Retorna o endpoint de upload correto dependendo da plataforma.
 * No Android (Capacitor), usa o Cloudflare Worker.
 * Em desenvolvimento web, usa o servidor Express local.
 */
function getUploadEndpoint(): string {
  if (Capacitor.isNativePlatform()) {
    if (!WORKER_URL) {
      console.warn("VITE_UPLOAD_WORKER_URL não configurada. Usando fallback local.");
      return "/api/upload";
    }
    return `${WORKER_URL}/api/upload`;
  }
  return "/api/upload";
}

export async function uploadToR2(file: File | Blob, folder: string, fileName?: string): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("folder", folder);
  if (fileName) {
    formData.append("fileName", fileName);
  }

  const endpoint = getUploadEndpoint();
  console.log(`Iniciando upload para: ${endpoint}`);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      let errorMessage = `Upload falhou com status ${response.status}`;
      try {
        const error = await response.json();
        errorMessage = error.error || errorMessage;
      } catch {
        try {
          const text = await response.text();
          if (text.includes("<!DOCTYPE") || text.includes("<html")) {
            errorMessage = `Erro no Servidor (${response.status}): O servidor retornou uma página HTML. No Android, isto significa que o Worker URL não está configurado ou acessível.`;
          } else {
            errorMessage = text.slice(0, 100) || errorMessage;
          }
        } catch {
          // Fallback
        }
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    return data.url;
  } catch (error) {
    console.error("Erro no uploadToR2:", error);
    throw error;
  }
}

/**
 * Verifica se o Cloudflare Worker está online e configurado.
 */
export async function checkWorkerHealth(): Promise<boolean> {
  if (!WORKER_URL) return false;
  
  try {
    const response = await fetch(`${WORKER_URL}/api/health`);
    if (response.ok) {
      const data = await response.json();
      return data.status === "ok";
    }
    return false;
  } catch (err) {
    console.error("Worker health check failed:", err);
    return false;
  }
}
