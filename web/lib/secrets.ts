/** Server-side masking for messages and research logs; stored credentials stay intact. */
export function redactSecrets(text: string): string {
  const secrets = Object.entries(process.env)
    .filter(([name, value]) => /(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i.test(name) && value?.trim())
    .map(([, value]) => value!.trim())
    .sort((a, b) => b.length - a.length);
  let result = text;
  for (const secret of secrets) result = result.split(secret).join("[REDACTED]");
  return result
    .replace(/AIza[\w-]{25,}/g, "[REDACTED]")
    .replace(/\bsk-[\w-]{20,}/g, "[REDACTED]");
}
