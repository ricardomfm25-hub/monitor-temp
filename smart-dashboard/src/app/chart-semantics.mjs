const number = (value) => value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);

export function isOfflineCapturedReading(reading, sendIntervalS) {
  if ([true, 1, "true", "1"].includes(reading?.offline_captured)) return true;
  // Capture time is not delivery time: historical samples must not age into offline.
  return (number(reading?.delivery_attempts) || 0) > 0 ||
    (number(reading?.sample_age_s) || 0) > Math.max(number(sendIntervalS) || 60, 60);
}

export function measurementState(value, quality, low, high) {
  const numeric = number(value);
  if (quality === "invalid" || quality === "missing" || numeric === null) return "missing";
  if (quality === "suspect" || quality === "unknown") return "uncertain";
  return (number(low) !== null && numeric < number(low)) ||
    (number(high) !== null && numeric > number(high)) ? "breach" : "normal";
}

// Presentation-only fields: never overwrite measurements or smooth backfill.
export function smoothChartLine(data, metric, low, high) {
  let window = [];
  return data.map((point) => {
    const value = number(point[metric]);
    const state = measurementState(value, point[`${metric}_quality`], low, high);
    if (point.offline_captured || state !== "normal") {
      window = [];
      return { ...point, [`${metric}_smooth`]: state === "breach" && !point.offline_captured ? value : null };
    }
    window.push(value);
    if (window.length > 3) window.shift();
    return { ...point, [`${metric}_smooth`]: window.reduce((sum, sample) => sum + sample, 0) / window.length };
  });
}

export function buildChartSamples(readings, { start, end, bucketMs }, sendIntervalS) {
  const samples = (readings || []).filter((r) => Number.isFinite(r.timestamp) && r.timestamp >= start && r.timestamp <= end)
    .sort((a, b) => a.timestamp - b.timestamp);
  const occupied = new Set();
  const result = samples.map((reading) => {
    occupied.add(Math.floor(reading.timestamp / bucketMs));
    const offline = isOfflineCapturedReading(reading, sendIntervalS);
    const point = { ...reading, offline_captured: offline, offline_count: offline ? 1 : 0 };
    for (const metric of ["temperature", "humidity"]) {
      const value = number(reading[metric]);
      const state = measurementState(value, reading[`${metric}_quality`]);
      const usable = state === "normal";
      point[metric] = usable && !offline ? value : null;
      point[`${metric}_offline`] = usable && offline ? value : null;
      point[`${metric}_uncertain`] = state === "uncertain" ? value : null;
    }
    return point;
  });
  // Empty intervals remain explicit gaps. Keep every actual sample so short
  // excursions and recovery cannot be hidden by bucket priority/aggregation.
  for (let time = Math.ceil(start / bucketMs) * bucketMs; time <= end; time += bucketMs) {
    if (!occupied.has(Math.floor(time / bucketMs))) result.push({ timestamp: time, temperature: null, humidity: null });
  }
  return result.sort((a, b) => a.timestamp - b.timestamp);
}
