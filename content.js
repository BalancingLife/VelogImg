// content.js

(function inject() {
  const id = "__velogimg_injected";
  if (document.getElementById(id)) return;

  const s = document.createElement("script");
  s.id = id;
  s.src = chrome.runtime.getURL("pageScript.js");
  s.onload = () => {
    s.remove();
  };
  (document.head || document.documentElement).appendChild(s);
})();
