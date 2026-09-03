"use strict";

const { getSensorSemanticsVersion, numericOrNull } = require("./measurement-contract");

function resolveColdSensorSnapshot(payload = {}) {
  const version = getSensorSemanticsVersion(payload);
  const isSht30Primary = version >= 2;

  return {
    sensorSemanticsVersion: version,
    primary: {
      componentKey: isSht30Primary ? "sht30_ambient" : "dht22_interior",
      temperature: numericOrNull(payload.temperature),
      humidity: numericOrNull(payload.humidity),
      ok: payload.sensor_ok === false ? false : null,
    },
    internal: {
      componentKey: "dht22_interior",
      temperature: isSht30Primary
        ? numericOrNull(payload.internal_temperature)
        : numericOrNull(payload.temperature),
      humidity: isSht30Primary
        ? numericOrNull(payload.internal_humidity)
        : numericOrNull(payload.humidity),
      ok: isSht30Primary
        ? payload.internal_sensor_ok === true
        : payload.sensor_ok === false
          ? false
          : null,
    },
  };
}

function deriveColdOperationalStatus({ snapshot, limits, online = true }) {
  if (!online) return "offline";

  const temperature = snapshot?.primary?.temperature;
  const humidity = snapshot?.primary?.humidity;
  if (
    snapshot?.primary?.ok === false ||
    temperature === null ||
    humidity === null
  ) {
    return "sensor_fail";
  }

  const tempLow = Number(limits?.temp_low_c);
  const tempHigh = Number(limits?.temp_high_c);
  const humLow = Number(limits?.hum_low);
  const humHigh = Number(limits?.hum_high);

  const tempCritical = temperature > tempHigh + 2 || temperature < tempLow - 2;
  const humCritical = humidity > humHigh + 5 || humidity < humLow - 5;
  if (tempCritical || humCritical) return "alarm";

  const tempAlert = temperature > tempHigh || temperature < tempLow;
  const humAlert = humidity > humHigh || humidity < humLow;
  return tempAlert || humAlert ? "alert" : "normal";
}

module.exports = {
  resolveColdSensorSnapshot,
  deriveColdOperationalStatus,
};
