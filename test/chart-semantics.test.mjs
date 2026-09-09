import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChartSamples, isOfflineCapturedReading, measurementState } from '../smart-dashboard/src/app/chart-semantics.mjs';

test('old normally delivered samples never age into offline', () => {
  assert.equal(isOfflineCapturedReading({ sample_epoch: 1700000100, sample_age_s: 0, delivery_attempts: 0 }, 60), false);
  assert.equal(isOfflineCapturedReading({ sample_age_s: 180 }, 60), true);
  assert.equal(isOfflineCapturedReading({ delivery_attempts: 1 }, 60), true);
});

test('limits are per measurement, inclusive; quality takes priority', () => {
  assert.equal(measurementState(5, 'valid', 2, 8), 'normal');
  assert.equal(measurementState(8, 'valid', 2, 8), 'normal');
  assert.equal(measurementState(9, 'valid', 2, 8), 'breach');
  assert.equal(measurementState(1, 'valid', 2, 8), 'breach');
  assert.equal(measurementState(9, 'suspect', 2, 8), 'uncertain');
  assert.equal(measurementState(9, 'invalid', 2, 8), 'missing');
  assert.equal(measurementState(null, 'valid', 2, 8), 'missing');
});

test('recovery, quality and short excursions survive within the same bucket', () => {
  const samples = [
    { timestamp: 10, temperature: 9, temperature_quality: 'valid', offline_captured: true },
    { timestamp: 20, temperature: 5, temperature_quality: 'valid', alarm_mask: 255, device_status: 'ALARM' },
    { timestamp: 30, temperature: 99, temperature_quality: 'suspect' },
    { timestamp: 40, temperature: 6, temperature_quality: 'invalid' },
  ];
  const data = buildChartSamples(samples, { start: 0, end: 200, bucketMs: 100 }, 60);
  assert.equal(data[0].temperature_offline, 9);
  assert.equal(data[1].temperature, 5);
  assert.equal(data[1].temperature_offline, null);
  assert.equal(data[2].temperature, null);
  assert.equal(data[2].temperature_uncertain, 99);
  assert.equal(data[3].temperature, null);
  assert.equal(data.find(p => p.timestamp === 100).temperature, null);
});
