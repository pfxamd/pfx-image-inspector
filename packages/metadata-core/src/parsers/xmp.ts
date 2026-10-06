export interface XmpParseResult {
  entries: Record<string, unknown>;
  packet: string;
}

export function parseXmpPacket(bytes: Uint8Array): XmpParseResult {
  const packet = new TextDecoder("utf-8").decode(bytes).replace(/\0+$/g, "");
  const entries: Record<string, unknown> = {
    XMPPacketLength: bytes.length,
  };

  extractAttributes(packet, entries);
  extractSimpleElements(packet, entries);
  extractRdfLists(packet, entries);

  return { entries, packet };
}

function extractAttributes(
  packet: string,
  entries: Record<string, unknown>,
): void {
  const pattern =
    /\b([A-Za-z_][\w.-]*):([A-Za-z_][\w.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;

  for (const match of packet.matchAll(pattern)) {
    const prefix = match[1] ?? "";
    const local = match[2] ?? "";
    if (prefix === "xmlns" || prefix === "rdf" || prefix === "xml") continue;

    const raw = match[4] ?? match[5] ?? "";
    setFirst(entries, local, decodeXml(raw));
  }
}

function extractSimpleElements(
  packet: string,
  entries: Record<string, unknown>,
): void {
  const pattern =
    /<([A-Za-z_][\w.-]*):([A-Za-z_][\w.-]*)\b[^>]*>([^<]+)<\/\1:\2\s*>/g;

  for (const match of packet.matchAll(pattern)) {
    const prefix = match[1] ?? "";
    const local = match[2] ?? "";
    if (prefix === "rdf" || prefix === "x") continue;

    const text = decodeXml((match[3] ?? "").trim());
    if (text.length > 0) setFirst(entries, local, text);
  }
}

function extractRdfLists(
  packet: string,
  entries: Record<string, unknown>,
): void {
  const propertyPattern =
    /<([A-Za-z_][\w.-]*):([A-Za-z_][\w.-]*)\b[^>]*>([\s\S]*?)<\/\1:\2\s*>/g;

  for (const match of packet.matchAll(propertyPattern)) {
    const prefix = match[1] ?? "";
    const local = match[2] ?? "";
    if (prefix === "rdf" || prefix === "x") continue;
    if (entries[local] !== undefined) continue;

    const body = match[3] ?? "";
    const item = /<rdf:li\b[^>]*>([\s\S]*?)<\/rdf:li\s*>/.exec(body);
    if (!item) continue;

    const text = decodeXml(stripTags(item[1] ?? "").trim());
    if (text.length > 0) setFirst(entries, local, text);
  }
}

function setFirst(
  entries: Record<string, unknown>,
  key: string,
  value: string,
): void {
  if (key.length === 0 || value.length === 0 || entries[key] !== undefined) return;
  entries[key] = value;
}

function decodeXml(value: string): string {
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#([0-9]+);/g, (_, decimal: string) =>
      String.fromCodePoint(Number.parseInt(decimal, 10)),
    )
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, " ");
}
