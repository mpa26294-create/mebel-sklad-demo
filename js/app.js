// MOLM app entry file.
// Основной код пока остаётся в index.html; сюда постепенно переносим модули.

// Version is derived live from the changelog's newest entry (js/changelog.js sets
// window.FURNICORE_LATEST_VERSION from the top-sorted release). This used to be a
// hardcoded string here that a MutationObserver kept forcing back into the footer
// on every DOM change, permanently overwriting the real version — fixed in v6.84.
const FURNICORE_BUILD_VERSION_FALLBACK = "v6.54 — Local Preview Actions Fix";

function currentBuildVersion() {
  return window.FURNICORE_LATEST_VERSION || window.APP_VERSION || FURNICORE_BUILD_VERSION_FALLBACK;
}

function applyBuildVersion() {
  const version = currentBuildVersion();
  const badge = document.getElementById("appVersionBadge");
  if (badge) badge.textContent = version;
  document.querySelectorAll('.product-footer b,.version-badge').forEach(el=>{
    if(el.textContent!==version)el.textContent=version;
  });
}

function loadMaterialUxImmediately() {
  if (!document.querySelector('script[data-module="material-flow-v634"]')) {
    const script = document.createElement('script');
    script.src = 'js/eco-leather-wizard.js?v=6.36';
    script.dataset.module = 'material-flow-v634';
    script.async = false;
    document.head.appendChild(script);
  }
  if (!document.querySelector('script[data-module="wood-flow-v639"]')) {
    const script = document.createElement('script');
    script.src = 'js/wood-wizard.js?v=6.42';
    script.dataset.module = 'wood-flow-v639';
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

console.log("app.js loaded", currentBuildVersion());
