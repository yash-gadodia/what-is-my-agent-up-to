import test from "node:test";
import assert from "node:assert/strict";

import {
  extractFilePaths,
  getRawEventTimestamp,
  mapCodexToVizEvents,
} from "../public/mapping.js";

test("getRawEventTimestamp handles unix seconds", () => {
  const ts = getRawEventTimestamp({ ts: 1735600000 });
  assert.equal(ts, 1735600000 * 1000);
});

test("extractFilePaths finds explicit and embedded paths", () => {
  const event = {
    params: {
      file: "src/app.ts",
      output: "updated docs/README.md and server.mjs",
    },
  };
  const files = extractFilePaths(event);
  assert(files.includes("src/app.ts"));
  assert(files.includes("docs/README.md"));
  assert(files.includes("server.mjs"));
});

test("mapCodexToVizEvents creates error event with critical attention", () => {
  const events = mapCodexToVizEvents({
    method: "error",
    params: { message: "Command failed with timeout" },
  });

  const error = events.find((item) => item.kind === "error");
  assert.ok(error, "expected an error event");
  assert.equal(error.attentionSeverity, "critical");
  assert.equal(error.attentionCode, "error");
});
