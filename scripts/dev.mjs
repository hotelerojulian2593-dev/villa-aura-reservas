// Servidor de desarrollo. Imita lo justo de Vercel: estáticos de public/ con
// cleanUrls y funciones de api/ con req.query, req.body y res.status().json().
//   npm run dev:falso  → Airtable en memoria con datos demo (PIN 123456)
//   npm run dev        → Airtable real con las variables de .env.local
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { crearClienteFalso, sembrarDemo } from '../lib/airtable-falso.js';
import { hoyBogota } from '../public/js/fechas.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publico = path.join(raiz, 'public');
const usarFalso = process.argv.includes('--falso');
const puerto = Number(process.env.PORT || 3000);
const deps = {};

if (usarFalso) {
  process.env.PIN_SENORAS ||= '123456';
  process.env.PIN_GERENCIA ||= '654321';
  deps.env = process.env;
  deps.cliente = crearClienteFalso();
  await sembrarDemo(deps.cliente, hoyBogota());
}

const tipos = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};

async function servirEstatico(ruta, res) {
  let archivo = path.normalize(path.join(publico, decodeURIComponent(ruta)));
  if (!archivo.startsWith(publico)) { res.writeHead(403); return res.end('Prohibido'); }
  try {
    const info = await stat(archivo);
    if (info.isDirectory()) archivo = path.join(archivo, 'index.html');
  } catch {
    if (!path.extname(archivo)) archivo += '.html'; // cleanUrls
  }
  try {
    const cuerpo = await readFile(archivo);
    res.writeHead(200, { 'Content-Type': tipos[path.extname(archivo)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    return res.end(cuerpo);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('No encontrado');
  }
}

function leerCuerpo(req) {
  return new Promise((resolver) => {
    let datos = '';
    req.on('data', (trozo) => { datos += trozo; });
    req.on('end', () => {
      try { resolver(datos ? JSON.parse(datos) : undefined); } catch { resolver(undefined); }
    });
  });
}

const manejadores = new Map();
async function manejadorDe(nombre) {
  if (!manejadores.has(nombre)) {
    const modulo = await import(pathToFileURL(path.join(raiz, 'api', `${nombre}.js`)).href);
    manejadores.set(nombre, usarFalso ? modulo.crearHandler(deps) : modulo.default);
  }
  return manejadores.get(nombre);
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${puerto}`);
  if (!url.pathname.startsWith('/api/')) return servirEstatico(url.pathname, res);

  const nombre = url.pathname.slice(5).replace(/[^a-z-]/g, '');
  let fn;
  try { fn = await manejadorDe(nombre); } catch {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: false, error: 'Endpoint no existe.' }));
  }
  req.query = Object.fromEntries(url.searchParams);
  req.body = await leerCuerpo(req);
  res.status = (codigo) => { res.statusCode = codigo; return res; };
  res.json = (objeto) => { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(objeto)); return res; };
  try {
    await fn(req, res);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.status(500).json({ ok: false, error: 'Error del servidor de desarrollo.' });
  }
}).listen(puerto, () => {
  console.log(`Villa Aura en http://localhost:${puerto} ${usarFalso ? '· Airtable FALSO (PIN 123456 · gerencia 654321)' : '· Airtable real (.env.local)'}`);
});
