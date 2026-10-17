const CACHE_NAME = 'kawthar-platform-v209';
const APP_SHELL = ['./index.html', './manifest.json', './icon-192.png', './icon-512.png'];

// ==== إشعارات حقيقية (Firebase Cloud Messaging) — تستلم وتعرض إشعار حتى لو التطبيق مقفول تماماً ====
try {
  importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');
  firebase.initializeApp({
    apiKey: "AIzaSyBJ-YT2-WmgvHm8MQ-tUgFoUFkhTyY9Ur8",
    authDomain: "mnsat-alkwther.firebaseapp.com",
    projectId: "mnsat-alkwther",
    storageBucket: "mnsat-alkwther.firebasestorage.app",
    messagingSenderId: "276288995799",
    appId: "1:276288995799:web:262f8a466f6c6409814b92"
  });
  const messaging = firebase.messaging();
  messaging.onBackgroundMessage((payload) => {
    const title = (payload.notification && payload.notification.title) || 'مكتبة الكوثر';
    const body = (payload.notification && payload.notification.body) || '';
    self.registration.showNotification(title, {
      body, icon: 'icon-192.png', badge: 'icon-192.png',
      data: { url: (payload.data && payload.data.url) || './index.html' }
    });
  });
} catch(e) { console.log('FCM setup in service worker failed', e); }

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || './index.html';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clientsArr) => {
      const existing = clientsArr.find((c) => c.url.includes(self.location.origin));
      if (existing) return existing.focus();
      return self.clients.openWindow(targetUrl);
    })
  );
});

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

// الشعار وملفات الواجهة الثابتة (الأيقونات وmanifest وindex.html نفسه): تظهر فوراً من الكاش دائماً
// (حتى لو النت ضعيف جداً أو منقطع)، مع تحديثها بالخلفية إذا كان فيه اتصال.
// هذا هو سبب "البرنامج بطيء بالفتح" — كان يحاول يجيب index.html كامل (600+ كيلوبايت) من النت
// كل مرة قبل ما يفتح، بدل ما يفتحه فوراً من نسخة الجهاز المحفوظة ويحدثها بالخلفية.
function isShellAsset(url) {
  return url.pathname.endsWith('/icon-192.png') ||
         url.pathname.endsWith('/icon-512.png') ||
         url.pathname.endsWith('/manifest.json') ||
         url.pathname.endsWith('/index.html') ||
         url.pathname.endsWith('/') || url.pathname === '';
}

// طلبات Firebase/Google API الحيّة (قاعدة البيانات، تسجيل الدخول، الإشعارات) ما نتدخل بيها أبداً:
// هذي اتصالات مستمرة أو طلبات خاصة بالمستخدم، وتخزينها بالكاش يسبب بطء وبيانات قديمة وأخطاء
function isLiveApiRequest(url) {
  const h = url.hostname;
  return h.includes('firestore.googleapis.com') || h.includes('firebaseio.com') ||
         h.includes('identitytoolkit.googleapis.com') || h.includes('securetoken.googleapis.com') ||
         h.includes('fcmregistrations.googleapis.com') || h.includes('firebaseinstallations.googleapis.com') ||
         h.includes('firebasestorage.googleapis.com') || h.includes('api.alwaseet') ||
         h.includes('cloudfunctions.net') || h.includes('run.app') || h.includes('wa.me');
}
function canCache(response) {
  return response && (response.ok || response.type === 'opaque');
}
function putInCache(request, response) {
  if (!canCache(response)) return;
  const copy = response.clone();
  caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (isLiveApiRequest(url)) return; // نخلي المتصفح يتعامل معها مباشرة
  const isSameOrigin = url.origin === self.location.origin;
  const isNavigation = event.request.mode === 'navigate';

  if (isSameOrigin && (isShellAsset(url) || isNavigation)) {
    // Cache-first + تحديث بالخلفية (stale-while-revalidate): ما تختفي أبداً بسبب بطء النت
    event.respondWith(
      caches.match(event.request, { ignoreSearch: true }).then((cached) => {
        const networkUpdate = fetch(event.request).then((response) => {
          putInCache(event.request, response);
          return response;
        }).catch(() => cached || (isNavigation ? caches.match('./index.html') : undefined))
          .then((res) => res || new Response('غير متصل بالإنترنت', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }));
        if (cached) {
          event.waitUntil(networkUpdate.catch(() => {}));
          return cached;
        }
        return networkUpdate;
      })
    );
    return;
  }

  // باقي الطلبات: أولوية للنت الحالي حتى يوصل آخر تحديث (الدروس/الأسئلة)،
  // ورجوع للكاش فقط لو تعذّر الاتصال كلياً
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        putInCache(event.request, response);
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || Response.error()))
  );
});
