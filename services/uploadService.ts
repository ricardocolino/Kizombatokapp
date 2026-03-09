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
    let errorMessage = `Upload failed with status ${response.status}`;
    try {
      const error = await response.json();
      errorMessage = error.error || errorMessage;
    } catch {
      // If not JSON, try to get text
      try {
        const text = await response.text();
        // If it's HTML, just show the status and a snippet
        if (text.includes("<!DOCTYPE") || text.includes("<html")) {
          errorMessage = `Server Error (${response.status}): The server returned an HTML error page. This often means the file is too large for the server's proxy or the route was not found.`;
        } else {
          errorMessage = text.slice(0, 100) || errorMessage;
        }
      } catch {
        // Fallback to default
      }
    }
    throw new Error(errorMessage);
  }

  const data = await response.json();
  return data.url;
}
