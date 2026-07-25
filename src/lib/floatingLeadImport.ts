export const FLOATING_LEAD_IMPORT_HEADERS = [
  "customer_name",
  "phone",
  "address",
  "loai_cay_trong",
  "dien_tich",
  "tinh_trang_cay_trong",
  "giai_doan_cay_trong",
] as const;

export type FloatingLeadImportHeader = (typeof FLOATING_LEAD_IMPORT_HEADERS)[number];

const MOJIBAKE_PATTERN = /(?:Ã[\u0080-\u00bf]|Â[\u0080-\u00bf]|Ä[\u0080-\u00bf]|á»[\u0080-\u00bf]?|áº[\u0080-\u00bf]?|�)/u;

export function normalizeImportedPhone(value: unknown) {
  let phone = String(value ?? "")
    .trim()
    .replace(/[^\d+]/g, "");

  if (phone.startsWith("+84")) phone = `0${phone.slice(3)}`;
  else if (phone.startsWith("84")) phone = `0${phone.slice(2)}`;

  phone = phone.replace(/\D/g, "");
  if (/^[35789]\d{8}$/.test(phone)) phone = `0${phone}`;
  return phone;
}

export function isValidImportedPhone(phone: string) {
  return /^0\d{9}$/.test(phone);
}

export function normalizeImportHeader(value: unknown) {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function containsCsvMojibake(value: string) {
  return MOJIBAKE_PATTERN.test(value);
}

type DecodedCsv = {
  text: string;
  encoding: string;
  utf8DecodeSucceeded: boolean;
};

export function decodeCsvArrayBuffer(buffer: ArrayBuffer): DecodedCsv {
  const bytes = new Uint8Array(buffer);

  const utf8 = decode(bytes, "utf-8");
  if (utf8 !== null) {
    return {
      text: utf8,
      encoding: "utf-8",
      utf8DecodeSucceeded: true,
    };
  }

  const candidates: Array<{ text: string; encoding: string }> = [];
  for (const encoding of ["windows-1258", "windows-1252"]) {
    const text = decode(bytes, encoding);
    if (text !== null) candidates.push({ text, encoding });
  }

  const selected = candidates.sort((a, b) => encodingScore(a.text) - encodingScore(b.text))[0] ?? {
    text: new TextDecoder().decode(bytes),
    encoding: "fallback",
  };

  return {
    ...selected,
    utf8DecodeSucceeded: false,
  };
}

export function parseCsvAsStrings(text: string) {
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  row.push(cell);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
}

export function rowsToImportObjects(rows: unknown[][]) {
  if (!rows.length) return [];
  const headers = rows[0].map(normalizeImportHeader);
  return rows.slice(1).map((cells) =>
    headers.reduce<Record<string, string>>((record, header, index) => {
      if (header) record[header] = String(cells[index] ?? "");
      return record;
    }, {}),
  );
}

export function buildFloatingLeadCsvTemplate() {
  const sample = [
    "Nguyễn Văn A",
    '="0325000774"',
    "Thôn Đông, xã Minh Tân, Hà Nội",
    "Cây lúa",
    "2 ha",
    "Đang sinh trưởng",
    "Làm đòng",
  ];
  return `\uFEFF${[FLOATING_LEAD_IMPORT_HEADERS, sample]
    .map((row) => row.map(escapeCsvCell).join(","))
    .join("\r\n")}`;
}

function decode(bytes: Uint8Array, encoding: string) {
  try {
    return new TextDecoder(encoding, { fatal: encoding === "utf-8" }).decode(bytes);
  } catch {
    return null;
  }
}

function encodingScore(value: string) {
  const mojibakeMatches = value.match(/(?:Ã|Â|Ä|á»|áº|�)/gu)?.length ?? 0;
  const controlCharacters = Array.from(value).filter((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 && code !== 9 && code !== 10 && code !== 13;
  }).length;
  return mojibakeMatches * 100 + controlCharacters * 10;
}

function detectDelimiter(text: string) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const counts = ([",", ";", "\t"] as const).map((delimiter) => ({
    delimiter,
    count: countOutsideQuotes(firstLine, delimiter),
  }));
  return counts.sort((a, b) => b.count - a.count)[0]?.delimiter ?? ",";
}

function countOutsideQuotes(value: string, delimiter: string) {
  let quoted = false;
  let count = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '"') quoted = !quoted;
    else if (value[index] === delimiter && !quoted) count += 1;
  }
  return count;
}

function escapeCsvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}
