// FurniCore app entry file.
// Основной код пока остаётся в index.html; сюда постепенно переносим модули.

const FURNICORE_BUILD_VERSION = "v6.31 - Apple Roll UX";

function applyBuildVersion() {
  const badge = document.getElementById("appVersionBadge");
  if (badge) badge.textContent = FURNICORE_BUILD_VERSION;
  document.querySelectorAll('.product-footer b,.version-badge').forEach(el=>el.textContent=FURNICORE_BUILD_VERSION);
}

function loadEcoLeatherUxAfterStartup() {
  if (document.querySelector('script[data-module="eco-leather-v631"]')) return;
  const script = document.createElement('script');
  script.src = 'js/eco-leather-wizard.js?v=6.31';
  script.dataset.module = 'eco-leather-v631';
  script.async = false;
  document.body.appendChild(script);
}

applyBuildVersion();
window.addEventListener('load', () => {
  applyBuildVersion();
  setTimeout(loadEcoLeatherUxAfterStartup, 250);
});
console.log("app.js loaded", FURNICORE_BUILD_VERSION);