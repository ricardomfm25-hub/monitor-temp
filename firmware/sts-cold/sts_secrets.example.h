#pragma once

// Copy to sts_secrets.h (ignored by Git) and fill with STAGING-only values.
// Never use a production endpoint or credential in the bench firmware.
#define STS_DEVICE_ID "STS-COLD-STAGING-BENCH-01"
#define STS_BACKEND_BASE_URL "https://staging-api.example.invalid"
#define STS_DASHBOARD_URL "https://staging-dashboard.example.invalid/"
#define STS_DASHBOARD_QR_TEXT "staging-dashboard.example.invalid"
#define STS_DEVICE_API_TOKEN "REPLACE_WITH_STAGING_DEVICE_TOKEN"
#define STS_OTA_PASSWORD "REPLACE_WITH_UNIQUE_STAGING_OTA_PASSWORD"
#define STS_WIFI_AP_PASSWORD "REPLACE_WITH_UNIQUE_STAGING_AP_PASSWORD"

// PEM root CA for the staging API host. A CA certificate is public material,
// but it remains local here so certificates cannot enter a commit by accident.
#define STS_TLS_ROOT_CA ""

// Keep disabled. An empty CA must fail closed instead of disabling TLS checks.
#define STS_ALLOW_INSECURE_TLS 0

// OTA is disabled for the first physical staging validation.
#define STS_ENABLE_OTA 0
