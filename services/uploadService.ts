import { Capacitor } from '@capacitor/core';

/**
 * Retorna o endpoint de upload.
 * No Android (Capacitor), precisamos da URL completa do servidor.
 * Na Web, podemos usar o caminho relativo.
 */
function getUploadEndpoint(): string {
  // Se estivermos no Android/iOS, usamos a URL do servidor configurada no ambiente
  // Se não houver URL configurada, tentamos usar o origin atual (que na web funciona)
  if (Capacitor.isNativePlatform()) {
    // No AI Studio, o frontend e backend estão no mesmo domínio
    // Mas no Android o origin é 'capacitor://localhost'
    // Por isso precisamos da URL real do servidor.
    return "/api/upload"; 
  }
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
