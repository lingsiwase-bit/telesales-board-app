'use strict';
/*
 * Service Worker（単一ファイル構成の独立ホスティング版）
 * - アプリのシェル（index.html / manifest / アイコン）をキャッシュしてオフライン起動を可能にする
 * - GAS WebApp(データAPI)へのリクエストはキャッシュしない（別オリジンかつ常に最新が必要）
 * 参照: docs/spec.md §8 PWA要件
 */
const CACHE_VERSION = 'web-v1';
const CACHE_NAME = 'telesales-board-' + CACHE_VERSION;

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
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
