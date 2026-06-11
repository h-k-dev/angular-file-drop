export const FILE_TYPES = {
  // ─── Documents ────────────────────────────────────────────────────────────
  PDF: '.pdf,application/pdf',
  TXT: '.txt,text/plain',
  RTF: '.rtf,application/rtf',
  DOC: '.doc,application/msword',
  DOCX: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document',

  // ─── Emails ───────────────────────────────────────────────────────────────
  EML: '.eml,message/rfc822',
  MSG: '.msg,application/vnd.ms-outlook',

  // ─── Spreadsheets ─────────────────────────────────────────────────────────
  CSV: '.csv,text/csv',
  XLS: '.xls,application/vnd.ms-excel',
  XLSX: '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',

  // ─── Presentations ────────────────────────────────────────────────────────
  PPT: '.ppt,application/vnd.ms-powerpoint',
  PPTX: '.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation',

  // ─── Images ───────────────────────────────────────────────────────────────
  PNG: '.png,image/png',
  JPG: '.jpg,.jpeg,image/jpeg',
  SVG: '.svg,image/svg+xml',
  WEBP: '.webp,image/webp',
  GIF: '.gif,image/gif',
  ANY_IMAGE: 'image/*',

  // ─── Archives ─────────────────────────────────────────────────────────────
  ZIP: '.zip,application/zip',
  RAR: '.rar,application/vnd.rar',
  SEVEN_ZIP: '.7z,application/x-7z-compressed',
  TAR: '.tar,application/x-tar',
  GZ: '.gz,application/gzip',

  // ─── Audio / Video ────────────────────────────────────────────────────────
  MP3: '.mp3,audio/mpeg',
  MP4: '.mp4,video/mp4',
  ANY_AUDIO: 'audio/*',
  ANY_VIDEO: 'video/*',

  // ─── Web / Data ───────────────────────────────────────────────────────────
  JSON: '.json,application/json',
  XML: '.xml,application/xml',
  HTML: '.html,.htm,text/html',
} as const;
