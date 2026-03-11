import { Capacitor } from '@capacitor/core';

/**
 * Retorna o endpoint de upload.
 * No Android (Capacitor), precisamos da URL completa do servidor.
 * Na Web, podemos usar o caminho relativo.
 */
function getUploadEndpoint(): string {
  const apiUrl = import.meta.env.VITE_API_URL || "";
  const base = apiUrl.replace(/\/$/, '');
  
  let url = "";
  if (Capacitor.isNativePlatform()) {
    url = base ? `${base}/api/upload` : "/api/upload";
  } else {
    url = `${window.location.origin}/api/upload`;
  }
  
  // Clean up double slashes (except after http:// or https://)
  return url.replace(/([^:]\/)\/+/g, "$1");
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
  console.log(`>>> [UPLOAD SERVICE] Iniciando upload para: ${endpoint}`);
  console.log(`>>> [UPLOAD SERVICE] Folder: ${folder}, FileName: ${fileName || 'N/A'}`);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      body: formData,
    });

    const contentType = response.headers.get("content-type");
    
    if (!response.ok) {
      let errorMessage = `Upload falhou com status ${response.status}`;
      if (contentType && contentType.includes("application/json")) {
        try {
          const error = await response.json();
          errorMessage = error.error || errorMessage;
        } catch { /* ignore */ }
      } else {
        const text = await response.text();
        if (text.includes("<!DOCTYPE html>")) {
          errorMessage = "O servidor retornou uma página HTML em vez de JSON. Verifique se a rota /api/upload existe e se o servidor está rodando.";
        } else {
          errorMessage = text.slice(0, 100) || errorMessage;
        }
      }
      throw new Error(errorMessage);
    }

    if (!contentType || !contentType.includes("application/json")) {
      const text = await response.text();
      console.error("Resposta não-JSON do servidor:", text.slice(0, 200));
      throw new Error("O servidor não retornou um JSON válido. Verifique os logs do backend.");
    }

    const data = await response.json();
    return data.url;
  } catch (error) {
    console.error("Erro no uploadToR2:", error);
    throw error;
  }
}
