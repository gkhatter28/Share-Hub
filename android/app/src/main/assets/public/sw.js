/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// If the loader is already loaded, just stop.
if (!self.define) {
  let registry = {};

  // Used for `eval` and `importScripts` where we can't get script URL by other means.
  // In both cases, it's safe to use a global var because those functions are synchronous.
  let nextDefineUri;

  const singleRequire = (uri, parentUri) => {
    uri = new URL(uri + ".js", parentUri).href;
    return registry[uri] || (
      
        new Promise(resolve => {
          if ("document" in self) {
            const script = document.createElement("script");
            script.src = uri;
            script.onload = resolve;
            document.head.appendChild(script);
          } else {
            nextDefineUri = uri;
            importScripts(uri);
            resolve();
          }
        })
      
      .then(() => {
        let promise = registry[uri];
        if (!promise) {
          throw new Error(`Module ${uri} didn’t register its module`);
        }
        return promise;
      })
    );
  };

  self.define = (depsNames, factory) => {
    const uri = nextDefineUri || ("document" in self ? document.currentScript.src : "") || location.href;
    if (registry[uri]) {
      // Module is already loading or loaded.
      return;
    }
    let exports = {};
    const require = depUri => singleRequire(depUri, uri);
    const specialDeps = {
      module: { uri },
      exports,
      require
    };
    registry[uri] = Promise.all(depsNames.map(
      depName => specialDeps[depName] || require(depName)
    )).then(deps => {
      factory(...deps);
      return exports;
    });
  };
}
define(['./workbox-afac4cd2'], (function (workbox) { 'use strict';

  self.skipWaiting();
  workbox.clientsClaim();
  /**
   * The precacheAndRoute() method efficiently caches and responds to
   * requests for URLs in the manifest.
   * See https://goo.gl/S9QRab
   */
  workbox.precacheAndRoute([{
    "url": "pwa-maskable-512x512.png",
    "revision": "7d19f3371de0196550ebc49b70910f8a"
  }, {
    "url": "pwa-512x512.png",
    "revision": "ed7ce0aef6e6a3f616348534559a222c"
  }, {
    "url": "pwa-192x192.png",
    "revision": "15e54bad9e94721f964c6504eba5429a"
  }, {
    "url": "index.html",
    "revision": "04d5c91d4876800c27c5f3c445ca92d3"
  }, {
    "url": "icon.svg",
    "revision": "f39389d30637b466021476f042480837"
  }, {
    "url": "apple-touch-icon.png",
    "revision": "6c9703974a8d974074792ac21ca72b4b"
  }, {
    "url": "assets/workbox-window.prod.es5-Bd17z0YL.js",
    "revision": null
  }, {
    "url": "assets/index-Cnw8ZYHQ.css",
    "revision": null
  }, {
    "url": "assets/index-BCiXz3s0.js",
    "revision": null
  }, {
    "url": "assets/avatar_marcus_chen_1794720426664-W0HBtK6n.jpg",
    "revision": null
  }, {
    "url": "assets/avatar_elena_vance_1794720425247-BzraaxHv.jpg",
    "revision": null
  }, {
    "url": "assets/avatar_amara_okafor_1794720426503-GVrvN-wL.jpg",
    "revision": null
  }, {
    "url": "apple-touch-icon.png",
    "revision": "6c9703974a8d974074792ac21ca72b4b"
  }, {
    "url": "icon.svg",
    "revision": "f39389d30637b466021476f042480837"
  }, {
    "url": "pwa-192x192.png",
    "revision": "15e54bad9e94721f964c6504eba5429a"
  }, {
    "url": "pwa-512x512.png",
    "revision": "ed7ce0aef6e6a3f616348534559a222c"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "7d19f3371de0196550ebc49b70910f8a"
  }, {
    "url": "manifest.webmanifest",
    "revision": "f86f60c91e13619f86bea5851ec11f8c"
  }], {});
  workbox.cleanupOutdatedCaches();
  workbox.registerRoute(new workbox.NavigationRoute(workbox.createHandlerBoundToURL("index.html")));
  workbox.registerRoute(/^https:\/\/fonts\.googleapis\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "google-fonts-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 10,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');
  workbox.registerRoute(/^https:\/\/fonts\.gstatic\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "gstatic-fonts-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 10,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');

}));
