"use strict";

/**
 * Patches history pushState/replaceState and listens to popstate to detect
 * Single Page Application (SPA) navigation changes. When a navigation occurs,
 * it sends a message via window.postMessage to notify the isolated world script.
 * 
 * Why this code exists:
 * The isolated world content script cannot access the page's history object directly
 * to patch its methods. Thus, we run this script in the main world (MAIN context).
 * We declare it in manifest.json to avoid violating page-level CSP policies
 * that prohibit inline scripts.
 */
(() => {
  /**
   * Dispatches a navigation message to the window.
   * 
   * @danishansari-dev - None
   * @returns {void}
   */
  const notify = () => window.postMessage({ type: "YSC_SPA_NAVIGATE" }, "*");

  /**
   * Patches a history method to trigger a notification when called.
   * 
   * @danishansari-dev method - The history method name to patch ("pushState" or "replaceState")
   * @returns {void}
   */
  const patch = (method) => {
    const orig = history[method];
    if (typeof orig === "function") {
      history[method] = function(...args) {
        const res = orig.apply(this, args);
        notify();
        return res;
      };
    }
  };

  patch("pushState");
  patch("replaceState");
  window.addEventListener("popstate", notify);
})();
