const credentialSignature = /(?:sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/
const timestamp = /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?/
const httpsUrl = /https:\/\/[^\s<>"']+/g
const machinePath = /(?:^|[^A-Za-z0-9._~-])(?:\/{1,2}|~[\\/]|[A-Za-z]:[\\/]|\\\\[^\\/\s]+[\\/])[^\s<>"'`]+/

export function isPortableText(value: string): boolean {
  return isPersistenceSafeText(value) && !timestamp.test(value)
}

export function isPersistenceSafeText(value: string): boolean {
  if (credentialSignature.test(value)) return false
  return !machinePath.test(value.replace(httpsUrl, ""))
}
