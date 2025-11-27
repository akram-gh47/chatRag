const DEFAULT_API_BASE_URL = "http://localhost:8000";
const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/$/, "");

export async function uploadPdf(file) {
  const body = new FormData();
  body.append("file", file);

  const response = await fetch(`${API_BASE_URL}/upload-pdf`, {
    method: "POST",
    body
  });

  if (!response.ok) {
    const detail = await extractError(response);
    throw new Error(detail || "Upload failed.");
  }

  return response.json();
}

export async function askQuestion(docId, question, history) {
  const payload = {
    doc_id: docId,
    question,
    history: history.map(({ role, content }) => ({ role, content }))
  };

  const response = await fetch(`${API_BASE_URL}/chat`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const detail = await extractError(response);
    throw new Error(detail || "Chat request failed.");
  }

  return response.json();
}

async function extractError(response) {
  try {
    const data = await response.json();
    if (typeof data?.detail === "string") {
      return data.detail;
    }
    if (typeof data?.message === "string") {
      return data.message;
    }
  } catch {
    // ignore JSON parsing issues
  }
  return response.statusText || null;
}

