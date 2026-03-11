import { Capacitor } from '@capacitor/core';

/**
 * Retorna o endpoint de upload.
 * No Android (Capacitor), precisamos da URL completa do servidor.
 * Na Web, podemos usar o caminho relativo.
 */
function getUploadEndpoint(): string {
  const apiUrl = import.meta.env.VITE_API_URL || "";
  const base = apiUrl.replace(/\/$/, '');
  
  if (Capacitor.isNativePlatform()) {
    // On native, we MUST use the full URL
    return base ? `${base}/api/upload` : "/api/upload";
  }
  // On web, relative path is usually safer for same-origin
  return "/api/upload";
}

/**
 * Faz upload de um ficheiro para o Cloudflare R2 via Servidor Express.
 * @param file O ficheiro ou blob para upload.
 * @param folder A pasta dentro do bucket (ex: 'posts' ou 'thumbnails').
 * @param fileName Nome opcional para o ficheiro.
 * @returns A URL pública do ficheiro.
 */
export async function uploadToR2(file: File | Blob, folder: string, fileName?: string): Promise<string> {
  const formData = new FormData();
  // Passar o fileName como terceiro argumento para o Blob
  if (fileName) {
    formData.append("file", file, fileName);
    formData.append("fileName", fileName);
  } else {
    formData.append("file", file);
  }
  formData.append("folder", folder);

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
          errorMessage = text.slice(0, 100) || errorMessage;
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
