import type { Checked, Data, Draft } from "./types";

export class ApiError extends Error {
  status: number;
  details: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function call(path: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError(0, "The server did not answer. Check the connection and try again.");
  }
  if (!res.ok) {
    const body = res.headers.get("content-type")?.includes("json") ? await res.json() : null;
    throw new ApiError(res.status, body?.error?.message ?? `Request failed (${res.status})`, body?.error?.details);
  }
  return res;
}

const post = (path: string, draft: Draft) =>
  call(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
    ...draft, lines: draft.lines.map(({ id: _id, ...line }) => line),
  }) });

export const api = {
  data: async (): Promise<Data> => (await call("/api/data")).json(),
  check: async (draft: Draft): Promise<Checked> => (await post("/api/quote/check", draft)).json(),
  file: async (draft: Draft, kind: "pdf" | "docx"): Promise<Blob> => (await post(`/api/quote/${kind}`, draft)).blob(),
};

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
