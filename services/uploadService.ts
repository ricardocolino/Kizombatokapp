
/**
 * Retorna o endpoint de upload.
 * No Android (Capacitor), precisamos da URL completa do servidor.
 * Na Web, podemos usar o caminho relativo.
 */
function getUploadEndpoint(): string {
  // Tentamos obter a URL das variáveis de ambiente
  const apiUrl = import.meta.env.VITE_API_URL || "";
  
  console.log(">>> [DEBUG] VITE_API_URL detetada:", apiUrl);

  // Se a URL for do Cloudflare Workers, usamos exatamente como está
  if (apiUrl && apiUrl.includes('workers.dev')) {
    return apiUrl;
  }
  
  // Se não houver URL configurada, avisamos ou usamos o padrão local
  if (!apiUrl) {
    console.warn(">>> [WARNING] VITE_API_URL não definida. Usando fallback local.");
    return "/api/upload";
  }
  
  // Para outras URLs (Cloud Run), garantimos o sufixo /api/upload
  let url = apiUrl;
  if (!apiUrl.endsWith('/api/upload')) {
    url = `${apiUrl.replace(/\/$/, '')}/api/upload`;
  }
  
  return url.replace(/([^:]\/)\/+/g, "$1");
}

/**
 * Faz upload de um ficheiro para o Cloudflare R2 via Worker ou Servidor com suporte a progresso.
 */
export async function uploadToR2(
  file: File | Blob, 
  folder: string, 
  fileName?: string, 
  onProgress?: (progress: number) => void
): Promise<string> {
  const endpoint = getUploadEndpoint();
  
  const formData = new FormData();
  if (fileName) {
    formData.append("file", file, fileName);
    formData.append("fileName", fileName);
  } else {
    formData.append("file", file);
  }
  formData.append("folder", folder);

  console.log(`>>> [UPLOAD] Tentando enviar para: ${endpoint}`);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", endpoint, true);

    if (onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentComplete = (event.loaded / event.total) * 100;
          onProgress(percentComplete);
        }
      };
    }

    xhr.onload = () => {
      const contentType = xhr.getResponseHeader("content-type") || "";
      
      if (xhr.status >= 200 && xhr.status < 300) {
        if (!contentType.includes("application/json")) {
          reject(new Error(`Resposta Inválida: O servidor em [${endpoint}] não enviou JSON.`));
          return;
        }

        try {
          const data = JSON.parse(xhr.responseText);
          if (!data.url) {
            reject(new Error("O servidor não devolveu a URL do ficheiro."));
          } else {
            resolve(data.url);
          }
        } catch {
          reject(new Error("Erro ao processar resposta JSON do servidor."));
        }
      } else {
        reject(new Error(`Erro ${xhr.status} em ${endpoint}: ${xhr.responseText.slice(0, 50)}`));
      }
    };

    xhr.onerror = () => {
      reject(new Error("Erro de conexão com o servidor de upload"));
    };

    xhr.send(formData);
  });
}
