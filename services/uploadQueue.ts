const DB_NAME = 'AngochatUploadQueue';
const STORE_NAME = 'pendingUploads';
const DB_VERSION = 1;

export interface UploadData {
  mediaFile: File | Blob;
  mediaFiles?: (File | Blob)[];
  content: string;
  uploadType: 'post' | 'story';
  isEducation?: boolean;
  recordedFacingMode: string;
  isFromGallery: boolean;
  trimStart: number;
  trimEnd: number;
  recordingSeconds: number;
  dubbedMp3Url?: string | null;
  dubbedFromId?: string | null;
  dubbingDelayMs?: number;
  textOverlay?: string | null;
  rotation?: 0 | 90 | 180 | 270;
}

export interface SerializedUpload {
  id: string;
  content: string;
  uploadType: 'post' | 'story';
  isEducation?: boolean;
  recordedFacingMode: string;
  isFromGallery: boolean;
  trimStart: number;
  trimEnd: number;
  recordingSeconds: number;
  dubbedMp3Url?: string | null;
  dubbedFromId?: string | null;
  dubbingDelayMs?: number;
  textOverlay?: string | null;
  rotation?: 0 | 90 | 180 | 270;
  
  // Media preservation
  mediaFileBlob: Blob;
  mediaFileType: string;
  mediaFileName?: string;
  
  // Multiple files support
  mediaFiles?: { blob: Blob; type: string; name?: string }[];
  createdAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => {
      console.error('[UploadQueue] Erro ao abrir base de dados IndexedDB:', request.error);
      reject(request.error);
    };
    
    request.onsuccess = () => {
      resolve(request.result);
    };
    
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        console.log('[UploadQueue] ObjectStore criado com sucesso!');
      }
    };
  });
}

/**
 * Salva um upload em progresso no IndexedDB.
 */
export async function savePendingUpload(id: string, data: UploadData): Promise<void> {
  try {
    const db = await openDB();
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      const serializedFiles = data.mediaFiles?.map(f => ({
        blob: f instanceof Blob ? f : new Blob([f], { type: f.type }),
        type: f.type,
        name: f instanceof File ? f.name : undefined
      }));

      const record: SerializedUpload = {
        id,
        content: data.content,
        uploadType: data.uploadType,
        isEducation: data.isEducation,
        recordedFacingMode: data.recordedFacingMode,
        isFromGallery: data.isFromGallery,
        trimStart: data.trimStart,
        trimEnd: data.trimEnd,
        recordingSeconds: data.recordingSeconds,
        dubbedMp3Url: data.dubbedMp3Url,
        dubbedFromId: data.dubbedFromId,
        dubbingDelayMs: data.dubbingDelayMs,
        textOverlay: data.textOverlay,
        rotation: data.rotation,
        
        mediaFileBlob: data.mediaFile instanceof Blob ? data.mediaFile : new Blob([data.mediaFile], { type: data.mediaFile.type }),
        mediaFileType: data.mediaFile.type,
        mediaFileName: data.mediaFile instanceof File ? data.mediaFile.name : undefined,
        
        mediaFiles: serializedFiles,
        createdAt: Date.now()
      };

      const request = store.put(record);
      
      request.onsuccess = () => {
        console.log(`[UploadQueue] Upload ${id} salvo com sucesso no IndexedDB!`);
        resolve();
      };
      
      request.onerror = () => {
        console.error('[UploadQueue] Erro ao salvar registro:', request.error);
        reject(request.error);
      };
    });
  } catch (err) {
    console.error('[UploadQueue] Falha ao salvar pending upload no IndexedDB:', err);
  }
}

/**
 * Obtém todos os uploads pendentes da fila.
 */
export async function getPendingUploads(): Promise<SerializedUpload[]> {
  try {
    const db = await openDB();
    return new Promise<SerializedUpload[]>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      
      request.onsuccess = () => {
        resolve(request.result || []);
      };
      
      request.onerror = () => {
        reject(request.error);
      };
    });
  } catch (err) {
    console.error('[UploadQueue] Erro ao buscar uploads pendentes:', err);
    return [];
  }
}

/**
 * Exclui um upload da fila.
 */
export async function deletePendingUpload(id: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);
      
      request.onsuccess = () => {
        console.log(`[UploadQueue] Registro ${id} removido do IndexedDB.`);
        resolve();
      };
      
      request.onerror = () => {
        reject(request.error);
      };
    });
  } catch (err) {
    console.error('[UploadQueue] Erro ao deletar upload pendente:', err);
  }
}
