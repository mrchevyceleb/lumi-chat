import JSZip from "npm:jszip@3.10.1";
import pdfParse from "npm:pdf-parse@1.1.1";
import { Buffer } from "node:buffer";

export type IncomingFile = {
  name: string;
  mimeType?: string;
  data?: string; // base64
  path?: string;
  bucket?: string;
  size?: number;
};

export type ParsedFile = {
  name: string;
  mimeType: string;
  size?: number;
  path?: string;
  bucket?: string;
  kind: "pdf" | "zip" | "text" | "image" | "other";
  zipEntryPath?: string;
  text?: string;
  truncated?: boolean;
  warning?: string;
};

const TEXT_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
]);

const MAX_TEXT_CHARS_PER_FILE = 40000;
const MAX_ENTRIES_PER_ZIP = 25;

export function normalizeMimeType(file: IncomingFile): string {
  if (file.mimeType) return file.mimeType;
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".zip")) return "application/zip";
  if (lower.endsWith(".md")) return "text/markdown";
  if (lower.endsWith(".txt")) return "text/plain";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".csv")) return "text/csv";
  return "application/octet-stream";
}

export function truncateText(text: string) {
  if (text.length <= MAX_TEXT_CHARS_PER_FILE) {
    return { text, truncated: false };
  }
  return {
    text: `${text.slice(0, MAX_TEXT_CHARS_PER_FILE)}\n\n[truncated for length]`,
    truncated: true,
  };
}

async function parsePdf(buffer: Uint8Array): Promise<{ text: string; truncated: boolean }> {
  const { text = "" } = await pdfParse(Buffer.from(buffer));
  return truncateText(text);
}

function parseTextBuffer(buffer: Uint8Array): { text: string; truncated: boolean } {
  const decoded = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  return truncateText(decoded);
}

export async function parseZip(buffer: Uint8Array): Promise<ParsedFile[]> {
  const zip = await JSZip.loadAsync(buffer);
  const parsed: ParsedFile[] = [];
  let count = 0;

  const entries = Object.values(zip.files);
  for (const entry of entries) {
    if (entry.dir) continue;
    if (count >= MAX_ENTRIES_PER_ZIP) break;

    const entryName = entry.name;
    const lower = entryName.toLowerCase();
    const isPdf = lower.endsWith(".pdf");
    const isText = /\.(md|txt|csv|json)$/i.test(lower);

    if (!isPdf && !isText) {
      parsed.push({
        name: entryName,
        mimeType: "application/octet-stream",
        kind: "other",
        zipEntryPath: entryName,
        warning: "Skipped unsupported file type inside zip",
      });
      continue;
    }

    const data = new Uint8Array(await entry.async("uint8array"));
    if (isPdf) {
      const { text, truncated } = await parsePdf(data);
      parsed.push({
        name: entryName,
        mimeType: "application/pdf",
        kind: "pdf",
        zipEntryPath: entryName,
        text,
        truncated,
      });
    } else {
      const { text, truncated } = parseTextBuffer(data);
      parsed.push({
        name: entryName,
        mimeType: "text/plain",
        kind: "text",
        zipEntryPath: entryName,
        text,
        truncated,
      });
    }

    count += 1;
  }

  return parsed;
}

export async function parseIncomingFile(
  file: IncomingFile,
  fetchFile: (path: string, bucket: string) => Promise<Uint8Array>
): Promise<ParsedFile[]> {
  const mimeType = normalizeMimeType(file);

  // Inline image: just surface metadata, no parsing
  if (mimeType.startsWith("image/") && file.data) {
    return [
      {
        name: file.name,
        mimeType,
        size: file.size,
        path: file.path,
        bucket: file.bucket,
        kind: "image",
      },
    ];
  }

  // Load bytes either from base64 or storage
  let bytes: Uint8Array;
  if (file.data) {
    bytes = new Uint8Array(Buffer.from(file.data, "base64"));
  } else if (file.path && file.bucket) {
    bytes = await fetchFile(file.path, file.bucket);
  } else {
    return [
      {
        name: file.name,
        mimeType,
        kind: "other",
        warning: "File missing data or storage reference",
      },
    ];
  }

  if (mimeType === "application/pdf") {
    const { text, truncated } = await parsePdf(bytes);
    return [
      {
        name: file.name,
        mimeType,
        size: file.size,
        path: file.path,
        bucket: file.bucket,
        kind: "pdf",
        text,
        truncated,
      },
    ];
  }

  if (mimeType === "application/zip") {
    const parsed = await parseZip(bytes);
    return parsed.map((p) => ({
      ...p,
      size: p.size ?? file.size,
      path: file.path,
      bucket: file.bucket,
      kind: p.kind,
    }));
  }

  if (TEXT_TYPES.has(mimeType) || mimeType.startsWith("text/")) {
    const { text, truncated } = parseTextBuffer(bytes);
    return [
      {
        name: file.name,
        mimeType,
        size: file.size,
        path: file.path,
        bucket: file.bucket,
        kind: "text",
        text,
        truncated,
      },
    ];
  }

  return [
    {
      name: file.name,
      mimeType,
      size: file.size,
      path: file.path,
        bucket: file.bucket,
      kind: "other",
      warning: `Unsupported file type: ${mimeType}`,
    },
  ];
}

