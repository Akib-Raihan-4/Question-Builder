"use client";

/**
 * POST a form with upload progress (fetch can't report it). Resolves with the status and the
 * JSON body; never rejects for HTTP errors, only for network failures.
 */
export function postWithProgress(url: string, body: FormData, onProgress: (fraction: number) => void): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.upload.onload = () => onProgress(1);
    xhr.onload = () => {
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(xhr.responseText || "{}");
      } catch {}
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, body: parsed });
    };
    xhr.onerror = () => reject(new Error("The upload didn't go through — check your connection and try again"));
    xhr.send(body);
  });
}
