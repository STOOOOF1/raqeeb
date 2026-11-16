// عامل الخدمة لتطبيق الوالدين: يستقبل إشعارات Push حتى والتطبيق مغلق
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data.json(); } catch { /* حمولة غير متوقعة */ }
  e.waitUntil(self.registration.showNotification(d.title || 'رقيب', {
    body: d.body || '', tag: d.tag || 'raqeeb', renotify: true,
    icon: 'icon-192.png', badge: 'icon-192.png', dir: 'rtl', lang: 'ar',
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = all.find((c) => c.url.includes('/parent/'));
    if (open) return open.focus();
    return self.clients.openWindow('./');
  })());
});
