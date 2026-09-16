import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const index = new URL('index.html', root);
let html = await readFile(index, 'utf8');
const references = [...html.matchAll(/(?:src|href)="([^"?]+\.(?:js|css))(?:\?[^" ]*)?"/g)];
for (const [attribute, path] of references) {
  const content = await readFile(new URL(path, root));
  const version = createHash('sha256').update(content).digest('hex').slice(0, 12);
  html = html.replace(attribute, attribute.replace(/=".*"$/, `="${path}?v=${version}"`));
}
await writeFile(index, html);
