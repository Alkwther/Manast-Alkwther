const CACHE_NAME = 'kawthar-platform-v110';
const APP_SHELL = ['./index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // نخزّن كل ملف على حدة بدل addAll، حتى لو فشل تحميل ملف واحد (نت ضعيف)
      // ما يوقف تفعيل النسخة الجديدة كلها بسبب ملف وحيد
      Promise.all(APP_SHELL.map((url) => cache.add(url).catch((e) => console.log('precache failed', url, e))))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// الشعار وملفات الواجهة الثابتة (الأيقونات وmanifest): تظهر فوراً من الكاش دائماً
// (حتى لو النت ضعيف جداً أو منقطع)، مع تحديثها بالخلفية إذا كان فيه اتصال.
function isShellAsset(url) {
  return url.pathname.endsWith('/icon-192.png') ||
         url.pathname.endsWith('/icon-512.png') ||
         url.pathname.endsWith('/manifest.json');
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const isSameOrigin = url.origin === self.location.origin;

  if (isSameOrigin && isShellAsset(url)) {
    // Cache-first + تحديث بالخلفية (stale-while-revalidate): ما تختفي أبداً بسبب بطء النت
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const networkUpdate = fetch(event.request).then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        }).catch(() => cached);
        return cached || networkUpdate;
      })
    );
    return;
  }

  // باقي الطلبات: أولوية للنت الحالي حتى يوصل آخر تحديث (الدروس/الأسئلة)،
  // ورجوع للكاش فقط لو تعذّر الاتصال كلياً
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
