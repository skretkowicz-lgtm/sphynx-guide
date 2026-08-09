// Generates the actual file bytes for the seeded documents.
//
// The documents list in profile.html is only half the feature — clicking a
// row asks Storage for a signed URL, so a seeded row with no object behind
// it gives the tester a 404 instead of a file. These builders produce small
// but genuinely valid PDFs and PNGs, so downloads open in a real viewer.
//
// Both are written by hand rather than pulled from a dependency: the whole
// project has five runtime dependencies and none of them is a document
// library, and a checked-in binary fixture is a thing nobody can review.

const zlib = require('zlib');

// PDF text here is written with the base-14 Helvetica font, which is encoded
// as WinAnsi — and WinAnsi has no ł, ą, ę, ś, ż, ź, ć or ń. Rather than ship
// a font file to say four Polish sentences, Polish document text is folded to
// ASCII. It reads as a transliteration, not as mojibake.
const ASCII_FOLD = {
  ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z',
  Ą: 'A', Ć: 'C', Ę: 'E', Ł: 'L', Ń: 'N', Ó: 'O', Ś: 'S', Ź: 'Z', Ż: 'Z',
  '—': '-', '–': '-', '’': "'", '“': '"', '”': '"',
};

function toAscii(text) {
  return String(text).replace(/[^\x20-\x7e]/g, (char) => ASCII_FOLD[char] || '?');
}

function escapePdfText(text) {
  return toAscii(text).replace(/[\\()]/g, (char) => '\\' + char);
}

// A single-page A4 PDF: title, then body lines at 11pt. Long lines are wrapped
// at a character count rather than measured, which is crude but predictable
// and cannot overflow the page for the short paragraphs used here.
function buildPdf({ title, lines }) {
  const WRAP = 92;
  const wrapped = [];
  lines.forEach((line) => {
    if (!line) {
      wrapped.push('');
      return;
    }
    let current = '';
    toAscii(line).split(' ').forEach((word) => {
      if (current && (current + ' ' + word).length > WRAP) {
        wrapped.push(current);
        current = word;
      } else {
        current = current ? current + ' ' + word : word;
      }
    });
    if (current) wrapped.push(current);
  });

  let y = 780;
  let stream = `BT /F1 16 Tf 56 ${y} Td (${escapePdfText(title)}) Tj ET\n`;
  y -= 34;
  wrapped.forEach((line) => {
    if (line) stream += `BT /F1 11 Tf 56 ${y} Td (${escapePdfText(line)}) Tj ET\n`;
    y -= 16;
  });

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] '
      + '/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ];

  // The xref table stores a byte offset per object, so the body has to be
  // assembled before the table can be written.
  let body = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(body);
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((offset) => {
    xref += String(offset).padStart(10, '0') + ' 00000 n \n';
  });
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`
    + `startxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(body + xref, 'latin1');
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

// Truecolour 8-bit PNG. `pixel(x, y)` returns [r, g, b]; every scanline is
// prefixed with filter byte 0 (none), which is what deflate expects.
function buildPng({ width, height, pixel }) {
  const raw = Buffer.alloc(height * (1 + width * 3));
  let at = 0;
  for (let y = 0; y < height; y += 1) {
    raw[at] = 0;
    at += 1;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = pixel(x, y);
      raw[at] = r; raw[at + 1] = g; raw[at + 2] = b;
      at += 3;
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;  // bit depth
  header[9] = 2;  // colour type: truecolour
  // 10-12 stay zero: deflate compression, adaptive filtering, no interlace.

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// The patterns the seeded images use. Each one is deliberately abstract —
// these stand in for a photo a client would upload, and inventing a
// photorealistic cat is not what this script is for.
const PATTERNS = {
  // Warm room-temperature map: the kind of thing a Sphynx owner photographs.
  warmth: (width, height) => (x, y) => {
    const cx = width * 0.62;
    const cy = height * 0.38;
    const distance = Math.hypot(x - cx, y - cy) / Math.hypot(width, height);
    const heat = Math.max(0, 1 - distance * 2.1);
    return [
      Math.round(48 + heat * 200),
      Math.round(42 + heat * 120),
      Math.round(70 + heat * 40),
    ];
  },
  // Banded plot, as a stand-in for a scanned chart or a weight graph.
  chart: (width, height) => (x, y) => {
    const band = Math.floor((y / height) * 6);
    const wave = Math.sin((x / width) * Math.PI * 2 + band) * 0.5 + 0.5;
    return [
      Math.round(30 + wave * 60),
      Math.round(90 + band * 18),
      Math.round(120 + wave * 90),
    ];
  },
  // Soft grid, standing in for a photo of a room layout.
  layout: (width, height) => (x, y) => {
    const grid = x % 48 < 2 || y % 48 < 2 ? 0.35 : 0;
    const base = 210 - (y / height) * 60;
    return [
      Math.round(base - grid * 120),
      Math.round(base - 10 - grid * 100),
      Math.round(base - 26 - grid * 70),
    ];
  },
};

// Turns a document spec from demo-dataset.js into real bytes.
function renderFile(spec) {
  if (spec.kind === 'pdf') return buildPdf(spec);
  if (spec.kind === 'png') {
    const width = spec.width || 480;
    const height = spec.height || 320;
    return buildPng({ width, height, pixel: PATTERNS[spec.pattern](width, height) });
  }
  throw new Error(`Unknown demo file kind: ${spec.kind}`);
}

module.exports = { renderFile, buildPdf, buildPng, toAscii };
