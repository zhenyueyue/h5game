import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const port = Number(process.env.PORT || process.argv[2] || 5173);
const host = process.env.HOST || '127.0.0.1';
const index = new URL('../dist/index.html', import.meta.url);
createServer(async (req, res) => {
  if (!['/', '/index.html'].includes(req.url?.split('?')[0])) return res.writeHead(404).end();
  try {
    const html = await readFile(index);
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(html);
  } catch {
    res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' }).end('Run npm run build\n');
  }
}).listen(port, host, () => console.log('http://' + host + ':' + port));
