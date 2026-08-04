// Service Worker — Vilaça Joias Gestão e Controle
// Versão mínima: registra o app como PWA instalável.
// NÃO faz cache de dados (o app busca dados frescos do Supabase a cada uso).
const CACHE_NAME = 'vilaca-gestao-v1';

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
  // Pra os arquivos do app (HTML, JS, CSS): network-first, sem cache forçado
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
