/* global URL, location, Response, Event */
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Smoke test for the production bundle. Uses a disposable browser profile and synthetic API responses.
const root = path.resolve('web/dist');
const browser =
  process.env.BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const profile = mkdtempSync(path.join(tmpdir(), 'erp-export-test-'));
function mockApi() {
  const fetchOriginal = window.fetch.bind(window);
  let failed = false;
  let releaseSlow;
  window.releaseSlowOrder = () => releaseSlow?.();
  window.fetch = async (url, options) => {
    const u = new URL(url, location.origin);
    if (!u.pathname.startsWith('/api/')) return fetchOriginal(url, options);
    let data = {};
    let status = 200;
    if (u.pathname.endsWith('/me')) data = { user: { id: 1, username: 'fixture', role: 'admin' } };
    if (u.pathname.endsWith('/batches'))
      data = {
        batches: [
          { id: 1, name: 'A' },
          { id: 2, name: 'B' },
        ],
      };
    if (u.pathname.endsWith('/logout')) status = 503;
    if (u.pathname.endsWith('/orders')) {
      if (u.searchParams.get('batch_id') === '1') {
        await new Promise((resolve) => {
          releaseSlow = resolve;
          window.slowOrderPending = true;
        });
        data = { orders: [] };
      } else if (u.searchParams.has('batch_id') && !failed) {
        failed = true;
        status = 503;
      } else data = { orders: [{ id: 1, resi: 'FIXTURE', items: [], status: 'dikemas' }] };
    }
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  };
}
async function checkExport() {
  const waitFor = async (predicate, message) => {
    for (let i = 0; i < 120; i++) {
      if (predicate()) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw Error(message);
  };
  try {
    const download = () =>
      [...document.querySelectorAll('button')].find((b) =>
        b.textContent.includes('Unduh Laporan CSV')
      );
    await waitFor(() => download() && !download().disabled, 'initial export unavailable');
    const select = document.querySelector('select');
    select.value = '2';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await waitFor(() => document.querySelector('[role=alert]'), 'missing error feedback');
    if (!download().disabled) throw Error('stale download enabled');
    document.querySelector('[role=alert] button').click();
    await waitFor(
      () => !download().disabled && !document.querySelector('[role=alert]'),
      'retry failed'
    );
    select.value = '1';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await waitFor(() => window.slowOrderPending, 'missing slow request');
    select.value = '2';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await waitFor(() => !download().disabled, 'latest batch not ready');
    window.releaseSlowOrder();
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (download().disabled) throw Error('old response replaced current batch');
    let logoutMessage = '';
    window.alert = (message) => {
      logoutMessage = message;
    };
    document.querySelector('button[title="Keluar dari sistem"]').click();
    await waitFor(() => logoutMessage.includes('Sesi'), 'failed logout missing feedback');
    if (location.pathname !== '/export') throw Error('session cleared on failed logout');
    await fetch('/pass');
  } catch (err) {
    await fetch('/fail?reason=' + encodeURIComponent(err.message));
  }
}
let edge;
let finish;
const result = new Promise((resolve) => {
  finish = resolve;
});
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (['/pass', '/fail'].includes(url.pathname)) {
    res.end();
    finish(url.pathname === '/pass' ? null : url.searchParams.get('reason'));
    return;
  }
  if (url.pathname === '/export') {
    res.setHeader('Content-Type', 'text/html');
    res.end(
      readFileSync(path.join(root, 'index.html'), 'utf8')
        .replace('<head>', `<head><script>(${mockApi})()</script>`)
        .replace('</body>', `<script>(${checkExport})()</script></body>`)
    );
    return;
  }
  const asset = path.resolve(root, '.' + url.pathname);
  if (!asset.startsWith(root + path.sep)) {
    res.writeHead(404).end();
    return;
  }
  try {
    const contents = readFileSync(asset);
    res.setHeader(
      'Content-Type',
      asset.endsWith('.js')
        ? 'application/javascript'
        : asset.endsWith('.css')
          ? 'text/css'
          : 'application/octet-stream'
    );
    res.end(contents);
  } catch {
    res.writeHead(404).end();
  }
});
const timeout = setTimeout(() => finish('browser timed out'), 30000);
try {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  edge = spawn(
    browser,
    [
      '--headless',
      '--disable-gpu',
      '--no-first-run',
      '--user-data-dir=' + profile,
      'http://127.0.0.1:' + server.address().port + '/export',
    ],
    { stdio: 'ignore', windowsHide: true }
  );
  edge.on('error', (err) => finish(err.message));
  edge.on('exit', () => finish('browser exited before verification'));
  const error = await result;
  if (error) throw Error(error);
  console.log('Export batch switch, failed fetch, blocked CSV and retry passed.');
} finally {
  clearTimeout(timeout);
  server.closeAllConnections();
  server.close();
  if (edge?.pid && edge.exitCode === null) {
    const stopped = new Promise((resolve) => edge.once('exit', resolve));
    edge.kill();
    await stopped;
  }
  if (path.dirname(profile) === tmpdir() && path.basename(profile).startsWith('erp-export-test-'))
    rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
