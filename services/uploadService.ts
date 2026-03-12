
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
 * Faz upload de um ficheiro para o Cloudflare R2 via Worker ou Servidor.
 */
export async function uploadToR2(file: File | Blob, folder: string, fileName?: string): Promise<string> {
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

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      body: formData,
    });

    const contentType = response.headers.get("content-type") || "";
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erro ${response.status} em ${endpoint}: ${errorText.slice(0, 50)}`);
    }

    // Se a resposta for HTML em vez de JSON, é porque a URL está errada
    if (contentType.includes("text/html")) {
      throw new Error(`Configuração Errada: O endereço [${endpoint}] devolveu uma página HTML em vez de processar o upload. Verifique a VITE_API_URL nas Settings.`);
    }

    if (!contentType.includes("application/json")) {
      throw new Error(`Resposta Inválida: O servidor em [${endpoint}] não enviou JSON.`);
    }

    const data = await response.json();
    if (!data.url) throw new Error("O servidor não devolveu a URL do ficheiro.");
    return data.url;
  } catch (error: unknown) {
    console.error("Erro crítico no uploadToR2:", error);
    const message = error instanceof Error ? error.message : "Erro de conexão com o servidor de upload";
    throw new Error(message);
  }
}
