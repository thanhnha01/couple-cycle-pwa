"use strict";

// pnpm's isolated Windows linker can route path-scurry to lru-cache v7 even
// though the lockfile resolves v10. Firebase Tools loads path-scurry before
// its command runner, so correct that one resolution at the CLI boundary.
const shim = require.resolve("./firebase-dependency-shim.cjs");
const shimForNodeOption = shim.replaceAll("\\", "/");
process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS ?? ""} --require=${shimForNodeOption}`.trim();
// The CLI's MOTD/update-notifier requests are unrelated to the emulator. Run
// the test command as CI so those background requests cannot affect its exit.
process.env.CI = "true";
process.env.NO_UPDATE_NOTIFIER = "1";
require(shim);

require("firebase-tools/lib/bin/firebase.js");
