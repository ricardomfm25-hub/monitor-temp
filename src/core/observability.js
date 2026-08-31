"use strict";

const counters = new Map();

function incrementCoreMetric(name, labels = {}) {
  const safeName = String(name || "unknown").replace(/[^a-zA-Z0-9_.-]/g, "_");
  const safeLabels = Object.fromEntries(
    Object.entries(labels || {}).map(([key, value]) => [
      String(key).slice(0, 48),
      String(value ?? "unknown").slice(0, 96),
    ])
  );
  const key = JSON.stringify([safeName, safeLabels]);
  counters.set(key, (counters.get(key) || 0) + 1);
}

function getCoreMetricsSnapshot() {
  return [...counters.entries()].map(([key, value]) => {
    const [name, labels] = JSON.parse(key);
    return { name, labels, value };
  });
}

function resetCoreMetricsForTests() {
  counters.clear();
}

module.exports = {
  incrementCoreMetric,
  getCoreMetricsSnapshot,
  resetCoreMetricsForTests,
};
