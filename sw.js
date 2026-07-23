'use strict';
/*
 * Service Worker（単一ファイル構成の独立ホスティング版）
 * - アプリのシェル（index.html / manifest / アイコン）をキャッシュしてオフライン起動を可能にする
 * - GAS WebApp(データAPI)へのリクエストはキャッシュしない（別オリジンかつ常に最新が必要）
 * 参照: docs/spec.md §8 PWA要件
 */
const CACHE_VERSION = 'web-v19';
const CACHE_NAME = 'telesales-board-' + CACHE_VERSION;

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-180.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // GAS WebAppへのPOST等は素通し
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // GAS WebApp(別オリジン)は素通し＝常にネットワーク

  // HTML（画面本体）はネットワーク優先: オンライン時は常に最新を表示し、更新を確実に届ける。
  // オフライン時のみキャッシュにフォールバックする。
  const isHtml = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html') ||
    url.pathname.endsWith('/') || url.pathname.endsWith('index.html');

  if (isHtml) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => caches.match(req).then((c) => c || caches.match('./index.html')))
    );
    return;
  }

  // 静的資産（アイコン/manifest等）はキャッシュ優先＋裏で更新。
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

// Background Sync対応環境向け: 開いているクライアントに送信キューのフラッシュを合図する
self.addEventListener('sync', (event) => {
  if (event.tag === 'flush-queue') {
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => client.postMessage({ type: 'FLUSH_QUEUE' }));
      })
    );
  }
});
