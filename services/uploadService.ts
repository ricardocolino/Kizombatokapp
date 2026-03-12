
/**
 * Retorna o endpoint de upload.
 * No Android (Capacitor), precisamos da URL completa do servidor.
 * Na Web, podemos usar o caminho relativo.
 */
function getUploadEndpoint(): string {
  const apiUrl = import.meta.env.VITE_API_URL || "";
  
  // Se a URL for do Cloudflare Workers, usamos exatamente como está
  if (apiUrl.includes('workers.dev')) {
    return apiUrl;
  }
  
  // Caso contrário, se for local ou Cloud Run, garantimos o sufixo /api/upload
  let url = apiUrl || "/api/upload";
  if (apiUrl && !apiUrl.endsWith('/api/upload')) {
    url = `${apiUrl.replace(/\/$/, '')}/api/upload`;
  }
  
  return url.replace(/([^:]\/)\/+/g, "$1");
}

/**
 * Faz upload de um ficheiro para o Cloudflare R2 via Worker ou Servidor.
 */
export async function uploadToR2(file: File | Blob, folder: string, fileName?: string): Promise<string> {
  const formData = new FormData();
  if (fileName) {
    formData.append("file", file, fileName);
    formData.append("fileName", fileName);
  } else {
    formData.append("file", file);
  }
  formData.append("folder", folder);

  const endpoint = getUploadEndpoint();
  console.log(`>>> [UPLOAD] Enviando para: ${endpoint}`);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      body: formData,
      // Não incluímos headers de Content-Type manual para o browser definir o boundary do FormData
    });

    const contentType = response.headers.get("content-type") || "";
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`>>> [UPLOAD ERROR] Status: ${response.status}, Content-Type: ${contentType}, Body:`, errorText);
      
      // Se o erro for 404, pode ser que o Worker precise do sufixo /api/upload afinal
      if (response.status === 404 && endpoint.includes('workers.dev') && !endpoint.endsWith('/api/upload')) {
        console.log(">>> [UPLOAD] Tentando fallback com /api/upload...");
        const fallbackRes = await fetch(`${endpoint.replace(/\/$/, '')}/api/upload`, {
          method: "POST",
          body: formData
        });
        if (fallbackRes.ok) {
          const data = await fallbackRes.json();
          return data.url;
        }
      }
      
      throw new Error(`Erro ${response.status}: ${errorText.slice(0, 100) || 'Falha na comunicação com o Cloudflare'}`);
    }

    // Se chegou aqui, a resposta é 2xx. Vamos verificar se é JSON.
    if (!contentType.includes("application/json")) {
      const text = await response.text();
      console.error(">>> [UPLOAD ERROR] Resposta não é JSON:", text.slice(0, 200));
      throw new Error(`O servidor respondeu com sucesso mas não enviou JSON. Conteúdo: ${text.slice(0, 50)}...`);
    }

    try {
      const data = await response.json();
      if (!data.url) throw new Error("Resposta do servidor sem URL de ficheiro.");
      return data.url;
    } catch (parseError) {
      console.error(">>> [UPLOAD ERROR] Falha ao processar JSON:", parseError);
      throw new Error("O servidor enviou uma resposta que não pôde ser lida como JSON.");
    }
  } catch (error: any) {
    console.error("Erro crítico no uploadToR2:", error);
    throw new Error(error.message || "Erro desconhecido no upload");
  }
}
