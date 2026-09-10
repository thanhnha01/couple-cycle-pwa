"use strict";

const Module = require("module");
const originalResolve = Module._resolveFilename;
const lruCacheV10 = require.resolve("lru-cache");
const mimeV1 = require.resolve("mime");
const signalExitV3 = require.resolve("signal-exit");

Module._resolveFilename = function resolveFirebaseToolDependency(request, parent, isMain, options) {
  if (request === "lru-cache" && parent?.filename?.includes("path-scurry")) return lruCacheV10;
  if (request === "mime" && (parent?.filename?.includes("express") || parent?.filename?.includes("send"))) return mimeV1;
  if (request === "signal-exit" && parent?.filename?.includes("write-file-atomic")) return signalExitV3;
  return originalResolve.call(this, request, parent, isMain, options);
};
