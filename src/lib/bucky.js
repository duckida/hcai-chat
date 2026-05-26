const BUCKY_URL = "https://bucky.hackclub.com/";

export async function uploadFileToBucky(file) {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(BUCKY_URL, { method: "POST", body: formData });
  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status}`);
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
