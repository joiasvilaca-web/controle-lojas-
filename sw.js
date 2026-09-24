// Service Worker — Vilaça Joias Gestão e Controle
// Versão mínima: registra o app como PWA instalável.
// NÃO faz cache de dados (o app busca dados frescos do Supabase a cada uso).
const CACHE_NAME = 'vilaca-gestao-v2';

self.addEventListener('install', (event) => {
  // Ativa imediatamente, sem esperar o fechamento de outras abas
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    // Remove caches antigos se houver
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

// Estratégia network-first: sempre busca da rede (dados frescos).
// Se offline, cai no cache só do shell HTML (não dos dados).
self.addEventListener('fetch', (event) => {
  // Não intercepta chamadas pra APIs externas (Supabase, Gemini, Google Drive)
  const url = new URL(event.request.url);
  if (
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('generativelanguage') ||
    url.hostname.includes('photoroom.com')
  ) {
    return; // deixa o browser tratar normalmente
  }
  if (event.request.method !== 'GET') return;

  // Bibliotecas externas (CDN, fontes) e imagens do app: servidas do cache na hora
  // e atualizadas em segundo plano (stale-while-revalidate). As bibliotecas não mudam
  // entre uma abertura e outra, então não há motivo pra baixar tudo de novo a cada tela.
  const ehLib = url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'cdnjs.cloudflare.com' ||
                url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  const ehImagemDoApp = url.origin === self.location.origin && /\.(png|jpe?g|svg|ico|webp)$/i.test(url.pathname);
  if (ehLib || ehImagemDoApp) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(event.request).then((emCache) => {
          const daRede = fetch(event.request).then((resp) => {
            if (resp && (resp.ok || resp.type === 'opaque')) cache.put(event.request, resp.clone());
            return resp;
          }).catch(() => emCache);
          return emCache || daRede;
        })
      )
    );
    return;
  }

  // Telas do app (HTML): sempre da rede, pra nunca mostrar versão antiga depois de
  // subir um arquivo novo. Guarda uma cópia só pra abrir se a internet cair.
  event.respondWith(
    fetch(event.request).then((resp) => {
      if (resp && resp.ok && url.origin === self.location.origin) {
        const copia = resp.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia));
      }
      return resp;
    }).catch(() => caches.match(event.request))
  );
});
