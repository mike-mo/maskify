const _DOMAIN_CHARS_RE = /^[a-z0-9.-]+$/;

function isValidDomain(value) {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.length > 253) return false;
  if (!_DOMAIN_CHARS_RE.test(normalized)) return false;
  const labels = normalized.split('.');
  if (labels.length < 2) return false;
  if (labels.some(label => !label || label.length > 63 || label.startsWith('-') || label.endsWith('-'))) return false;
  return true;
}
