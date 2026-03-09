export async function uploadToR2(file: File | Blob, folder: string, fileName?: string): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("folder", folder);
  if (fileName) {
    formData.append("fileName", fileName);
  }

  const response = await fetch("/api/upload", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    let errorMessage = "Failed to upload to R2";
    try {
      const error = await response.json();
      errorMessage = error.error || errorMessage;
    } catch {
      // If not JSON, try to get text
      try {
        const text = await response.text();
        errorMessage = text || errorMessage;
      } catch {
        // Fallback to default
      }
    }
    throw new Error(errorMessage);
  }

  const data = await response.json();
  return data.url;
}
