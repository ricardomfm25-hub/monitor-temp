"use client";

export const UNKNOWN_FIRMWARE_VERSION = "Versao nao identificada";

export function normalizeFirmwareVersion(value) {
  const text = String(value || "").trim();
  if (!text) return UNKNOWN_FIRMWARE_VERSION;

  const semanticVersion = text.match(/v?\d+\.\d+\.\d+/i)?.[0];
  if (semanticVersion) {
    return semanticVersion.toUpperCase().startsWith("V")
      ? semanticVersion.toUpperCase()
      : `V${semanticVersion}`;
  }

  return text;
}

export function FirmwareVersionBadge({ value, style, unknownStyle, label = "Firmware" }) {
  const version = normalizeFirmwareVersion(value);
  const unknown = version === UNKNOWN_FIRMWARE_VERSION;

  return (
    <span
      title={`${label}: ${version}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 0,
        maxWidth: "100%",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        ...(style || {}),
        ...(unknown ? unknownStyle || {} : {}),
      }}
    >
      {version}
    </span>
  );
}
