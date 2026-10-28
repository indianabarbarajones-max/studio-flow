import { build } from 'vite';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const outDir = resolve('.data/portable-build');
await build({
  mode: 'portable',
  plugins: [{ name: 'portable-entry', transformIndexHtml: { order: 'pre', handler: html => html.replace('/src/main.tsx', '/src/portable-entry.tsx') } }],
  build: { outDir, assetsInlineLimit: 1000000, cssCodeSplit: false, rollupOptions: { output: { inlineDynamicImports: true } } },
});
let html = await readFile(resolve(outDir, 'index.html'), 'utf8');
const jsPath = html.match(/<script[^>]+src="([^"]+)"[^>]*><\/script>/)?.[1];
const cssPath = html.match(/<link[^>]+href="([^"]+\.css)"[^>]*>/)?.[1];
if (!jsPath || !cssPath) throw new Error('Não foi possível localizar os arquivos da demonstração.');
const js = await readFile(resolve(outDir, jsPath.replace(/^\//, '')), 'utf8');
const css = await readFile(resolve(outDir, cssPath.replace(/^\//, '')), 'utf8');
html = html.replace(/<script[^>]+src="[^"]+"[^>]*><\/script>/, () => `<script type="module">${js.replace(/<\/script/gi, '<\\/script')}</script>`);
html = html.replace(/<link[^>]+href="[^"]+\.css"[^>]*>/, () => `<style>${css}</style>`);
html = html.replace('<title>Studio Flow · Gestão de Yoga</title>', '<title>Studio Flow · Demonstração</title>');
html = html.replace('<div id="root"></div>', '<div id="root"><p style="padding:32px;font-family:Arial,sans-serif">Abrindo o Studio Flow… Se esta mensagem continuar, abra este arquivo no Chrome, Edge ou Safari. O visualizador de anexos não executa o aplicativo.</p></div>');
if (/\b(?:src|href)="\/assets\//.test(html) || /url\(["']?\/assets\//.test(html)) throw new Error('A demonstração ainda depende de arquivos externos.');
const destination = resolve('.data/Studio-Flow-Abrir.html');
await writeFile(destination, html);
console.log(`Demonstração em um arquivo: ${destination}`);
