const PROXY_URL = "/api/upload";

export async function uploadFileToBucky(file) {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(PROXY_URL, { method: "POST", body: formData });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error.error ||
        `Upload failed (${response.status}) for file "${file.name}" (${(file.size / 1024).toFixed(1)} KB)`,
    );
  }
  return (await response.text()).trim();
}

export function dataUrlToBlob(dataUrl) {
  const [meta, base64] = dataUrl.split(",");
  const mime = meta.match(/:(.*?);/)[1];
  const byteString = atob(base64);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
  return new Blob([ab], { type: mime });
}
