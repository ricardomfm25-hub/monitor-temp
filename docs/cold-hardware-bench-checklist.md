# STS Cold hardware integration — staging bench checklist

Record the serial log timestamp and staging evidence for every test. Keep the ESP
disconnected until `sts_secrets.h` contains staging-only values and the security
gate in `web-security-hardware-gate.md` is accepted.

| # | Test | EXPECTED | ACTUAL | PASS/FAIL |
|---:|---|---|---|---|
| 1 | Boot | One clean boot; version `STS_COLD_FW_3.0.0-STAGING`; no reset loop; configuration gate passes. | PENDING | PENDING |
| 2 | TFT | Backlight and ST7789 UI initialize; content is legible in landscape; no flicker/reset. | PENDING | PENDING |
| 3 | DHT22 | Internal device diagnostics become valid; failure degrades Component Health without changing the environment Operational State. | PENDING | PENDING |
| 4 | SHT30 | Sensor is detected at 0x44 on GPIO 21/22; primary monitored-environment values and Operational State follow it. | PENDING | PENDING |
| 5 | RGB button | Short press changes page/wakes TFT; long press acknowledges alarm; RGB patterns match state. | PENDING | PENDING |
| 6 | Buzzer | Passive buzzer sounds only for unacknowledged process alarm and follows remote enable setting. | PENDING | PENDING |
| 7 | Wi-Fi | Setup AP requires the unique bench password; 2.4 GHz connection and reconnection succeed. | PENDING | PENDING |
| 8 | Heartbeat | Staging receives heartbeat every 60 s with firmware, communication and hardware diagnostics. | PENDING | PENDING |
| 9 | Telemetry to staging | Only the staging backend receives readings; normalized and Legacy Cold writes remain consistent. | PENDING | PENDING |
| 10 | Component Health | DHT22/SHT30/queue/memory report observed health; TFT/button/buzzer do not claim unobserved physical health. | PENDING | PENDING |
| 11 | Maintenance Mode | Remote ACTIVE state reaches firmware; buzzer/process notification is suppressed; communication/component diagnostics continue. | PENDING | PENDING |
| 12 | Internet loss | Device remains operational locally, displays offline state and does not reboot-loop. | PENDING | PENDING |
| 13 | Backlog/retry | Readings enter LittleFS queue, retain identity/time, and resend once without duplicates after recovery. | PENDING | PENDING |
| 14 | Reboot | Boot count increments; config and valid backlog survive; reset reason is reported. | PENDING | PENDING |
| 15 | Power cut/restore | Filesystem recovers without corruption; queued records are retained or explicitly rejected as invalid. | PENDING | PENDING |
| 16 | Sensor failure | Disconnect each sensor separately; affected component degrades/faults without fabricating measurements. | PENDING | PENDING |
| 17 | Automatic recovery | Reconnect sensor/network; health returns after valid observations and backlog drains automatically. | PENDING | PENDING |

Stop immediately on overheating, abnormal current, repeated brownout/watchdog
resets, filesystem format, telemetry outside staging, TLS validation failure or
unexpected buzzer activation during Maintenance Mode.
