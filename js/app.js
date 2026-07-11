// FurniCore app entry file.
// Основной код пока остаётся в index.html; сюда постепенно переносим модули.

const FURNICORE_BUILD_VERSION = "v6.30 - Eco Leather Flow";

function applyBuildVersion() {
  const badge = document.getElementById("appVersionBadge");
  if (badge) badge.textContent = FURNICORE_BUILD_VERSION;
}

function loadFurniCoreModule(src) {
  if (document.querySelector(`script[data-module="${src}"]`)) return;
  const script = document.createElement("script");
  script.src = src;
  script.dataset.module = src;
  script.defer = true;
  document.head.appendChild(script);
}

applyBuildVersion();
loadFurniCoreModule("js/eco-leather-wizard.js?v=6.30");
console.log("app.js loaded", FURNICORE_BUILD_VERSION);
