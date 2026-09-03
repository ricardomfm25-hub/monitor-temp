# STS Cold staging bench firmware

This directory contains the sanitized STS Cold firmware prepared for physical
integration against STAGING only. The original firmware is not modified.

## Security gate

- `STS_ENVIRONMENT` is compile-time locked to staging.
- `sts_secrets.h` is ignored by Git; create it from `sts_secrets.example.h`.
- The firmware refuses to start network activity while the endpoint, token,
  Wi-Fi portal password or TLS root CA is missing or still a placeholder.
- TLS certificate validation is mandatory; `setInsecure()` is not used.
- OTA is disabled for the first bench validation.
- Use a unique staging-only device token, OTA password and setup AP password.
- Rotate the legacy values found in the old local firmware before any real flash.

The staging backend must be an HTTPS endpoint connected only to the STS staging
Supabase project. Do not point `STS_BACKEND_BASE_URL` at production.

## Target and partition

- Board: ESP32 Dev Module (`esp32:esp32:esp32`)
- Flash: 4 MB
- Partition: Huge APP, 3 MB application / 1 MB filesystem, no OTA
- Filesystem: LittleFS; persistent queue capped at 64 KiB / 1,800 records
- Firmware: `STS_COLD_FW_3.0.0-STAGING`

Compile with `scripts/compile-cold-firmware.ps1`. The script only compiles; it
does not accept a port and cannot upload.

## Pinout

| Function | ESP32 GPIO | Interface |
|---|---:|---|
| DHT22 (interior do dispositivo, diagnóstico) | 4 | Digital, external 4.7–10 kΩ pull-up to 3.3 V if needed |
| SHT30 SDA (ambiente monitorizado, principal) | 21 | I²C, address 0x44 |
| SHT30 SCL (ambiente monitorizado, principal) | 22 | I²C, 100 kHz |
| TFT SCK | 14 | SPI |
| TFT MOSI | 27 | SPI |
| TFT RST | 26 | Digital |
| TFT DC | 25 | Digital |
| TFT CS | 33 | SPI chip select |
| TFT backlight | 32 | Digital |
| RGB button switch | 23 | Input pull-up / interrupt |
| RGB red | 16 | PWM |
| RGB green | 17 | PWM |
| RGB blue | 18 | PWM |
| Passive buzzer | 19 | PWM tone |

GPIO 4 is a boot-strapping pin on classic ESP32 modules. Confirm the exact ESP32
board/module revision and verify that the DHT22 pull-up does not disturb boot.
GPIO 16/17 are not suitable for this use on some PSRAM-equipped WROVER modules;
the current target assumes a classic ESP32 Dev Module/WROOM without PSRAM.

## Runtime behavior prepared

- SHT30 primary monitored-environment readings and DHT22 internal diagnostic readings, both with consecutive-error recovery.
- Sensor semantics v2: `temperature`/`humidity` are SHT30; `internal_temperature`/`internal_humidity` are DHT22. Buffered v1 records keep their legacy mapping.
- ST7789 display, RGB button and passive buzzer.
- Wi-FiManager provisioning and reconnection.
- 60-second heartbeat and remote configuration polling.
- Persistent offline queue and idempotent retry metadata.
- Component Health diagnostics with observed/unknown confidence.
- Maintenance Mode recognition; process buzzer is suppressed while component and
  communication diagnostics remain active.
- Explicit task-watchdog registration and temporary removal around the blocking
  Wi-Fi setup portal.
