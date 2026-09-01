#!/usr/bin/env node
import https from 'node:https';
import fs from 'node:fs';

const key = fs.readFileSync(process.env.FAKE_TLS_KEY ?? '/tmp/fake-zalo.key');
const cert = fs.readFileSync(process.env.FAKE_TLS_CERT ?? '/tmp/fake-zalo.crt');
const modeFile = '/tmp/zalo-refund-mode';
const knownRefunds = new Set();
let refundSeq = 700000000;

function mode() {
  try { return fs.readFileSync(modeFile, 'utf8').trim() || 'success'; }
  catch { return 'success'; }
}
function send(res, body, status = 200) {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(json) });
  res.end(json);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (c) => raw += c);
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

const server = https.createServer({ key, cert }, async (req, res) => {
  try {
    const body = await readBody(req);
    console.log(`[fake-zalo] ${req.method} ${req.url} mode=${mode()} body=${JSON.stringify(body)}`);
    if (req.method === 'POST' && req.url === '/v2/create') {
      return send(res, { return_code: 1, return_message: 'success', order_url: 'https://fake-zalopay.local/pay' });
    }
    if (req.method === 'POST' && req.url === '/v2/refund') {
      const id = String(body.m_refund_id ?? '');
      if (id) knownRefunds.add(id);
      if (mode() === 'success') return send(res, { return_code: 1, refund_id: ++refundSeq });
      return send(res, { return_code: 3, return_message: 'processing' });
    }
    if (req.method === 'POST' && req.url === '/v2/query_refund') {
      const id = String(body.m_refund_id ?? '');
      if (!knownRefunds.has(id)) return send(res, { return_code: 2 });
      const m = mode();
      return send(res, { return_code: m === 'success' ? 1 : m === 'pending' ? 3 : 2 });
    }
    if (req.method === 'POST' && req.url === '/v2/query') {
      return send(res, { return_code: 3, amount: 0 });
    }
    return send(res, { return_code: 2, return_message: 'unknown diagnostic endpoint' }, 404);
  } catch (error) {
    console.error(error);
    send(res, { return_code: 2, return_message: 'diagnostic fake error' }, 500);
  }
});

server.listen(443, '0.0.0.0', () => console.log('[fake-zalo] listening on https://0.0.0.0:443'));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
