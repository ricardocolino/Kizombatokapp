import { supabase } from '../supabaseClient';

/**
 * Faz upload de um ficheiro para o Supabase Storage.
 * @param file O ficheiro ou blob para upload.
 * @param bucket O nome do bucket (ex: 'posts').
 * @param folder A pasta dentro do bucket (ex: 'posts' ou 'thumbnails').
 * @param fileName Nome opcional para o ficheiro.
 * @returns A URL pública do ficheiro.
 */
export async function uploadFile(
  file: File | Blob,
  bucket: string,
  folder: string,
  fileName?: string
): Promise<string> {
  const actualFileName = fileName || `${Date.now()}-${(file as File).name || 'upload'}`;
  const filePath = `${folder}/${actualFileName}`;

  console.log(`Iniciando upload para Supabase: ${bucket}/${filePath}`);

  const { error } = await supabase.storage
    .from(bucket)
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false
    });

  if (error) {
    console.error('Erro no upload do Supabase:', error);
    throw new Error(`Erro no upload: ${error.message}`);
  }

  const { data: publicUrlData } = supabase.storage
    .from(bucket)
    .getPublicUrl(filePath);

  if (!publicUrlData) {
    throw new Error('Não foi possível obter a URL pública do ficheiro.');
  }

  return publicUrlData.publicUrl;
}

/**
 * Função legada para manter compatibilidade com chamadas existentes.
 */
export async function uploadToR2(file: File | Blob, folder: string, fileName?: string): Promise<string> {
  console.warn('uploadToR2 foi descontinuado. Usando Supabase Storage.');
  // O bucket principal no Supabase parece ser 'posts' baseado no contexto anterior
  return uploadFile(file, 'posts', folder, fileName);
}
