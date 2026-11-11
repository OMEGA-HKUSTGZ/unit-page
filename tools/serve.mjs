#!/usr/bin/env node
// Serve the page on your own machine the way it is published: the page at /projects/unit/
// and the point clouds at /unit-media/point-clouds/, with HTTP Range, which the viewer requires.
//
//   node tools/serve.mjs [port] [page-path]
//   node tools/serve.mjs 4390 /preview/site-pr-1/projects/unit/    # the depth of a preview
//
// Point clouds come from assets/media/point-clouds/ when the files are there, otherwise they
// are passed through from the published media site. Other lab-site links go to the official site.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.argv[2] ?? 4390);
const base = `/${(process.argv[3] ?? '/projects/unit/').split('/').filter(Boolean).join('/')}/`;
const MEDIA = '/unit-media/point-clouds/';
const SITE = 'https://omega-hkustgz.github.io';
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

function sendFile(request, response, file) {
  const { size } = statSync(file);
  const headers = { 'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range ?? '');
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start > end || start >= size) return void response.writeHead(416, { 'Content-Range': `bytes */${size}` }).end();
    response.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
    return void createReadStream(file, { start, end }).pipe(response);
  }
  response.writeHead(200, { ...headers, 'Content-Length': size });
  createReadStream(file).pipe(response);
}

async function passThrough(request, response, path, search) {
  const upstream = await fetch(`${SITE}${path}${search}`, { headers: request.headers.range ? { Range: request.headers.range } : {} });
  const headers = { 'Cache-Control': 'no-store' };
  for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
    if (upstream.headers.get(name)) headers[name] = upstream.headers.get(name);
  }
  response.writeHead(upstream.status, headers);
  if (upstream.body) Readable.fromWeb(upstream.body).pipe(response);
  else response.end();
}

createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  const path = decodeURIComponent(url.pathname);
  const inside = (folder, rest) => {
    const file = normalize(join(folder, rest));
    return file === folder || file.startsWith(folder + sep) ? file : null;
  };
  if (path.startsWith(MEDIA)) {
    const file = inside(join(root, 'assets/media/point-clouds'), path.slice(MEDIA.length));
    if (!file) return void response.writeHead(403).end();
    if (existsSync(file) && statSync(file).isFile()) return void sendFile(request, response, file);
    return void passThrough(request, response, path, url.search).catch(() => response.writeHead(502).end('Media site unreachable'));
  }
  if (!path.startsWith(base)) {
    return void response.writeHead(302, { Location: path === '/' ? base : `${SITE}${path}` }).end();
  }
  let file = inside(root, path.slice(base.length));
  if (!file) return void response.writeHead(403).end();
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) return void response.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  sendFile(request, response, file);
}).listen(port, '127.0.0.1', () => console.log(`UniT page: http://127.0.0.1:${port}${base}`));
