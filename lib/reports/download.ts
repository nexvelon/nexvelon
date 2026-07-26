// REP-1 — the ONE client-side download helper (Safari-safe synthetic-anchor +
// object URL), replacing the ~8 duplicated blob-download blocks. CSV is text;
// xlsx/pdf are base64 → bytes. REP-2 migrates the remaining financial-tab
// download sites to this.

export interface ReportDownload {
  data: string;
  filename: string;
  mime: string;
  encoding: "text" | "base64";
}

export function downloadReport(exp: ReportDownload): void {
  const blob =
    exp.encoding === "base64"
      ? new Blob([Uint8Array.from(atob(exp.data), (c) => c.charCodeAt(0))], { type: exp.mime })
      : new Blob([exp.data], { type: exp.mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = exp.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
