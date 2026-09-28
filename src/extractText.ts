// Text extraction by file format. Never throws: a bad file returns ok=false with an error.
export type Extracted = { name: string; format: string; text: string; ok: boolean; error: string };

// Below this many characters a CV is probably a scanned image or an empty file.
export const MIN_CHARS = 200;

function normalise(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").replace(/ /g, " ").split("\n").map((l) => l.split(/\s+/).filter(Boolean).join(" "));
  const out: string[] = [];
  let blank = 0;
  for (const l of lines) {
    blank = l ? 0 : blank + 1;
    if (blank <= 1) out.push(l);
  }
  return out.join("\n").trim();
}

function decodeText(buf: Buffer): string {
  // UTF-16 files start with a byte-order mark; everything else is read as UTF-8.
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.toString("utf16le");
  return new TextDecoder("utf-8").decode(buf);
}

async function raw(buf: Buffer, ext: string): Promise<string> {
  if (ext === "pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: false });
    return (text as string[]).join("\n");
  }
  if (ext === "docx") {
    // mammoth reads paragraphs and tables in document order, so a header laid out as a table stays on top.
    const mammoth = await import("mammoth");
    return (await mammoth.extractRawText({ buffer: buf })).value;
  }
  if (ext === "doc") {
    const WordExtractor = (await import("word-extractor")).default;
    const doc = await new WordExtractor().extract(buf);
    return doc.getBody();
  }
  if (ext === "txt" || ext === "md") return decodeText(buf);
  throw new Error(`unsupported format .${ext}`);
}

export async function extractText(name: string, buf: Buffer): Promise<Extracted> {
  const format = (name.split(".").pop() || "").toLowerCase();
  try {
    const text = normalise(await raw(buf, format));
    if (text.length < MIN_CHARS) return { name, format, text, ok: false, error: `too little text (${text.length} chars); scanned or empty?` };
    return { name, format, text, ok: true, error: "" };
  } catch (e) {
    return { name, format, text: "", ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
