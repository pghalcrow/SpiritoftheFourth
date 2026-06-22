export function buildFormEmailSubject(formTitle: string, name?: string, email?: string): string {
  const cleanTitle = String(formTitle || '').trim();
  const cleanName = String(name || '').trim();
  const cleanEmail = String(email || '').trim();
  const details: string[] = [];

  if (cleanName) details.push(`Name: ${cleanName}`);
  if (cleanEmail) details.push(`Email: ${cleanEmail}`);

  return details.length ? `${cleanTitle} - ${details.join(' | ')}` : cleanTitle;
}
