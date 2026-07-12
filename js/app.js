// FurniCore app entry file.
// Основной код пока остаётся в index.html; сюда постепенно переносим модули.

const FURNICORE_BUILD_VERSION = "v6.35 - Apple Wood Flow";

function applyBuildVersion() {
  const badge = document.getElementById("appVersionBadge");
  if (badge) badge.textContent = FURNICORE_BUILD_VERSION;
  document.querySelectorAll('.product-footer b,.version-badge').forEach(el=>{
    if(el.textContent!==FURNICORE_BUILD_VERSION)el.textContent=FURNICORE_BUILD_VERSION;
  });
}

function loadMaterialUxImmediately() {
  if (!document.querySelector('script[data-module="material-flow-v634"]')) {
    const script = document.createElement('script');
    script.src = 'js/eco-leather-wizard.js?v=6.34';
    script.dataset.module = 'material-flow-v634';
    script.async = false;
    document.head.appendChild(script);
  }
  if (!document.querySelector('script[data-module="wood-flow-v635"]')) {
    const script = document.createElement('script');
    script.src = 'js/wood-wizard.js?v=6.35';
    script.dataset.module = 'wood-flow-v635';
    script.async = false;
    document.head.appendChild(script);
  }
}

applyBuildVersion();
loadMaterialUxImmediately();

document.addEventListener('DOMContentLoaded', applyBuildVersion);
window.addEventListener('load', applyBuildVersion);

try {
  new MutationObserver(applyBuildVersion).observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  });
} catch (e) {}

console.log("app.js loaded", FURNICORE_BUILD_VERSION);