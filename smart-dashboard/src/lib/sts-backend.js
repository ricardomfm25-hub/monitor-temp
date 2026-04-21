export function getStsBackendBaseUrl() {
  const baseUrl = process.env.STS_BACKEND_URL;

  if (!baseUrl) {
    throw new Error("STS_BACKEND_URL não está definida.");
  }

  return baseUrl.replace(/\/+$/, "");
}

export function getStsBackendApiToken() {
  const token = process.env.STS_BACKEND_API_TOKEN;

  if (!token) {
    throw new Error("STS_BACKEND_API_TOKEN não está definida.");
  }

  return token;
}

export async function stsBackendFetch(path, options = {}) {
  const baseUrl = getStsBackendBaseUrl();
  const token = getStsBackendApiToken();

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    cache: "no-store",
  });

  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");

  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const message =
      typeof payload === "object" && payload?.error
        ? payload.error
        : `Erro HTTP ${response.status}`;

    throw new Error(message);
  }

  return payload;
}