// =====================================================
// SmartTempSystems - STS Cold V2.8.3 TFT + DHT22 + SHT30
// ESP32 + DHT22 interior + SHT30 ambiente + ST7789 TFT + RGB Button + Buzzer
//
// Features:
// - WiFiManager setup portal
// - WiFi reset by 8s button press, even during alarm
// - Alarm ACK by 2s button press
// - Remote config fetch with config_version
// - Local config persistence with Preferences
// - Persistent reading queue for offline periods
// - Watchdog and WiFi reconnection
// - OTA over local network
// - Health diagnostics in telemetry payload
//
// Security note:
// - Replace DEVICE_API_TOKEN locally before flashing.
// - Do not commit real tokens to GitHub.
// =====================================================

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <DHT.h>
#include <Adafruit_SHT31.h>
#include <ArduinoJson.h>
#include <esp_task_wdt.h>
#include <esp_system.h>
#include <esp_wifi.h>
#include <WiFiManager.h>
#include <Preferences.h>
#include <LittleFS.h>
#include <ArduinoOTA.h>
#include <qrcode.h>
#include <time.h>
#include <stddef.h>
#include <string.h>
#include <math.h>

#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7789.h>
#include <Fonts/FreeSans9pt7b.h>
#include <Fonts/FreeSansBold12pt7b.h>
#include <Fonts/FreeSansBold24pt7b.h>
#include <SPI.h>

// ========================
// DEVICE / VERSION
// ========================
#define STS_ENVIRONMENT_STAGING 1
#define STS_ENVIRONMENT STS_ENVIRONMENT_STAGING
#include "sts_secrets.h"

#if STS_ENVIRONMENT != STS_ENVIRONMENT_STAGING
#error "Bench firmware must target STAGING."
#endif

static_assert(STS_ALLOW_INSECURE_TLS == 0, "Insecure TLS is forbidden for STS staging firmware");

#define DEVICE_ID STS_DEVICE_ID
#define FIRMWARE_VERSION "STS_COLD_FW_3.0.0-STAGING"
// A versao e definida apenas aqui e segue em todas as telemetrias,
// incluindo leituras recuperadas da fila offline.
static_assert(sizeof(FIRMWARE_VERSION) > 1, "FIRMWARE_VERSION must not be empty");

// ========================
// OTA
// ========================
const char* OTA_PASSWORD = STS_OTA_PASSWORD;
// ========================
// WIFI / PORTAL
// ========================
const char* WIFI_AP_NAME = "STS-Setup";
const char* WIFI_AP_PASSWORD = STS_WIFI_AP_PASSWORD;
const char* WIFI_SETUP_URL = "http://192.168.4.1";
const char* WIFI_SETUP_QR_TEXT = "http://192.168.4.1";
const char* PREF_WIFI_SETUP_PENDING = "wifi_setup";
const char* PREF_WIFI_PROVISIONED = "wifi_ok";
const uint8_t KNOWN_WIFI_MAX = 5;
const char* WIFI_PORTAL_HEAD = R"rawliteral(
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
:root{color-scheme:light;--bg:#f6f8fb;--panel:#ffffff;--text:#172033;--muted:#64748b;--line:#d9e2ee;--brand:#2563eb;--brand-dark:#1d4ed8;--ok:#0f766e;--warn:#b45309;--danger:#b91c1c;}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;font-size:16px;line-height:1.45}
body:before{content:"STS Cold";display:block;max-width:500px;margin:24px auto 0;padding:0 18px;color:var(--brand);font-size:13px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
.wrap,.container,main,body>div{max-width:500px;margin:10px auto 28px!important;padding:22px!important;background:var(--panel)!important;border:1px solid var(--line)!important;border-radius:8px!important;box-shadow:0 18px 45px rgba(15,23,42,.08)!important}
h1,h2,h3{margin:0 0 14px;color:var(--text);font-weight:800;letter-spacing:0}
h1{font-size:26px}
h2,h3{font-size:18px}
p,li,label{color:var(--muted)}
label{display:block;margin:14px 0 6px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.04em}
input,select{width:100%;min-height:46px;padding:11px 12px;border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--text);font:inherit;outline:none}
input:focus,select:focus{border-color:var(--brand);box-shadow:0 0 0 3px rgba(37,99,235,.12)}
button,.button,input[type=submit],input[type=button],a.btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;width:100%;margin-top:12px;padding:11px 14px;border:1px solid var(--brand);border-radius:8px;background:var(--brand);color:#fff!important;font-weight:800;text-decoration:none;cursor:pointer}
button:hover,.button:hover,input[type=submit]:hover,input[type=button]:hover,a.btn:hover{background:var(--brand-dark)}
a{color:var(--brand);font-weight:700}
hr{border:0;border-top:1px solid var(--line);margin:18px 0}
.msg,.info{padding:10px 12px;border-radius:8px;background:#eff6ff;color:#1e3a8a;border:1px solid #bfdbfe}
.sts-status{max-width:500px;margin:12px auto 0;padding:16px 18px;background:var(--panel);border:1px solid #bfdbfe;border-left:5px solid var(--brand);border-radius:8px;box-shadow:0 12px 30px rgba(15,23,42,.07)}
.sts-status strong{display:block;margin-bottom:4px;color:var(--text);font-size:18px}
.sts-status span{display:block;color:var(--muted)}
.sts-status.warn{border-color:#fde68a;border-left-color:var(--warn);background:#fffbeb}
.sts-status.error{border-color:#fecaca;border-left-color:var(--danger);background:#fef2f2}
.sts-status.ok{border-color:#99f6e4;border-left-color:var(--ok);background:#f0fdfa}
.sts-help{max-width:500px;margin:10px auto 0;padding:0 18px;color:var(--muted);font-size:14px}
.sts-help b{color:var(--text)}
.sts-chips{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}
.sts-chip{padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--text);font-weight:700}
@media(max-width:540px){body:before,.wrap,.container,main,body>div,.sts-status,.sts-help{max-width:none;margin-left:12px!important;margin-right:12px!important}.sts-chips{grid-template-columns:1fr}}
</style>
<script>
document.addEventListener("DOMContentLoaded",function(){
  var path=(location.pathname||"").toLowerCase();
  var text=(document.body&&document.body.innerText||"").toLowerCase();
  var saved=path.indexOf("wifisave")>=0||text.indexOf("saved")>=0||text.indexOf("credentials")>=0;
  var failed=text.indexOf("fail")>=0||text.indexOf("erro")>=0||text.indexOf("error")>=0||text.indexOf("timeout")>=0||text.indexOf("not connected")>=0||text.indexOf("falhou")>=0;
  var statusBox=document.createElement("div");
  statusBox.className="sts-status";
  if(saved){
    statusBox.className+=" ok";
    statusBox.innerHTML="<strong>Credenciais guardadas com sucesso.</strong><span>O dispositivo esta agora a validar e concluir a ligacao WiFi. Pode fechar esta pagina.</span>";
  }else if(failed){
    statusBox.className+=" error";
    statusBox.innerHTML="<strong>Nao foi possivel concluir o pedido.</strong><span>Confirme a password, use uma rede 2.4 GHz e evite WPA3-only. Depois tente guardar novamente.</span>";
  }else{
    statusBox.innerHTML="<strong>Configurar WiFi do STS.</strong><span>Escolha a rede, escreva a password e guarde. O dispositivo retoma sozinho quando ficar ligado.</span>";
  }
  document.body.insertBefore(statusBox,document.body.firstChild);
  var help=document.createElement("div");
  help.className="sts-help";
  help.innerHTML="<b>Antes de guardar:</b><div class='sts-chips'><div class='sts-chip'>Rede 2.4 GHz</div><div class='sts-chip'>Password certa</div><div class='sts-chip'>WPA2 ou misto</div><div class='sts-chip'>Sinal forte</div></div>";
  document.body.insertBefore(help,statusBox.nextSibling);
  var pass=document.querySelector("input[type='password']");
  if(pass){
    pass.placeholder="Password da rede WiFi";
    pass.autocomplete="current-password";
  }
  if(false&&(path.indexOf("wifisave")>=0||text.indexOf("saved")>=0||text.indexOf("guard")>=0)){
    var box=document.createElement("div");
    box.className="msg";
    box.style.margin="12px auto";
    box.style.maxWidth="480px";
    box.innerHTML="<strong>Setup recebido.</strong><br>A ligar ao WiFi. O dispositivo retoma automaticamente quando a ligação ficar concluída.";
    document.body.insertBefore(box,document.body.firstChild);
  }
});
</script>
)rawliteral";
const uint8_t QR_QUIET_ZONE_MODULES = 1;
const unsigned long WIFI_RECONNECT_INTERVAL_MS = 15000;
const unsigned long WIFI_CONNECT_TIMEOUT_MS = 30000;
const unsigned long WIFI_BOOT_CONNECT_TIMEOUT_MS = 20000;
const unsigned long WIFI_PORTAL_RETRY_TIMEOUT_MS = 30000;
const unsigned long WIFI_RECONNECT_TIMEOUT_MS = 20000;
const unsigned long WIFI_RECONNECT_QUICK_TIMEOUT_MS = 3000;
const unsigned long WIFI_RECONNECT_ESCALATED_TIMEOUT_MS = 6000;
const unsigned long WIFI_FAST_RECONNECT_DELAY_MS = 1500;
const unsigned long WIFI_FORCE_RECONNECT_DELAY_MS = 4500;
const unsigned long WIFI_ENVIRONMENT_SWITCH_DELAY_MS = 8000;
const unsigned long WIFI_KNOWN_NETWORK_SCAN_INTERVAL_MS = 15000;
const unsigned long WIFI_KNOWN_NETWORK_SWITCH_TIMEOUT_MS = 10000;
const unsigned long WIFI_TELEMETRY_RECONNECT_TIMEOUT_MS = 3500;
const unsigned long WIFI_CONNECTING_GRACE_MS = 8000;
const unsigned long WIFI_TRANSPORT_RECOVERY_COOLDOWN_MS = 15000;
const uint8_t HTTP_TRANSPORT_FORCE_RECONNECT_AFTER = 3;
const unsigned long WIFI_LOADING_SCREEN_DELAY_MS = 5000;
const unsigned long WIFI_OFFLINE_STATE_GRACE_MS = 60000;
const unsigned long BACKEND_OFFLINE_STATE_GRACE_MS = 30000;
const unsigned long WIFI_RECONNECT_ESCALATE_MS = 45UL * 1000UL;
const unsigned long WIFI_PORTAL_LONG_PRESS_MS = 8000;
const unsigned long WIFI_QUALITY_CHECK_INTERVAL_MS = 10UL * 60UL * 1000UL;
const int WIFI_WEAK_RSSI_DBM = -75;

// ========================
// BACKEND
// ========================
const char* backendBaseUrl = STS_BACKEND_BASE_URL;
const char* dashboardUrl = STS_DASHBOARD_URL;
const char* dashboardQrText = STS_DASHBOARD_QR_TEXT;
const char* temperatureUrl = STS_BACKEND_BASE_URL "/api/temperature";
const char* heartbeatUrl = STS_BACKEND_BASE_URL "/api/device/heartbeat";
const char* DEVICE_API_TOKEN = STS_DEVICE_API_TOKEN;
const unsigned long HEARTBEAT_INTERVAL_MS = 60UL * 1000UL;

// ========================
// TIME
// ========================
const char* TIMEZONE_TZ = "WET0WEST,M3.5.0/1,M10.5.0";
const char* NTP_SERVER_1 = "pool.ntp.org";
const char* NTP_SERVER_2 = "time.nist.gov";
const unsigned long CLOCK_RETRY_INTERVAL_MS = 60000;
const unsigned long CLOCK_RESYNC_INTERVAL_MS = 6UL * 60UL * 60UL * 1000UL;
const unsigned long CLOCK_SYNC_BLOCK_MS = 450;
const time_t CLOCK_VALID_AFTER_EPOCH = 1700000000;

// ========================
// PINS
// ========================
#define DHT_INTERIOR_PIN 4
#define DHT_INTERIOR_TYPE DHT22

#define SHT30_SDA_PIN 21
#define SHT30_SCL_PIN 22
const uint8_t SHT30_AMBIENT_ADDRESS = 0x44;
const uint32_t SHT30_I2C_FREQUENCY_HZ = 100000;

#define TFT_SCK_PIN  14
#define TFT_MOSI_PIN 27
#define TFT_RST_PIN  26
#define TFT_DC_PIN   25
#define TFT_CS_PIN   33
#define TFT_BLK_PIN  32

#define BUTTON_PIN    23
#define BUZZER_PIN    19
#define BUTTON_RGB_R_PIN 16
#define BUTTON_RGB_G_PIN 17
#define BUTTON_RGB_B_PIN 18

const uint16_t BUZZER_FIRST_FREQUENCY_HZ = 1500;
const uint16_t BUZZER_SECOND_FREQUENCY_HZ = 1750;
const uint8_t BUZZER_PWM_RESOLUTION = 8;

#define TFT_NATIVE_WIDTH 240
#define TFT_NATIVE_HEIGHT 280
#define SCREEN_WIDTH 280
#define SCREEN_HEIGHT 240
#define TFT_ROTATION 1
#define UI_SAFE_X 16
#define UI_SAFE_Y 14
#define UI_SAFE_W 248
#define UI_SAFE_H 212

#ifndef WHITE
#define WHITE ST77XX_WHITE
#endif
#ifndef BLACK
#define BLACK ST77XX_BLACK
#endif
#ifndef SSD1306_DISPLAYON
#define SSD1306_DISPLAYON 0xAF
#endif

const uint16_t TFT_BG = ST77XX_BLACK;
const uint16_t TFT_PANEL = 0x1082;
const uint16_t TFT_PANEL_ALT = 0x18E3;
const uint16_t TFT_TEXT = ST77XX_WHITE;
const uint16_t TFT_MUTED = 0xBDF7;
const uint16_t TFT_OK = 0x07E0;
const uint16_t TFT_WARN = 0xFD20;
const uint16_t TFT_DANGER = ST77XX_RED;
const uint16_t TFT_BLUE = 0x04FF;
const uint16_t TFT_BG_NORMAL = 0x0120;
const uint16_t TFT_BG_BLUE = 0x0013;
const uint16_t TFT_BG_WARN = 0x20C0;
const uint16_t TFT_BG_DANGER = 0x3000;
const uint16_t TFT_BG_OFFLINE = 0x1082;

// ========================
// REMOTE CONFIG DEFAULTS
// ========================
float tempLowC = 18.0;
float tempHighC = 27.0;
float humLow = 30.0;
float humHigh = 60.0;
float hystC = 0.5;
float hystHum = 2.0;

int sendIntervalS = 60;
int displayStandbyMin = 3;
bool buzzerEnabled = true;
int configVersion = 0;
bool environmentConfigValid = false;
bool maintenanceModeActive = false;
String maintenanceState = "INACTIVE";
String lastRemoteAckToken = "";

// ========================
// INTERVALS
// ========================
unsigned long lastDisplay = 0;
unsigned long lastSend = 0;
unsigned long lastConfigFetch = 0;
unsigned long lastSensorRead = 0;
unsigned long wifiDisconnectedSinceMs = 0;
bool lastWifiConnected = false;
uint8_t lastSentAlarmMask = 255;
uint32_t lastSentAckCount = 0;
String lastSentDeviceStatus = "";
float lastSentTemperature = NAN;
float lastSentHumidity = NAN;

const unsigned long displayInterval = 3000;
const unsigned long clockLoadingFrameInterval = 180;
unsigned long sendIntervalMs = 60000;
const unsigned long configFetchInterval = 15000;
const unsigned long alarmAckFetchInterval = 2000;
const unsigned long sensorReadInterval = 2500;
const unsigned long USER_INTERACTION_NETWORK_GRACE_MS = 1200;
const unsigned long UI_RETURN_HOME_MS = 10000;
const int MIN_SEND_INTERVAL_S = 60;
const int MAX_SEND_INTERVAL_S = 15 * 60;
const int MAX_DISPLAY_STANDBY_MIN = 3;
const float IMMEDIATE_SEND_TEMP_DELTA_C = 1.0;
const float IMMEDIATE_SEND_HUM_DELTA = 5.0;
const unsigned long VALUE_CHANGE_SEND_MIN_INTERVAL_MS = 30000;
const float TEMP_ALERT_MARGIN_C = 1.0;
const float TEMP_ALERT_RELEASE_MARGIN_C = 1.2;
const float HUM_ALERT_MARGIN = 5.0;
const float HUM_ALERT_RELEASE_MARGIN = 6.0;

unsigned long oledStandbyMs = 3UL * 60UL * 1000UL;
unsigned long lastUserActivityMs = 0;
unsigned long lastInteractiveInputMs = 0;
bool displayReady = false;
bool interactiveTasksReady = false;
bool mainTaskWdtRegistered = false;
bool oledOn = true;
bool oledStandbyBlank = false;
int8_t activeUiScreen = -1;

// ========================
// BUTTON
// ========================
const unsigned long DEBOUNCE_MS = 30;
const unsigned long LONG_PRESS_MS = 2000;
const unsigned long VALID_SHORT_PRESS_MIN_MS = 70;
const unsigned long ISR_DEBOUNCE_MS = 45;
const unsigned long SHORT_PRESS_COOLDOWN_MS = 450;
const unsigned long PAGE_ADVANCE_COOLDOWN_MS = 650;

bool rawBtnLast = true;
bool btnStable = true;
unsigned long lastDebounceMs = 0;
unsigned long lastPageAdvanceMs = 0;

bool pressInProgress = false;
unsigned long pressStartMs = 0;
bool ackPressFired = false;
bool wifiResetFired = false;
bool wifiResetArmed = true;
bool wifiPortalRequested = false;
bool buttonPressWokeDisplay = false;
volatile bool buttonShortPressSeen = false;
volatile bool buttonPressStartedSeen = false;
volatile unsigned long buttonIsrPressStartMs = 0;
volatile unsigned long buttonIsrLastEdgeMs = 0;
volatile unsigned long buttonLastShortPressMs = 0;

// ========================
// HTTP / WDT
// ========================
const int HTTP_MAX_RETRIES = 3;
const unsigned long HTTP_RETRY_DELAY_MS = 1500;
const unsigned long HTTP_CONNECT_TIMEOUT_MS = 5000;
const unsigned long HTTP_RESPONSE_TIMEOUT_MS = 15000;
const int BUFFER_FLUSH_BATCH_SIZE = 5;
const unsigned long BUFFER_FLUSH_INTERVAL_MS = 1000;
const unsigned long BUFFER_FLUSH_ITEM_DELAY_MS = 120;
const unsigned long BUFFER_FLUSH_FAILURE_COOLDOWN_MS = 5000;

// ========================
// OFFLINE QUEUE
// ========================
struct Reading {
  float temperature;
  float humidity;
  float secondaryTemperature;
  float secondaryHumidity;
  bool secondarySensorOk;
  uint8_t sensorSemanticsVersion;
  uint32_t sequence;
  unsigned long capturedMillis;
  uint32_t capturedEpoch;
  uint8_t deliveryAttempts;
  bool capturedOffline;
  bool captureNetworkKnown;
  bool queuedBackfill;
  uint32_t sampleAgeOverrideS;
};

struct PersistedReadingRecord {
  uint32_t magic;
  uint8_t version;
  uint8_t deliveryAttempts;
  uint16_t reserved;
  float temperature;
  float humidity;
  float exteriorTemperature;
  float exteriorHumidity;
  uint8_t exteriorSensorOk;
  uint8_t exteriorReserved[3];
  uint32_t sequence;
  uint32_t capturedMillis;
  uint32_t capturedEpoch;
  uint32_t crc;
};

const char* QUEUE_FILE = "/readings-v2.q";
const char* QUEUE_TMP_FILE = "/readings-v2.tmp";
const char* PREF_QUEUE_OFFSET = "q2_offset";
const uint32_t QUEUE_RECORD_MAGIC = 0x53545351; // STSQ
const uint8_t QUEUE_RECORD_VERSION = 2;
const uint16_t QUEUE_CAPTURE_NETWORK_KNOWN = 0x8000;
const uint16_t QUEUE_CAPTURED_OFFLINE = 0x0001;
const uint16_t QUEUE_RETRY_BACKFILL = 0x0002;
const uint16_t QUEUE_SENSOR_SEMANTICS_V2 = 0x0004;
const uint8_t SENSOR_SEMANTICS_SHT30_PRIMARY = 2;
const size_t QUEUE_MAX_RECORDS = 1800; // Keep current operation reliable; older records are discarded first.
const size_t QUEUE_MAX_BYTES = 64UL * 1024UL;
const size_t QUEUE_COMPACT_THRESHOLD_BYTES = 16UL * 1024UL;

bool queueReady = false;
size_t queueReadOffset = 0;
int bufferCount = 0;
unsigned long lastBufferFlushMs = 0;
unsigned long bufferFlushPausedUntilMs = 0;

// ========================
// OBJECTS
// ========================
class STSTftDisplay : public Adafruit_ST7789 {
public:
  STSTftDisplay() : Adafruit_ST7789(TFT_CS_PIN, TFT_DC_PIN, TFT_RST_PIN) {}

  bool initialize() {
    SPI.begin(TFT_SCK_PIN, -1, TFT_MOSI_PIN, TFT_CS_PIN);
    init(TFT_NATIVE_WIDTH, TFT_NATIVE_HEIGHT);
    setRotation(TFT_ROTATION);
    fillScreen(BLACK);
    return true;
  }

  void clearDisplay() {
    fillScreen(BLACK);
  }

  void display() {}

  void ssd1306_command(uint8_t) {}
};

DHT dhtInterior(DHT_INTERIOR_PIN, DHT_INTERIOR_TYPE);
Adafruit_SHT31 sht30Ambient = Adafruit_SHT31();
STSTftDisplay display;
WiFiManager wm;
Preferences prefs;

// ========================
// STATE
// ========================
enum class SysState {
  NORMAL,
  ALERT,
  NO_WIFI,
  ALARM,
  ALARM_ACK,
  SENSOR_FAIL,
  SETUP_WIFI
};

SysState state = SysState::NO_WIFI;

volatile bool alarmActive = false;
volatile bool alarmAcked = false;
unsigned long alarmStartedMs = 0;
uint32_t alarmStartedEpoch = 0;
unsigned long alarmEventMs = 0;
unsigned long alarmAckMs = 0;
uint32_t alarmAckCount = 0;
uint32_t alarmEventCount = 0;
uint8_t activeAlarmMask = 0;
uint8_t activeAlertMask = 0;
String alarmReasonText = "";
String alarmEventTimeText = "";
String alarmAckTimeText = "";
bool primarySensorHealthy = false;
unsigned long primarySensorFailCount = 0;
bool internalSensorHealthy = false;
unsigned long internalSensorFailCount = 0;

unsigned long patternT0 = 0;

float lastTemperature = NAN;
float lastHumidity = NAN;
float lastInternalTemperature = NAN;
float lastInternalHumidity = NAN;

uint32_t bootCount = 0;
unsigned long wifiReconnectCount = 0;
uint32_t telemetrySequence = 0;
uint32_t postOkCount = 0;
uint32_t postFailCount = 0;
unsigned long lastPostOkMs = 0;
unsigned long lastPostFailMs = 0;
unsigned long lastHeartbeatMs = 0;
volatile bool backendStatusKnown = false;
volatile bool backendReachable = false;
volatile unsigned long backendUnreachableSinceMs = 0;
unsigned long lastTransportRecoveryMs = 0;
uint8_t consecutiveHttpTransportFailures = 0;
String resetReasonText = "unknown";
bool otaStarted = false;
uint8_t normalDisplayPage = 0;
uint8_t setupDisplayPage = 0;
bool clockSynced = false;
unsigned long lastClockSyncAttemptMs = 0;
unsigned long lastClockSyncOkMs = 0;
bool setupButtonTaskActive = false;
TaskHandle_t setupButtonTaskHandle = nullptr;
TaskHandle_t networkTaskHandle = nullptr;
QueueHandle_t networkReadingQueue = nullptr;

struct QrDrawContext {
  int16_t x;
  int16_t y;
  uint8_t scale;
};

struct CachedQrCode {
  bool ready;
  uint8_t size;
  uint32_t rows[29];
};

QrDrawContext qrDrawContext = {0, 0, 1};
CachedQrCode dashboardQrCache = {};
CachedQrCode setupQrCache = {};
CachedQrCode* activeQrCache = nullptr;

// =====================================================
// PROTOTYPES
// =====================================================
bool isWifiConnected();
void oledDisplayOn();
void oledDisplayOff();
void wakeDisplayByUser();
void updateOledStandby();
void rgbButtonWrite(uint8_t red, uint8_t green, uint8_t blue);
uint8_t smoothGlowDuty(unsigned long t, unsigned long durationMs, uint8_t maxDuty);
void setState(SysState s);
void acknowledgeAlarm();
void handleButton();
void buttonIsr();
void serviceInteractiveTasks();
bool registerMainTaskWatchdog(const char* context);
bool unregisterMainTaskWatchdog(const char* context);
void feedMainTaskWatchdog();
void processButtonInterruptEvents();
void connectWiFi();
void ensureWiFiConnected();
bool forceWiFiReconnect(unsigned long timeoutMs, const char* reason, bool forceReconnectConnected = false);
void startWiFiSetupPortal(bool resetCredentials, bool keepPortalOpen = false);
bool handleStartupWifiResetButton();
bool isWiFiSetupPending();
void setWiFiSetupPending(bool pending);
bool isWiFiProvisioned();
void setWiFiProvisioned(bool provisioned);
bool hasStoredWiFiCredentials();
bool hasKnownWiFiNetworks();
bool readCurrentWiFiCredentials(String &ssid, String &password);
bool readKnownWiFiNetwork(uint8_t index, String &ssid, String &password);
void configureWiFiStation();
bool beginPreferredWiFi();
void rememberKnownWiFiNetwork(const String &ssid, const String &password);
void rememberCurrentWiFiCredentials();
bool connectKnownWiFiNetwork(unsigned long timeoutMs, const char* title, const char* subtitle, bool allowSetupButton);
bool connectSavedWiFi(unsigned long timeoutMs, const char* title, const char* subtitle, bool allowSetupButton);
void syncClock();
void advanceNormalDisplayPage();
void advanceSetupDisplayPage();
void refreshCurrentDisplay();
void responsiveDelay(unsigned long durationMs);
bool userInteractionInProgress();
String formatCurrentTime();
String formatCurrentDate();
uint16_t uiStateColor();
uint16_t uiBackgroundColor();
void displayNormalPage(float temp, float humidity);
void displayMainClockScreen();
void displayTemp(float temp, float humidity);
void displayAlertPage(float temp, float humidity);
void displayAlarmPage(float temp, float humidity);
void displayLoadingScreen(const char* title, const char* subtitle, uint8_t frame);
void drawCleanTechSpinner(int16_t cx, int16_t cy, uint8_t frame, uint16_t accentColor, uint16_t bgColor);
void displayNoticeScreen(const char* title, const char* subtitle);
void displaySetupQrScreen();
void displayDashboardQrScreen();
void drawQrCode(const char* text, uint8_t qrVersion, int16_t x, int16_t y, uint8_t scale);
void ensureCachedQrCode(const char* text, uint8_t qrVersion, CachedQrCode &cache);
void drawCachedQrCode(const char* text, uint8_t qrVersion, int16_t x, int16_t y, uint8_t scale, CachedQrCode &cache);
void drawQrCodeCallback(esp_qrcode_handle_t qrcode);
void appendJsonEscapedString(String &target, const String &value);
void handleWiFiPortalLoop();
void setupButtonTask(void *parameter);
void networkTask(void *parameter);
bool scheduleReadingForNetwork(float temperature, float humidity);
bool sendReadingToServer(const Reading &reading);
bool sendToServer(float temperature, float humidity);
bool sendReadingDirect(const Reading &reading, bool enqueueOnFail = true);
String buildHeartbeatJson();
bool sendHeartbeatToServer();
void updateLedPatterns();
void updateBuzzer();
void updateAlarmAndState(float temperature, float humidity);
uint8_t computeAlarmMask(float temperature, float humidity);
uint8_t computeAlertMask(float temperature, float humidity);
String alarmMaskToText(uint8_t mask);
bool shouldSendImmediateTelemetry(float temperature, float humidity);
void markTelemetrySentSnapshot(float temperature, float humidity);
void queueTelemetryNow(float temperature, float humidity, unsigned long now);
bool fetchRemoteConfig();
void loadLocalConfig();
void saveLocalConfig();
void setupOta();
bool validateEnvironmentConfig();
bool configureTlsClient(WiFiClientSecure &client);
String resetReasonToText(esp_reset_reason_t reason);

bool enqueueReading(float temperature, float humidity);
bool enqueueReading(const Reading &reading);
void flushBufferedReadings();
Reading makeReading(float temperature, float humidity);
String buildTemperatureJson(const Reading &reading);
void markReadingQueuedBackfill(Reading &reading);
bool postJsonWithRetry(const String &url, const String &jsonPayload, String *responseOut = nullptr);
bool getWithRetry(const String &url, String &responseOut);
bool isWifiOfflineStable();
bool isDeviceCommunicationOffline();
bool initReadingQueue();
void updateBufferCount();
size_t getQueueFileSize();
bool compactReadingQueue(bool force = false);
void trimReadingQueueToLimits(bool forceCompact = false);
void clearReadingQueue(const char* reason);
bool peekQueuedReading(Reading &outReading);
bool dropOldestQueuedReading();
uint32_t computeRecordCrc(const PersistedReadingRecord &record);
PersistedReadingRecord readingToRecord(const Reading &reading);
bool recordToReading(const PersistedReadingRecord &record, Reading &outReading);

// =====================================================
// HELPERS
// =====================================================
bool isWifiConnected() {
  return WiFi.status() == WL_CONNECTED;
}

bool isWiFiConnectingStatus(wl_status_t status) {
  return status == WL_IDLE_STATUS || status == WL_DISCONNECTED;
}

const char* wifiStatusLabel(wl_status_t status) {
  switch (status) {
    case WL_IDLE_STATUS: return "idle/connecting";
    case WL_NO_SSID_AVAIL: return "ssid unavailable";
    case WL_SCAN_COMPLETED: return "scan completed";
    case WL_CONNECTED: return "connected";
    case WL_CONNECT_FAILED: return "connect failed";
    case WL_CONNECTION_LOST: return "connection lost";
    case WL_DISCONNECTED: return "disconnected/connecting";
    default: return "unknown";
  }
}

bool isWifiOfflineStable() {
  if (isWifiConnected()) {
    wifiDisconnectedSinceMs = 0;
    return false;
  }

  unsigned long now = millis();
  if (wifiDisconnectedSinceMs == 0) {
    wifiDisconnectedSinceMs = now;
  }

  return now - wifiDisconnectedSinceMs >= WIFI_OFFLINE_STATE_GRACE_MS;
}

bool isDeviceCommunicationOffline() {
  if (isWifiOfflineStable()) return true;
  if (!backendStatusKnown || backendReachable || backendUnreachableSinceMs == 0) {
    return false;
  }
  return millis() - backendUnreachableSinceMs >= BACKEND_OFFLINE_STATE_GRACE_MS;
}

void oledDisplayOn() {
  if (!displayReady) return;
  digitalWrite(TFT_BLK_PIN, HIGH);
  display.ssd1306_command(SSD1306_DISPLAYON);
  oledOn = true;
  oledStandbyBlank = false;
}

void oledDisplayOff() {
  if (!displayReady) return;
  display.clearDisplay();
  display.display();
  digitalWrite(TFT_BLK_PIN, LOW);
  oledOn = true;
  oledStandbyBlank = true;
}

void wakeDisplayByUser() {
  if (!displayReady) return;
  lastUserActivityMs = millis();
  lastInteractiveInputMs = lastUserActivityMs;
  if (!oledOn || oledStandbyBlank) {
    oledDisplayOn();
    oledStandbyBlank = false;
    normalDisplayPage = 0;
    activeUiScreen = -1;
    refreshCurrentDisplay();
  }
}

void updateOledStandby() {
  if (!displayReady) return;
  unsigned long now = millis();
  if (displayStandbyMin == 0) return;
  if (!oledStandbyBlank && (now - lastUserActivityMs > oledStandbyMs)) {
    oledDisplayOff();
  }
}

void rgbButtonWrite(uint8_t red, uint8_t green, uint8_t blue) {
  // Ânodo comum: PWM invertido, 255 físico apaga o canal.
  ledcWrite(BUTTON_RGB_R_PIN, 255 - red);
  ledcWrite(BUTTON_RGB_G_PIN, 255 - green);
  ledcWrite(BUTTON_RGB_B_PIN, 255 - blue);
}

uint8_t smoothGlowDuty(unsigned long t, unsigned long durationMs, uint8_t maxDuty) {
  if (durationMs < 2 || t >= durationMs) return 0;

  const unsigned long half = durationMs / 2UL;
  unsigned long linear = t <= half
    ? (t * 255UL) / max(1UL, half)
    : ((durationMs - t) * 255UL) / max(1UL, durationMs - half);
  linear = min(255UL, linear);

  // Smoothstep: arranque e fim suaves, sem saltos visuais.
  const unsigned long smooth =
    (linear * linear * (765UL - 2UL * linear)) / 65025UL;
  return (uint8_t)((smooth * maxDuty) / 255UL);
}

void setState(SysState s) {
  if (state == s) return;
  state = s;

  patternT0 = millis();
  if (state == SysState::ALERT || state == SysState::NO_WIFI) normalDisplayPage = 0;
  rgbButtonWrite(0, 0, 0);
}

void acknowledgeAlarm() {
  alarmAcked = true;
  alarmAckMs = millis();
  alarmAckTimeText = formatCurrentTime();
  alarmAckCount++;
  setState(SysState::ALARM_ACK);
  normalDisplayPage = 0;
  refreshCurrentDisplay();
  Serial.println("ALARME ACK pelo utilizador.");
}

void IRAM_ATTR buttonIsr() {
  unsigned long now = millis();
  if (now - buttonIsrLastEdgeMs < ISR_DEBOUNCE_MS) return;
  buttonIsrLastEdgeMs = now;

  bool pressed = digitalRead(BUTTON_PIN) == LOW;

  if (pressed) {
    buttonPressStartedSeen = true;
    buttonIsrPressStartMs = now;
    return;
  }

  unsigned long duration = now - buttonIsrPressStartMs;
  if (
    duration >= VALID_SHORT_PRESS_MIN_MS &&
    duration < LONG_PRESS_MS &&
    now - buttonLastShortPressMs >= SHORT_PRESS_COOLDOWN_MS
  ) {
    buttonLastShortPressMs = now;
    buttonShortPressSeen = true;
  }
}

void processButtonInterruptEvents() {
  bool shortPressSeen = false;
  bool pressStartedSeen = false;

  noInterrupts();
  if (buttonShortPressSeen) {
    shortPressSeen = true;
    buttonShortPressSeen = false;
  }
  if (buttonPressStartedSeen) {
    pressStartedSeen = true;
    buttonPressStartedSeen = false;
  }
  interrupts();

  if (pressStartedSeen && (!oledOn || oledStandbyBlank)) {
    wakeDisplayByUser();
    buttonPressWokeDisplay = true;
  }

  if (!shortPressSeen) return;

  bool wasDisplaySleeping = buttonPressWokeDisplay || !oledOn || oledStandbyBlank;
  buttonPressWokeDisplay = false;
  wakeDisplayByUser();
  if (!wasDisplaySleeping && (state == SysState::NORMAL || state == SysState::ALERT || state == SysState::ALARM || state == SysState::ALARM_ACK || state == SysState::NO_WIFI)) {
    advanceNormalDisplayPage();
  } else if (!wasDisplaySleeping && state == SysState::SETUP_WIFI) {
    advanceSetupDisplayPage();
  }
}

void serviceInteractiveTasks() {
  if (!interactiveTasksReady) return;

  handleButton();
  processButtonInterruptEvents();
  updateOledStandby();
  updateLedPatterns();
  if (isWifiConnected()) {
    ArduinoOTA.handle();
  }
  feedMainTaskWatchdog();
}

bool registerMainTaskWatchdog(const char* context) {
  if (esp_task_wdt_status(NULL) == ESP_OK) {
    mainTaskWdtRegistered = true;
    return true;
  }

  esp_err_t addResult = esp_task_wdt_add(NULL);
  if (addResult == ESP_ERR_INVALID_STATE) {
    esp_task_wdt_config_t config = {};
    config.timeout_ms = 30000;
    config.idle_core_mask = 0;
    config.trigger_panic = true;
    esp_err_t initResult = esp_task_wdt_init(&config);
    if (initResult != ESP_OK && initResult != ESP_ERR_INVALID_STATE) {
      Serial.print("Falha ao inicializar watchdog em ");
      Serial.print(context);
      Serial.print(": ");
      Serial.println((int)initResult);
      mainTaskWdtRegistered = false;
      return false;
    }
    addResult = esp_task_wdt_add(NULL);
  }

  mainTaskWdtRegistered = addResult == ESP_OK || esp_task_wdt_status(NULL) == ESP_OK;
  if (!mainTaskWdtRegistered) {
    Serial.print("Falha ao registar watchdog em ");
    Serial.print(context);
    Serial.print(": ");
    Serial.println((int)addResult);
  }
  return mainTaskWdtRegistered;
}

bool unregisterMainTaskWatchdog(const char* context) {
  if (esp_task_wdt_status(NULL) == ESP_OK) {
    esp_err_t result = esp_task_wdt_delete(NULL);
    if (result != ESP_OK) {
      Serial.print("Falha ao suspender watchdog em ");
      Serial.print(context);
      Serial.print(": ");
      Serial.println((int)result);
      return false;
    }
  }
  mainTaskWdtRegistered = false;
  return true;
}

void feedMainTaskWatchdog() {
  if (!mainTaskWdtRegistered) return;

  if (esp_task_wdt_status(NULL) != ESP_OK) {
    mainTaskWdtRegistered = false;
    return;
  }

  esp_err_t result = esp_task_wdt_reset();
  if (result != ESP_OK) {
    mainTaskWdtRegistered = false;
  }
}

String currentDeviceStatus() {
  switch (state) {
    case SysState::NORMAL:
      return "normal";
    case SysState::ALERT:
      return "alert";
    case SysState::NO_WIFI:
      return "no_wifi";
    case SysState::ALARM:
      return "alarm";
    case SysState::ALARM_ACK:
      return "alarm_ack";
    case SysState::SENSOR_FAIL:
      return "sensor_fail";
    case SysState::SETUP_WIFI:
      return "setup_wifi";
    default:
      return "unknown";
  }
}

String resetReasonToText(esp_reset_reason_t reason) {
  switch (reason) {
    case ESP_RST_POWERON: return "power_on";
    case ESP_RST_EXT: return "external_reset";
    case ESP_RST_SW: return "software_reset";
    case ESP_RST_PANIC: return "panic";
    case ESP_RST_INT_WDT: return "interrupt_watchdog";
    case ESP_RST_TASK_WDT: return "task_watchdog";
    case ESP_RST_WDT: return "watchdog";
    case ESP_RST_DEEPSLEEP: return "deep_sleep";
    case ESP_RST_BROWNOUT: return "brownout";
    case ESP_RST_SDIO: return "sdio";
    default: return "unknown";
  }
}

// =====================================================
// LOCAL CONFIG
// =====================================================
void loadLocalConfig() {
  tempLowC = prefs.getFloat("temp_low", tempLowC);
  tempHighC = prefs.getFloat("temp_high", tempHighC);
  humLow = prefs.getFloat("hum_low", humLow);
  humHigh = prefs.getFloat("hum_high", humHigh);
  hystC = prefs.getFloat("hyst_c", hystC);
  hystHum = prefs.getFloat("hyst_hum", hystHum);
  sendIntervalS = prefs.getInt("send_s", sendIntervalS);
  displayStandbyMin = prefs.getInt("standby_m", displayStandbyMin);
  buzzerEnabled = prefs.getBool("buzzer_en", buzzerEnabled);
  configVersion = prefs.getInt("cfg_ver", configVersion);
  lastRemoteAckToken = prefs.getString("remote_ack", "");
  alarmStartedEpoch = prefs.getUInt("alarm_epoch", 0);

  if (sendIntervalS < MIN_SEND_INTERVAL_S) sendIntervalS = MIN_SEND_INTERVAL_S;
  if (sendIntervalS > MAX_SEND_INTERVAL_S) sendIntervalS = MAX_SEND_INTERVAL_S;
  if (displayStandbyMin <= 0 || displayStandbyMin > MAX_DISPLAY_STANDBY_MIN) {
    displayStandbyMin = MAX_DISPLAY_STANDBY_MIN;
  }

  sendIntervalMs = (unsigned long)sendIntervalS * 1000UL;
  oledStandbyMs = (unsigned long)displayStandbyMin * 60UL * 1000UL;

  Serial.println("Config local carregada.");
}

void saveLocalConfig() {
  prefs.putFloat("temp_low", tempLowC);
  prefs.putFloat("temp_high", tempHighC);
  prefs.putFloat("hum_low", humLow);
  prefs.putFloat("hum_high", humHigh);
  prefs.putFloat("hyst_c", hystC);
  prefs.putFloat("hyst_hum", hystHum);
  prefs.putInt("send_s", sendIntervalS);
  prefs.putInt("standby_m", displayStandbyMin);
  prefs.putBool("buzzer_en", buzzerEnabled);
  prefs.putInt("cfg_ver", configVersion);
  prefs.putString("remote_ack", lastRemoteAckToken);
  Serial.println("Config local persistida.");
}

// =====================================================
// OTA
// =====================================================
void setupOta() {
#if !STS_ENABLE_OTA
  return;
#endif
  if (!isWifiConnected() || otaStarted) return;

  ArduinoOTA.setHostname(DEVICE_ID);
  if (strlen(OTA_PASSWORD) == 0 || String(OTA_PASSWORD) == "REPLACE_WITH_OTA_PASSWORD") {
    Serial.println("AVISO: OTA_PASSWORD nao configurada.");
  } else {
    ArduinoOTA.setPassword(OTA_PASSWORD);
  }

  ArduinoOTA.onStart([]() {
    Serial.println("OTA iniciado.");
    if (!displayReady) return;
    oledDisplayOn();
    display.clearDisplay();
    display.setTextColor(WHITE);
    display.setTextSize(1);
    display.setCursor(0, 0);
    display.print("OTA update");
    display.setCursor(0, 18);
    display.print("Nao desligar");
    display.display();
  });

  ArduinoOTA.onEnd([]() {
    Serial.println("OTA concluido.");
  });

  ArduinoOTA.onError([](ota_error_t error) {
    Serial.print("Erro OTA: ");
    Serial.println((int)error);
  });

  ArduinoOTA.begin();
  otaStarted = true;
  Serial.println("OTA pronto.");
}

bool isMissingOrPlaceholder(const char* value) {
  if (value == nullptr || strlen(value) == 0) return true;
  String normalized = String(value);
  normalized.toUpperCase();
  return normalized.indexOf("REPLACE_WITH_") >= 0 || normalized.indexOf("EXAMPLE.INVALID") >= 0;
}

bool validateEnvironmentConfig() {
  bool valid = true;
  const String backend = String(STS_BACKEND_BASE_URL);

  if (!backend.startsWith("https://") || isMissingOrPlaceholder(STS_BACKEND_BASE_URL)) {
    Serial.println("BLOQUEADO: endpoint HTTPS de STAGING nao configurado.");
    valid = false;
  }
  if (isMissingOrPlaceholder(STS_DEVICE_API_TOKEN)) {
    Serial.println("BLOQUEADO: token de dispositivo STAGING nao configurado.");
    valid = false;
  }
  if (isMissingOrPlaceholder(STS_WIFI_AP_PASSWORD) || strlen(STS_WIFI_AP_PASSWORD) < 12) {
    Serial.println("BLOQUEADO: password unica do portal WiFi STAGING em falta.");
    valid = false;
  }
  if (isMissingOrPlaceholder(STS_TLS_ROOT_CA)) {
    Serial.println("BLOQUEADO: CA TLS do endpoint STAGING nao configurada.");
    valid = false;
  }
#if STS_ENABLE_OTA
  if (isMissingOrPlaceholder(STS_OTA_PASSWORD) || strlen(STS_OTA_PASSWORD) < 16) {
    Serial.println("BLOQUEADO: password OTA STAGING em falta.");
    valid = false;
  }
#endif

  return valid;
}

bool configureTlsClient(WiFiClientSecure &client) {
  if (!environmentConfigValid || isMissingOrPlaceholder(STS_TLS_ROOT_CA)) {
    return false;
  }
  client.setCACert(STS_TLS_ROOT_CA);
  return true;
}

void syncClock() {
  if (!isWifiConnected()) {
    clockSynced = false;
    return;
  }

  if (userInteractionInProgress()) return;

  unsigned long now = millis();
  unsigned long interval = clockSynced ? CLOCK_RESYNC_INTERVAL_MS : CLOCK_RETRY_INTERVAL_MS;
  if (lastClockSyncAttemptMs != 0 && now - lastClockSyncAttemptMs < interval) {
    return;
  }

  lastClockSyncAttemptMs = now;

  configTzTime(TIMEZONE_TZ, NTP_SERVER_1, NTP_SERVER_2);

  struct tm timeinfo;
  if (getLocalTime(&timeinfo, CLOCK_SYNC_BLOCK_MS) && time(nullptr) > CLOCK_VALID_AFTER_EPOCH) {
    clockSynced = true;
    lastClockSyncOkMs = now;
    Serial.println("Hora sincronizada e confirmada.");
  } else {
    clockSynced = false;
    Serial.println("Sincronizacao horaria pendente.");
  }
}

// =====================================================
// BUFFER
// =====================================================
Reading makeReading(float temperature, float humidity) {
  Reading reading;
  reading.temperature = temperature;
  reading.humidity = humidity;
  reading.secondaryTemperature = lastInternalTemperature;
  reading.secondaryHumidity = lastInternalHumidity;
  reading.secondarySensorOk =
    internalSensorHealthy &&
    !isnan(lastInternalTemperature) &&
    !isnan(lastInternalHumidity);
  reading.sensorSemanticsVersion = SENSOR_SEMANTICS_SHT30_PRIMARY;
  reading.sequence = ++telemetrySequence;
  reading.capturedMillis = millis();
  time_t nowEpoch = time(nullptr);
  reading.capturedEpoch = nowEpoch > CLOCK_VALID_AFTER_EPOCH ? (uint32_t)nowEpoch : 0;
  reading.deliveryAttempts = 0;
  reading.capturedOffline = !isWifiConnected();
  reading.captureNetworkKnown = true;
  reading.queuedBackfill = false;
  reading.sampleAgeOverrideS = 0;
  return reading;
}

uint32_t computeRecordCrc(const PersistedReadingRecord &record) {
  const uint8_t *bytes = reinterpret_cast<const uint8_t*>(&record);
  size_t len = offsetof(PersistedReadingRecord, crc);
  uint32_t hash = 2166136261UL;

  for (size_t i = 0; i < len; i++) {
    hash ^= bytes[i];
    hash *= 16777619UL;
  }

  return hash;
}

PersistedReadingRecord readingToRecord(const Reading &reading) {
  PersistedReadingRecord record = {};
  record.magic = QUEUE_RECORD_MAGIC;
  record.version = QUEUE_RECORD_VERSION;
  record.deliveryAttempts = reading.deliveryAttempts;
  record.reserved = QUEUE_CAPTURE_NETWORK_KNOWN;
  if (reading.capturedOffline) record.reserved |= QUEUE_CAPTURED_OFFLINE;
  if (reading.queuedBackfill) record.reserved |= QUEUE_RETRY_BACKFILL;
  if (reading.sensorSemanticsVersion >= SENSOR_SEMANTICS_SHT30_PRIMARY) {
    record.reserved |= QUEUE_SENSOR_SEMANTICS_V2;
  }
  record.temperature = reading.temperature;
  record.humidity = reading.humidity;
  // These persisted fields retain their binary layout. Their semantic meaning is
  // selected by QUEUE_SENSOR_SEMANTICS_V2 when the record is serialized to JSON.
  record.exteriorTemperature = reading.secondaryTemperature;
  record.exteriorHumidity = reading.secondaryHumidity;
  record.exteriorSensorOk = reading.secondarySensorOk ? 1 : 0;
  record.sequence = reading.sequence;
  record.capturedMillis = (uint32_t)reading.capturedMillis;
  record.capturedEpoch = reading.capturedEpoch;
  record.crc = computeRecordCrc(record);
  return record;
}

bool recordToReading(const PersistedReadingRecord &record, Reading &outReading) {
  if (record.magic != QUEUE_RECORD_MAGIC || record.version != QUEUE_RECORD_VERSION) {
    return false;
  }

  if (record.crc != computeRecordCrc(record)) {
    return false;
  }

  outReading.temperature = record.temperature;
  outReading.humidity = record.humidity;
  outReading.secondaryTemperature = record.exteriorTemperature;
  outReading.secondaryHumidity = record.exteriorHumidity;
  outReading.secondarySensorOk = record.exteriorSensorOk != 0;
  outReading.sensorSemanticsVersion =
    (record.reserved & QUEUE_SENSOR_SEMANTICS_V2) != 0
      ? SENSOR_SEMANTICS_SHT30_PRIMARY
      : 1;
  outReading.sequence = record.sequence;
  outReading.capturedMillis = record.capturedMillis;
  outReading.capturedEpoch = record.capturedEpoch;
  outReading.deliveryAttempts = record.deliveryAttempts;
  outReading.captureNetworkKnown = (record.reserved & QUEUE_CAPTURE_NETWORK_KNOWN) != 0;
  outReading.capturedOffline =
    outReading.captureNetworkKnown && (record.reserved & QUEUE_CAPTURED_OFFLINE) != 0;
  outReading.queuedBackfill = (record.reserved & QUEUE_RETRY_BACKFILL) != 0;
  outReading.sampleAgeOverrideS = 0;
  return true;
}

void markReadingQueuedBackfill(Reading &reading) {
  reading.queuedBackfill = true;
  reading.captureNetworkKnown = true;
  if (!isWifiConnected()) {
    reading.capturedOffline = true;
  }
}

size_t getQueueFileSize() {
  if (!queueReady || !LittleFS.exists(QUEUE_FILE)) return 0;

  File file = LittleFS.open(QUEUE_FILE, "r");
  if (!file) return 0;

  size_t size = file.size();
  file.close();
  return size;
}

void updateBufferCount() {
  size_t fileSize = getQueueFileSize();
  if (!queueReady || queueReadOffset >= fileSize) {
    bufferCount = 0;
    return;
  }

  bufferCount = (int)((fileSize - queueReadOffset) / sizeof(PersistedReadingRecord));
}

void clearReadingQueue(const char* reason) {
  if (!queueReady) return;

  Serial.print("Fila offline limpa: ");
  Serial.println(reason);
  LittleFS.remove(QUEUE_TMP_FILE);
  LittleFS.remove(QUEUE_FILE);
  queueReadOffset = 0;
  prefs.putULong(PREF_QUEUE_OFFSET, 0);
  bufferCount = 0;
}

bool compactReadingQueue(bool force) {
  if (!queueReady) return false;

  size_t fileSize = getQueueFileSize();
  if (fileSize == 0 || queueReadOffset >= fileSize) {
    LittleFS.remove(QUEUE_FILE);
    queueReadOffset = 0;
    prefs.putULong(PREF_QUEUE_OFFSET, 0);
    updateBufferCount();
    return true;
  }

  if (!force && queueReadOffset < QUEUE_COMPACT_THRESHOLD_BYTES) {
    updateBufferCount();
    return true;
  }

  File source = LittleFS.open(QUEUE_FILE, "r");
  if (!source) return false;

  if (!source.seek(queueReadOffset)) {
    source.close();
    return false;
  }

  File target = LittleFS.open(QUEUE_TMP_FILE, "w");
  if (!target) {
    source.close();
    return false;
  }

  uint8_t chunk[256];
  while (source.available()) {
    serviceInteractiveTasks();
    size_t readLen = source.read(chunk, sizeof(chunk));
    if (readLen == 0) break;
    if (target.write(chunk, readLen) != readLen) {
      source.close();
      target.close();
      LittleFS.remove(QUEUE_TMP_FILE);
      return false;
    }
    serviceInteractiveTasks();
  }

  source.close();
  target.close();

  LittleFS.remove(QUEUE_FILE);
  if (!LittleFS.rename(QUEUE_TMP_FILE, QUEUE_FILE)) {
    Serial.println("Falha ao compactar fila offline.");
    return false;
  }

  queueReadOffset = 0;
  prefs.putULong(PREF_QUEUE_OFFSET, 0);
  updateBufferCount();
  Serial.print("Fila offline compactada. Pendentes: ");
  Serial.println(bufferCount);
  return true;
}

bool initReadingQueue() {
  queueReady = LittleFS.begin(true);
  if (!queueReady) {
    Serial.println("Falha ao inicializar LittleFS. Fila offline indisponivel.");
    bufferCount = 0;
    return false;
  }

  queueReadOffset = prefs.getULong(PREF_QUEUE_OFFSET, 0);
  size_t fileSize = getQueueFileSize();

  if (queueReadOffset > fileSize || queueReadOffset % sizeof(PersistedReadingRecord) != 0) {
    queueReadOffset = 0;
    prefs.putULong(PREF_QUEUE_OFFSET, 0);
  }

  compactReadingQueue(false);
  updateBufferCount();
  trimReadingQueueToLimits(true);

  Serial.print("Fila offline pronta. Pendentes: ");
  Serial.println(bufferCount);
  return true;
}

bool dropOldestQueuedReading() {
  if (!queueReady || bufferCount <= 0) return false;

  queueReadOffset += sizeof(PersistedReadingRecord);
  prefs.putULong(PREF_QUEUE_OFFSET, queueReadOffset);
  compactReadingQueue(false);
  updateBufferCount();
  return true;
}

void trimReadingQueueToLimits(bool forceCompact) {
  if (!queueReady) return;

  updateBufferCount();
  size_t fileSize = getQueueFileSize();
  bool dropped = false;

  while (bufferCount > 0 && (bufferCount >= (int)QUEUE_MAX_RECORDS || fileSize >= QUEUE_MAX_BYTES)) {
    serviceInteractiveTasks();
    if (!dropOldestQueuedReading()) break;
    dropped = true;
    fileSize = getQueueFileSize();
  }

  if (dropped || forceCompact) {
    if (!compactReadingQueue(true)) {
      clearReadingQueue("sem espaco para compactar");
    }
    updateBufferCount();
  }
}

bool peekQueuedReading(Reading &outReading) {
  if (!queueReady) return false;

  updateBufferCount();
  if (bufferCount <= 0) return false;

  File file = LittleFS.open(QUEUE_FILE, "r");
  if (!file) return false;

  while (bufferCount > 0) {
    serviceInteractiveTasks();
    if (!file.seek(queueReadOffset)) {
      file.close();
      return false;
    }

    PersistedReadingRecord record = {};
    size_t readLen = file.read(reinterpret_cast<uint8_t*>(&record), sizeof(record));
    if (readLen != sizeof(record)) {
      file.close();
      return false;
    }

    if (recordToReading(record, outReading)) {
      file.close();
      return true;
    }

    Serial.println("Registo offline invalido descartado.");
    queueReadOffset += sizeof(PersistedReadingRecord);
    prefs.putULong(PREF_QUEUE_OFFSET, queueReadOffset);
    updateBufferCount();
  }

  file.close();
  compactReadingQueue(true);
  return false;
}

bool enqueueReading(const Reading &reading) {
  if (!queueReady && !initReadingQueue()) {
    Serial.println("Fila offline indisponivel: leitura nao persistida.");
    return false;
  }

  trimReadingQueueToLimits(false);

  PersistedReadingRecord record = readingToRecord(reading);
  File file = LittleFS.open(QUEUE_FILE, "a");
  if (!file) {
    Serial.println("Falha ao abrir fila offline para escrita.");
    for (uint8_t i = 0; i < 64 && dropOldestQueuedReading(); i++) {
      Serial.println("A libertar espaco na fila offline.");
    }
    trimReadingQueueToLimits(true);
    file = LittleFS.open(QUEUE_FILE, "a");
  }

  if (!file) {
    Serial.println("Fila offline sem espaco: leitura nao persistida.");
    clearReadingQueue("sem espaco para abrir escrita");
    file = LittleFS.open(QUEUE_FILE, "a");
    if (!file) return false;
  }

  size_t written = file.write(reinterpret_cast<const uint8_t*>(&record), sizeof(record));
  file.close();

  if (written != sizeof(record)) {
    Serial.println("Falha ao gravar leitura offline.");
    for (uint8_t i = 0; i < 64 && dropOldestQueuedReading(); i++) {
      Serial.println("A libertar espaco apos falha de escrita.");
    }
    trimReadingQueueToLimits(true);
    file = LittleFS.open(QUEUE_FILE, "a");
    if (!file) {
      clearReadingQueue("sem espaco para reabrir escrita");
      file = LittleFS.open(QUEUE_FILE, "a");
      if (!file) return false;
    }
    written = file.write(reinterpret_cast<const uint8_t*>(&record), sizeof(record));
    file.close();
    if (written != sizeof(record)) {
      Serial.println("Fila offline sem espaco apos retry: leitura nao persistida.");
      clearReadingQueue("sem espaco apos retry de escrita");
      file = LittleFS.open(QUEUE_FILE, "a");
      if (!file) return false;
      written = file.write(reinterpret_cast<const uint8_t*>(&record), sizeof(record));
      file.close();
      if (written != sizeof(record)) return false;
    }
  }

  updateBufferCount();
  Serial.print("Leitura em fila offline. Pendentes: ");
  Serial.println(bufferCount);
  return true;
}

bool enqueueReading(float temperature, float humidity) {
  Reading reading = makeReading(temperature, humidity);
  return enqueueReading(reading);
}

void flushBufferedReadings() {
  updateBufferCount();
  if (!isWifiConnected() || bufferCount == 0) return;

  unsigned long now = millis();
  if (bufferFlushPausedUntilMs != 0 && now < bufferFlushPausedUntilMs) {
    return;
  }

  if (bufferFlushPausedUntilMs != 0 && now >= bufferFlushPausedUntilMs) {
    bufferFlushPausedUntilMs = 0;
  }

  if (lastBufferFlushMs != 0 && now - lastBufferFlushMs < BUFFER_FLUSH_INTERVAL_MS) {
    return;
  }

  Serial.print("A reenviar buffer. Pendentes: ");
  Serial.println(bufferCount);

  int itemsToProcess = min(bufferCount, BUFFER_FLUSH_BATCH_SIZE);
  int sentCount = 0;
  for (int i = 0; i < itemsToProcess; i++) {
    serviceInteractiveTasks();
    Reading r;
    if (!peekQueuedReading(r)) break;

    if (r.capturedEpoch == 0 && millis() < r.capturedMillis) {
      unsigned long estimatedAgeS =
        (unsigned long)max(1, bufferCount) * (unsigned long)max(MIN_SEND_INTERVAL_S, sendIntervalS);
      const unsigned long maxBackfillAgeS = 30UL * 24UL * 60UL * 60UL;
      r.sampleAgeOverrideS = min(estimatedAgeS, maxBackfillAgeS - 1);
      Serial.print("Leitura sem timestamp real apos reboot. Idade estimada: ");
      Serial.print(r.sampleAgeOverrideS);
      Serial.println("s");
    }

    r.deliveryAttempts++;
    String payload = buildTemperatureJson(r);
    if (!postJsonWithRetry(String(temperatureUrl), payload)) {
      Serial.println("Falha ao reenviar buffer. Tenta mais tarde.");
      bufferFlushPausedUntilMs = millis() + BUFFER_FLUSH_FAILURE_COOLDOWN_MS;
      break;
    }

    dropOldestQueuedReading();
    sentCount++;
    responsiveDelay(BUFFER_FLUSH_ITEM_DELAY_MS);
    serviceInteractiveTasks();
  }

  if (sentCount > 0) {
    updateBufferCount();
    Serial.print("Buffer reenviado neste ciclo: ");
    Serial.print(sentCount);
    Serial.print(" | Pendentes: ");
    Serial.println(bufferCount);
  }

  lastBufferFlushMs = millis();
}

// =====================================================
// BUTTON
// Short press: wake OLED
// 2s: ACK alarm
// 8s: reset WiFi credentials + setup portal
// =====================================================
void handleButton() {
  unsigned long now = millis();
  bool raw = digitalRead(BUTTON_PIN);

  if (raw != rawBtnLast) {
    rawBtnLast = raw;
    lastDebounceMs = now;
  }

  if ((now - lastDebounceMs) < DEBOUNCE_MS) return;

  if (btnStable != raw) {
    btnStable = raw;

    if (btnStable == LOW) {
      pressInProgress = true;
      pressStartMs = now;
      ackPressFired = false;
      wifiResetFired = false;
    } else if (pressInProgress) {
      noInterrupts();
      buttonShortPressSeen = false;
      interrupts();

      unsigned long pressDuration = now - pressStartMs;
      pressInProgress = false;
      wifiResetArmed = true;

      if (!ackPressFired && !wifiResetFired) {
        if (
          pressDuration >= VALID_SHORT_PRESS_MIN_MS &&
          pressDuration < LONG_PRESS_MS &&
          now - buttonLastShortPressMs >= SHORT_PRESS_COOLDOWN_MS
        ) {
          buttonLastShortPressMs = now;
          bool wasDisplaySleeping = buttonPressWokeDisplay || !oledOn || oledStandbyBlank;
          buttonPressWokeDisplay = false;
          wakeDisplayByUser();
          if (!wasDisplaySleeping && (state == SysState::NORMAL || state == SysState::ALERT || state == SysState::ALARM || state == SysState::ALARM_ACK || state == SysState::NO_WIFI)) {
            advanceNormalDisplayPage();
          } else if (!wasDisplaySleeping && state == SysState::SETUP_WIFI) {
            advanceSetupDisplayPage();
          }
        } else {
          Serial.println("Pulso curto ignorado.");
        }
      }
    }
  }

  if (pressInProgress && btnStable == LOW) {
    unsigned long heldMs = now - pressStartMs;

    if (alarmActive && !alarmAcked && !ackPressFired && heldMs >= LONG_PRESS_MS) {
      ackPressFired = true;
      wakeDisplayByUser();
      acknowledgeAlarm();
    }

    if (wifiResetArmed && !wifiResetFired && heldMs >= WIFI_PORTAL_LONG_PRESS_MS) {
      wifiResetFired = true;
      wifiResetArmed = false;
      wakeDisplayByUser();
      setWiFiSetupPending(true);
      wifiPortalRequested = true;
      Serial.println("Pedido de reset/setup WiFi por botao.");
    }
  }
}

void responsiveDelay(unsigned long durationMs) {
  unsigned long start = millis();
  while (millis() - start < durationMs) {
    serviceInteractiveTasks();
    delay(10);
  }
}

bool userInteractionInProgress() {
  return lastInteractiveInputMs != 0 && millis() - lastInteractiveInputMs < USER_INTERACTION_NETWORK_GRACE_MS;
}

bool handleStartupWifiResetButton() {
  static bool startupPressActive = false;
  static unsigned long startupPressStartMs = 0;
  static bool startupResetFired = false;

  bool pressed = digitalRead(BUTTON_PIN) == LOW;
  unsigned long now = millis();

  if (pressed && !startupPressActive) {
    startupPressActive = true;
    startupPressStartMs = now;
    startupResetFired = false;
  }

  if (!pressed) {
    startupPressActive = false;
    startupResetFired = false;
    return false;
  }

  if (
    startupPressActive &&
    !startupResetFired &&
    now - startupPressStartMs >= WIFI_PORTAL_LONG_PRESS_MS
  ) {
    startupResetFired = true;
    setWiFiSetupPending(true);
    wifiPortalRequested = true;
    wakeDisplayByUser();
    Serial.println("Pedido de reset/setup WiFi durante arranque.");
    return true;
  }

  return false;
}

void handleWiFiPortalLoop() {
  feedMainTaskWatchdog();
  updateLedPatterns();
}

void setupButtonTask(void *parameter) {
  (void)parameter;
  bool lastRaw = digitalRead(BUTTON_PIN);
  bool stable = lastRaw;
  unsigned long debounceStartMs = millis();
  unsigned long localPressStartMs = 0;
  bool localPressActive = false;

  while (setupButtonTaskActive) {
    updateLedPatterns();

    bool raw = digitalRead(BUTTON_PIN);
    unsigned long now = millis();

    if (raw != lastRaw) {
      lastRaw = raw;
      debounceStartMs = now;
    }

    if (now - debounceStartMs >= DEBOUNCE_MS && stable != raw) {
      stable = raw;

      if (stable == LOW) {
        localPressActive = true;
        localPressStartMs = now;
      } else if (localPressActive) {
        unsigned long duration = now - localPressStartMs;
        localPressActive = false;

        if (duration >= VALID_SHORT_PRESS_MIN_MS && duration < LONG_PRESS_MS) {
          lastInteractiveInputMs = millis();
          lastUserActivityMs = lastInteractiveInputMs;
          setupDisplayPage = (setupDisplayPage + 1) % 2;
          displaySetupQrScreen();
        }
      }
    }

    delay(10);
  }

  setupButtonTaskHandle = nullptr;
  vTaskDelete(nullptr);
}

// =====================================================
// WIFI
// =====================================================
void startWiFiSetupPortal(bool resetCredentials, bool keepPortalOpen) {
  Serial.println("A abrir portal WiFi...");
  wifiPortalRequested = false;
  setState(SysState::SETUP_WIFI);
  setupDisplayPage = 0;

  if (displayReady && oledOn && !oledStandbyBlank) {
    displaySetupQrScreen();
  }

  if (resetCredentials) {
    Serial.println("A limpar credenciais WiFi guardadas...");
    rememberCurrentWiFiCredentials();
    setWiFiSetupPending(true);
    setWiFiProvisioned(false);
    wm.resetSettings();
    WiFi.disconnect(true, true);
    responsiveDelay(150);
  } else {
    Serial.println("A abrir portal sem apagar credenciais guardadas.");
    setWiFiSetupPending(false);
  }

  unsigned int portalTimeoutS = (resetCredentials || keepPortalOpen) ? 0 : 300;

  configureWiFiStation();
  wm.setDebugOutput(true);
  wm.setTitle("STS WiFi Setup");
  wm.setCustomHeadElement(WIFI_PORTAL_HEAD);
  wm.setConfigPortalTimeout(portalTimeoutS);
  wm.setConnectTimeout(45);
  wm.setRemoveDuplicateAPs(false);
  wm.setMinimumSignalQuality(0);
  wm.setCaptivePortalEnable(true);
  wm.setBreakAfterConfig(false);
  wm.setAPCallback([](WiFiManager *manager) {
    (void)manager;
    displaySetupQrScreen();
  });
  wm.setConfigPortalBlocking(true);
  wm.setConfigPortalTimeout(portalTimeoutS);
  wm.setSaveConfigCallback([]() {
    Serial.println("Credenciais WiFi recebidas.");
  });

  setupButtonTaskActive = true;
  if (setupButtonTaskHandle == nullptr) {
    xTaskCreatePinnedToCore(
      setupButtonTask,
      "setupButton",
      4096,
      nullptr,
      1,
      &setupButtonTaskHandle,
      1
    );
  }

  unregisterMainTaskWatchdog("portal WiFi");

  bool connectedAfterPortal;
  if (strlen(WIFI_AP_PASSWORD) >= 8) {
    connectedAfterPortal = wm.autoConnect(WIFI_AP_NAME, WIFI_AP_PASSWORD);
  } else {
    connectedAfterPortal = wm.autoConnect(WIFI_AP_NAME);
  }

  registerMainTaskWatchdog("portal WiFi");
  setupButtonTaskActive = false;
  responsiveDelay(20);

  connectedAfterPortal = connectedAfterPortal && isWifiConnected();
  if (!connectedAfterPortal && hasStoredWiFiCredentials()) {
    Serial.println("WiFiManager falhou. A repetir ligacao com credenciais guardadas...");
    connectedAfterPortal = connectSavedWiFi(
      WIFI_PORTAL_RETRY_TIMEOUT_MS,
      "A ligar WiFi",
      "A validar rede",
      false
    );
  }

  if (connectedAfterPortal) {
    Serial.println("WiFi configurado com sucesso.");
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
    setWiFiSetupPending(false);
    setWiFiProvisioned(true);
    wifiPortalRequested = false;
    pressInProgress = false;
    wifiResetFired = true;
    wifiResetArmed = digitalRead(BUTTON_PIN) == HIGH;
    configureWiFiStation();
    rememberCurrentWiFiCredentials();

    setState(SysState::NORMAL);
    lastUserActivityMs = millis();

    displayNoticeScreen("Setup concluido", "WiFi ligado");
    responsiveDelay(1200);

    setupOta();
    syncClock();
    fetchRemoteConfig();
  } else {
    setWiFiSetupPending(true);
    Serial.println("Portal WiFi sem ligacao valida. Mantem setup pendente.");
    displayNoticeScreen("WiFi nao ligou", "Ver pass/2.4GHz");
    responsiveDelay(1200);
  }

  setState(connectedAfterPortal ? SysState::NORMAL : SysState::NO_WIFI);
  lastDisplay = 0;
  lastConfigFetch = millis();
}

bool isWiFiSetupPending() {
  return prefs.getBool(PREF_WIFI_SETUP_PENDING, false);
}

void setWiFiSetupPending(bool pending) {
  prefs.putBool(PREF_WIFI_SETUP_PENDING, pending);
}

bool isWiFiProvisioned() {
  return prefs.getBool(PREF_WIFI_PROVISIONED, false);
}

void setWiFiProvisioned(bool provisioned) {
  prefs.putBool(PREF_WIFI_PROVISIONED, provisioned);
}

bool hasStoredWiFiCredentials() {
  wifi_config_t config;
  memset(&config, 0, sizeof(config));

  if (esp_wifi_get_config(WIFI_IF_STA, &config) != ESP_OK) {
    return false;
  }

  return strlen((const char*)config.sta.ssid) > 0;
}

void knownWiFiKey(char *out, size_t outSize, const char* prefix, uint8_t index) {
  snprintf(out, outSize, "%s%u", prefix, index);
}

bool hasKnownWiFiNetworks() {
  for (uint8_t i = 0; i < KNOWN_WIFI_MAX; i++) {
    char ssidKey[15];
    knownWiFiKey(ssidKey, sizeof(ssidKey), "wifi_s", i);

    String ssid = prefs.getString(ssidKey, "");
    ssid.trim();
    if (ssid.length() > 0) return true;
  }

  return false;
}

bool readCurrentWiFiCredentials(String &ssid, String &password) {
  wifi_config_t config;
  memset(&config, 0, sizeof(config));

  if (esp_wifi_get_config(WIFI_IF_STA, &config) != ESP_OK) {
    ssid = "";
    password = "";
    return false;
  }

  ssid = String((const char*)config.sta.ssid);
  password = String((const char*)config.sta.password);
  ssid.trim();

  return ssid.length() > 0;
}

bool readKnownWiFiNetwork(uint8_t index, String &ssid, String &password) {
  if (index >= KNOWN_WIFI_MAX) {
    ssid = "";
    password = "";
    return false;
  }

  char ssidKey[15];
  char passKey[15];
  knownWiFiKey(ssidKey, sizeof(ssidKey), "wifi_s", index);
  knownWiFiKey(passKey, sizeof(passKey), "wifi_p", index);

  ssid = prefs.getString(ssidKey, "");
  password = prefs.getString(passKey, "");
  ssid.trim();
  return ssid.length() > 0;
}

void configureWiFiStation() {
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(true);
  WiFi.setSleep(false);
  WiFi.setTxPower(WIFI_POWER_19_5dBm);
  esp_wifi_set_ps(WIFI_PS_NONE);
}

bool beginPreferredWiFi() {
  String ssid;
  String password;

  if (readCurrentWiFiCredentials(ssid, password)) {
    Serial.print("A relancar WiFi com credenciais atuais: ");
    Serial.println(ssid);
    WiFi.begin(ssid.c_str(), password.c_str());
    return true;
  }

  if (readKnownWiFiNetwork(0, ssid, password)) {
    Serial.print("A relancar WiFi com rede conhecida: ");
    Serial.println(ssid);
    WiFi.begin(ssid.c_str(), password.c_str());
    return true;
  }

  Serial.println("A relancar WiFi com perfil guardado no ESP32.");
  WiFi.begin();
  return false;
}

void rememberKnownWiFiNetwork(const String &ssid, const String &password) {
  String cleanSsid = ssid;
  cleanSsid.trim();

  if (cleanSsid.length() == 0 || cleanSsid == WIFI_AP_NAME) return;

  String ssids[KNOWN_WIFI_MAX];
  String passwords[KNOWN_WIFI_MAX];

  for (uint8_t i = 0; i < KNOWN_WIFI_MAX; i++) {
    char ssidKey[15];
    char passKey[15];
    knownWiFiKey(ssidKey, sizeof(ssidKey), "wifi_s", i);
    knownWiFiKey(passKey, sizeof(passKey), "wifi_p", i);

    ssids[i] = prefs.getString(ssidKey, "");
    passwords[i] = prefs.getString(passKey, "");
  }

  String nextSsids[KNOWN_WIFI_MAX];
  String nextPasswords[KNOWN_WIFI_MAX];
  nextSsids[0] = cleanSsid;
  nextPasswords[0] = password;

  uint8_t outIndex = 1;
  for (uint8_t i = 0; i < KNOWN_WIFI_MAX && outIndex < KNOWN_WIFI_MAX; i++) {
    if (ssids[i].length() == 0 || ssids[i] == cleanSsid) continue;

    bool alreadyAdded = false;
    for (uint8_t j = 0; j < outIndex; j++) {
      if (nextSsids[j] == ssids[i]) {
        alreadyAdded = true;
        break;
      }
    }

    if (alreadyAdded) continue;

    nextSsids[outIndex] = ssids[i];
    nextPasswords[outIndex] = passwords[i];
    outIndex++;
  }

  for (uint8_t i = 0; i < KNOWN_WIFI_MAX; i++) {
    char ssidKey[15];
    char passKey[15];
    knownWiFiKey(ssidKey, sizeof(ssidKey), "wifi_s", i);
    knownWiFiKey(passKey, sizeof(passKey), "wifi_p", i);

    prefs.putString(ssidKey, nextSsids[i]);
    prefs.putString(passKey, nextPasswords[i]);
  }

  Serial.print("Rede WiFi conhecida guardada: ");
  Serial.println(cleanSsid);
}

void rememberCurrentWiFiCredentials() {
  String ssid;
  String password;

  if (readCurrentWiFiCredentials(ssid, password)) {
    rememberKnownWiFiNetwork(ssid, password);
  }
}

bool connectKnownWiFiNetwork(unsigned long timeoutMs, const char* title, const char* subtitle, bool allowSetupButton) {
  configureWiFiStation();

  String ssids[KNOWN_WIFI_MAX];
  String passwords[KNOWN_WIFI_MAX];
  int candidateIndexes[KNOWN_WIFI_MAX];
  int32_t candidateRssi[KNOWN_WIFI_MAX];
  uint8_t candidateCount = 0;

  for (uint8_t i = 0; i < KNOWN_WIFI_MAX; i++) {
    char ssidKey[15];
    char passKey[15];
    knownWiFiKey(ssidKey, sizeof(ssidKey), "wifi_s", i);
    knownWiFiKey(passKey, sizeof(passKey), "wifi_p", i);

    ssids[i] = prefs.getString(ssidKey, "");
    passwords[i] = prefs.getString(passKey, "");
    ssids[i].trim();
  }

  Serial.println("A procurar redes WiFi conhecidas...");
  int networkCount = WiFi.scanNetworks(false, true);

  for (int n = 0; n < networkCount; n++) {
    String visibleSsid = WiFi.SSID(n);
    for (uint8_t i = 0; i < KNOWN_WIFI_MAX; i++) {
      if (ssids[i].length() == 0 || visibleSsid != ssids[i]) continue;

      int32_t rssi = WiFi.RSSI(n);
      int existingCandidate = -1;
      for (uint8_t c = 0; c < candidateCount; c++) {
        if (candidateIndexes[c] == i) {
          existingCandidate = c;
          break;
        }
      }

      if (existingCandidate >= 0) {
        if (rssi > candidateRssi[existingCandidate]) {
          candidateRssi[existingCandidate] = rssi;
        }
      } else if (candidateCount < KNOWN_WIFI_MAX) {
        candidateIndexes[candidateCount] = i;
        candidateRssi[candidateCount] = rssi;
        candidateCount++;
      }
    }
  }

  WiFi.scanDelete();

  if (candidateCount == 0) {
    Serial.println("Nenhuma rede conhecida visivel.");
    return false;
  }

  for (uint8_t i = 0; i + 1 < candidateCount; i++) {
    for (uint8_t j = i + 1; j < candidateCount; j++) {
      if (candidateRssi[j] > candidateRssi[i]) {
        int tmpIndex = candidateIndexes[i];
        int32_t tmpRssi = candidateRssi[i];
        candidateIndexes[i] = candidateIndexes[j];
        candidateRssi[i] = candidateRssi[j];
        candidateIndexes[j] = tmpIndex;
        candidateRssi[j] = tmpRssi;
      }
    }
  }

  unsigned long start = millis();
  uint8_t loadingFrame = 0;

  for (uint8_t c = 0; c < candidateCount && millis() - start < timeoutMs; c++) {
    int index = candidateIndexes[c];

    Serial.print("A ligar a rede conhecida: ");
    Serial.println(ssids[index]);

    WiFi.disconnect(false, false);
    responsiveDelay(100);
    WiFi.begin(ssids[index].c_str(), passwords[index].c_str());

    unsigned long attemptStart = millis();
    unsigned long elapsedMs = attemptStart - start;
    if (elapsedMs >= timeoutMs) break;

    unsigned long remainingMs = timeoutMs - elapsedMs;
    unsigned long attemptTimeoutMs = min(WIFI_RECONNECT_TIMEOUT_MS, remainingMs);

    while (!isWifiConnected() && millis() - attemptStart < attemptTimeoutMs) {
      if (allowSetupButton && handleStartupWifiResetButton()) {
        startWiFiSetupPortal(true, true);
        return isWifiConnected();
      }

      if (millis() - start >= WIFI_LOADING_SCREEN_DELAY_MS) {
        displayLoadingScreen(title, subtitle, loadingFrame++);
      }

      responsiveDelay(100);
    }

    if (isWifiConnected()) {
      Serial.print("WiFi ligado por lista conhecida: ");
      Serial.print(WiFi.SSID());
      Serial.print(" | IP: ");
      Serial.println(WiFi.localIP());

      rememberKnownWiFiNetwork(WiFi.SSID(), passwords[index]);
      setWiFiSetupPending(false);
      setWiFiProvisioned(true);
      wifiDisconnectedSinceMs = 0;
      return true;
    }

    Serial.println("Rede conhecida visivel falhou. A tentar a proxima.");
  }

  Serial.println("Nenhuma rede conhecida ligou dentro do tempo limite.");
  return false;
}

bool connectSavedWiFi(unsigned long timeoutMs, const char* title, const char* subtitle, bool allowSetupButton) {
  configureWiFiStation();

  if (isWifiConnected()) return true;

  Serial.println("A ligar ao WiFi guardado no ESP32...");
  beginPreferredWiFi();

  unsigned long start = millis();
  unsigned long lastClockLoadingFrameMs = 0;
  uint8_t loadingFrame = 0;

  while (WiFi.status() != WL_CONNECTED && millis() - start < timeoutMs) {
    if (allowSetupButton && handleStartupWifiResetButton()) {
      startWiFiSetupPortal(true, true);
      return isWifiConnected();
    }

    unsigned long now = millis();

    bool showingClockLoading = !clockSynced && normalDisplayPage == 0;

    if (showingClockLoading && now - lastClockLoadingFrameMs >= clockLoadingFrameInterval) {
      lastClockLoadingFrameMs = now;
      displayLoadingScreen(title, subtitle, loadingFrame++);
    }

    if (!showingClockLoading && now - start >= WIFI_LOADING_SCREEN_DELAY_MS) {
      displayLoadingScreen(title, subtitle, loadingFrame++);
    }

    responsiveDelay(100);
  }

  if (isWifiConnected()) {
    Serial.print("WiFi ligado: ");
    Serial.print(WiFi.SSID());
    Serial.print(" | IP: ");
    Serial.println(WiFi.localIP());
    rememberCurrentWiFiCredentials();
    setWiFiSetupPending(false);
    setWiFiProvisioned(true);
    wifiDisconnectedSinceMs = 0;
    return true;
  }

  Serial.println("WiFi guardado nao ligou dentro do tempo limite.");
  return connectKnownWiFiNetwork(timeoutMs, title, subtitle, allowSetupButton);
}

void connectWiFi() {
  configureWiFiStation();

  bool hasStoredSsid = hasStoredWiFiCredentials();
  bool provisioned = isWiFiProvisioned();
  bool hasKnownNetworks = hasKnownWiFiNetworks();

  if (isWiFiSetupPending() && !provisioned) {
    if (hasKnownNetworks) {
      Serial.println("Setup WiFi pendente. A tentar redes conhecidas antes do portal.");
      if (connectKnownWiFiNetwork(WIFI_CONNECT_TIMEOUT_MS, "A ligar WiFi", "Redes conhecidas", true)) {
        syncClock();
        return;
      }
    }

    Serial.println("Setup WiFi pendente. A abrir portal.");
    startWiFiSetupPortal(false, true);
    return;
  }

  if (isWiFiSetupPending() && provisioned) {
    Serial.println("Setup pendente antigo ignorado: dispositivo ja provisionado.");
    setWiFiSetupPending(false);
  }

  if (!hasStoredSsid && !provisioned) {
    if (hasKnownNetworks) {
      Serial.println("Sem credenciais ativas. A tentar redes conhecidas.");
      if (connectKnownWiFiNetwork(WIFI_CONNECT_TIMEOUT_MS, "A ligar WiFi", "Redes conhecidas", true)) {
        syncClock();
        return;
      }
    }

    Serial.println("Sem credenciais WiFi guardadas. A abrir setup.");
    startWiFiSetupPortal(false, true);
    return;
  }

  bool wasConnectedBeforeBootConnect = isWifiConnected();

  if (connectSavedWiFi(WIFI_BOOT_CONNECT_TIMEOUT_MS, "A ligar WiFi", "Credenciais guardadas", true)) {
    Serial.println("WiFi conectado!");
    Serial.print("IP ESP32: ");
    Serial.println(WiFi.localIP());

    if (!wasConnectedBeforeBootConnect) {
      displayNoticeScreen("WiFi ligado", "A sincronizar");
      responsiveDelay(150);
    }

    syncClock();
    return;
  }

  wifiPortalRequested = false;

  if (!provisioned) {
    Serial.println("WiFi guardado falhou no arranque inicial. A abrir setup.");
    startWiFiSetupPortal(false, true);
    return;
  }

  Serial.println("WiFi falhou no arranque, mas dispositivo ja esta provisionado. Fica em reconexao.");
  displayNoticeScreen("Sem WiFi", "A tentar religar");
  responsiveDelay(300);
  return;
}

bool forceWiFiReconnect(unsigned long timeoutMs, const char* reason, bool forceReconnectConnected) {
  static unsigned long connectingSinceMs = 0;
  static unsigned long lastBeginMs = 0;

  if (isWifiConnected() && !forceReconnectConnected) return true;

  Serial.print(forceReconnectConnected ? "WiFi ligado, mas transporte HTTPS falhou. A renovar ligacao: " : "WiFi offline. Tentativa forcada: ");
  Serial.println(reason);

  unsigned long now = millis();
  wl_status_t status = WiFi.status();

  if (!forceReconnectConnected && isWiFiConnectingStatus(status)) {
    if (connectingSinceMs == 0) {
      connectingSinceMs = now;
      configureWiFiStation();
      if (!WiFi.reconnect()) {
        beginPreferredWiFi();
      }
    }

    if (now - connectingSinceMs < WIFI_CONNECTING_GRACE_MS) {
      Serial.print("WiFi ja esta a ligar. Aguarda antes de reconfigurar. Estado: ");
      Serial.println(wifiStatusLabel(status));

      unsigned long waitStart = millis();
      while (!isWifiConnected() && millis() - waitStart < timeoutMs) {
        responsiveDelay(100);
      }

      if (isWifiConnected()) {
        wifiReconnectCount++;
        wifiDisconnectedSinceMs = 0;
        connectingSinceMs = 0;
        Serial.print("WiFi ligado durante tentativa em curso: ");
        Serial.print(WiFi.SSID());
        Serial.print(" | RSSI: ");
        Serial.print(WiFi.RSSI());
        Serial.print(" | IP: ");
        Serial.println(WiFi.localIP());
        setupOta();
        syncClock();
        return true;
      }

      Serial.println("Ligacao ainda em curso. Sem nova reconfiguracao agora.");
      return false;
    }
  } else {
    connectingSinceMs = 0;
  }

  if (lastBeginMs != 0 && now - lastBeginMs < WIFI_RECONNECT_INTERVAL_MS) {
    Serial.println("Tentativa WiFi recente. A evitar begin duplicado.");
    return false;
  }

  connectingSinceMs = now;
  lastBeginMs = now;

  configureWiFiStation();

  if (
    forceReconnectConnected ||
    status == WL_CONNECT_FAILED ||
    status == WL_CONNECTION_LOST ||
    status == WL_NO_SSID_AVAIL ||
    status == WL_IDLE_STATUS ||
    status == WL_DISCONNECTED
  ) {
    WiFi.disconnect(false, false);
    responsiveDelay(180);
    beginPreferredWiFi();
  } else {
    WiFi.reconnect();
  }

  unsigned long start = millis();
  while (!isWifiConnected() && millis() - start < timeoutMs) {
    responsiveDelay(100);
  }

  if (isWifiConnected()) {
    wifiReconnectCount++;
    wifiDisconnectedSinceMs = 0;
    connectingSinceMs = 0;
    lastBeginMs = 0;
    Serial.print("WiFi ligado em tentativa forcada: ");
    Serial.print(WiFi.SSID());
    Serial.print(" | RSSI: ");
    Serial.print(WiFi.RSSI());
    Serial.print(" | IP: ");
    Serial.println(WiFi.localIP());
    setupOta();
    syncClock();
    return true;
  }

  Serial.print("Tentativa forcada falhou. Estado: ");
  Serial.println(wifiStatusLabel(WiFi.status()));
  return false;
}

void ensureWiFiConnected() {
  static unsigned long lastReconnectAttempt = 0;
  static unsigned long lastQualityCheckMs = 0;
  static unsigned long disconnectedAtMs = 0;
  static unsigned long lastEscalatedReconnectMs = 0;
  static unsigned long lastKnownNetworkScanMs = 0;
  static bool fastReconnectTriggered = false;

  unsigned long now = millis();
  bool recoveryAttemptedThisCycle = false;

  if (userInteractionInProgress()) return;

  if (isWifiConnected()) {
    disconnectedAtMs = 0;
    lastEscalatedReconnectMs = 0;
    lastKnownNetworkScanMs = 0;
    fastReconnectTriggered = false;
    if (
      now - lastQualityCheckMs >= WIFI_QUALITY_CHECK_INTERVAL_MS &&
      WiFi.RSSI() <= WIFI_WEAK_RSSI_DBM
    ) {
      lastQualityCheckMs = now;
      Serial.print("Sinal WiFi fraco: ");
      Serial.println(WiFi.RSSI());
    }
    return;
  }

  if (disconnectedAtMs == 0) {
    disconnectedAtMs = now;
    lastEscalatedReconnectMs = 0;
    lastKnownNetworkScanMs = 0;
    fastReconnectTriggered = false;
    Serial.print("WiFi perdeu ligacao. Estado: ");
    Serial.println(wifiStatusLabel(WiFi.status()));
  }

  unsigned long reconnectCountBefore = wifiReconnectCount;

  // Para uma quebra curta, pede primeiro ao driver que retome a mesma rede.
  // Não há scan nem troca de credenciais nesta fase, reduzindo a recuperação.
  if (
    !fastReconnectTriggered &&
    now - disconnectedAtMs >= WIFI_FAST_RECONNECT_DELAY_MS
  ) {
    fastReconnectTriggered = true;
    configureWiFiStation();
    Serial.println("Quebra WiFi breve. A retomar imediatamente a rede atual.");
    if (!WiFi.reconnect()) {
      beginPreferredWiFi();
    }
  }

  // Ao mudar o dispositivo de ambiente, procura cedo todas as redes já
  // configuradas. A rede visível com melhor sinal é tentada primeiro.
  if (
    now - disconnectedAtMs >= WIFI_ENVIRONMENT_SWITCH_DELAY_MS &&
    hasKnownWiFiNetworks() &&
    (lastKnownNetworkScanMs == 0 || now - lastKnownNetworkScanMs >= WIFI_KNOWN_NETWORK_SCAN_INTERVAL_MS)
  ) {
    recoveryAttemptedThisCycle = true;
    lastKnownNetworkScanMs = now;
    Serial.println("Mudanca de ambiente detetada. A procurar redes WiFi conhecidas.");
    bool switchedNetwork = connectKnownWiFiNetwork(
      WIFI_KNOWN_NETWORK_SWITCH_TIMEOUT_MS,
      "A ligar WiFi",
      "Redes conhecidas",
      false
    );
    lastReconnectAttempt = millis();

    if (!switchedNetwork) {
      Serial.println("Nenhuma rede conhecida ligou nesta procura. A reforcar a rede preferida.");
      forceWiFiReconnect(WIFI_RECONNECT_QUICK_TIMEOUT_MS, "fallback apos procura de redes");
      now = millis();
    } else {
      disconnectedAtMs = 0;
      lastEscalatedReconnectMs = 0;
      wifiReconnectCount++;
      Serial.print("WiFi alterado automaticamente para: ");
      Serial.print(WiFi.SSID());
      Serial.print(" | RSSI: ");
      Serial.print(WiFi.RSSI());
      Serial.print(" | IP: ");
      Serial.println(WiFi.localIP());
      setupOta();
      syncClock();
      bufferFlushPausedUntilMs = 0;
      lastBufferFlushMs = 0;
      return;
    }
  }

  if (!recoveryAttemptedThisCycle) {
    // Dá tempo à recuperação leve antes de interromper e relançar o perfil.
    if (now - disconnectedAtMs < WIFI_FORCE_RECONNECT_DELAY_MS) return;
    if (now - lastReconnectAttempt < WIFI_RECONNECT_INTERVAL_MS) return;

    lastReconnectAttempt = now;
    forceWiFiReconnect(WIFI_RECONNECT_QUICK_TIMEOUT_MS, "ciclo automatico");
    now = millis();
  }

  if (
    !isWifiConnected() &&
    now - disconnectedAtMs >= WIFI_RECONNECT_ESCALATE_MS &&
    (lastEscalatedReconnectMs == 0 || now - lastEscalatedReconnectMs >= WIFI_RECONNECT_ESCALATE_MS)
  ) {
    lastEscalatedReconnectMs = now;
    Serial.println("WiFi ainda em baixo. A reiniciar radio e relancar ligacao sem apagar credenciais.");
    WiFi.disconnect(false, false);
    responsiveDelay(250);
    WiFi.mode(WIFI_OFF);
    responsiveDelay(600);
    configureWiFiStation();
    WiFi.disconnect(false, false);
    responsiveDelay(250);
    beginPreferredWiFi();

    unsigned long savedStart = millis();
    while (!isWifiConnected() && millis() - savedStart < WIFI_RECONNECT_ESCALATED_TIMEOUT_MS) {
      responsiveDelay(100);
    }

    if (!isWifiConnected() && hasKnownWiFiNetworks()) {
      Serial.println("Perfil guardado falhou. A tentar lista de redes conhecidas.");
      connectKnownWiFiNetwork(WIFI_RECONNECT_TIMEOUT_MS, "A ligar WiFi", "Redes conhecidas", false);
    }
  }

  if (isWifiConnected()) {
    disconnectedAtMs = 0;
    lastEscalatedReconnectMs = 0;
    if (wifiReconnectCount == reconnectCountBefore) {
      wifiReconnectCount++;
    }
    Serial.print("WiFi religado: ");
    Serial.print(WiFi.SSID());
    Serial.print(" | RSSI: ");
    Serial.print(WiFi.RSSI());
    Serial.print(" | IP: ");
    Serial.println(WiFi.localIP());
    setupOta();
    syncClock();
    bufferFlushPausedUntilMs = 0;
    lastBufferFlushMs = 0;
  } else {
    Serial.print("Ainda sem WiFi. Estado: ");
    Serial.print(wifiStatusLabel(WiFi.status()));
    Serial.print(" | offline ha ");
    Serial.print((millis() - disconnectedAtMs) / 1000UL);
    Serial.println("s");
  }
}

// =====================================================
// OLED
// =====================================================
void drawCleanTechSpinner(int16_t cx, int16_t cy, uint8_t frame, uint16_t accentColor, uint16_t bgColor) {
  const int8_t x[16] = {0, 5, 9, 12, 13, 12, 9, 5, 0, -5, -9, -12, -13, -12, -9, -5};
  const int8_t y[16] = {-13, -12, -9, -5, 0, 5, 9, 12, 13, 12, 9, 5, 0, -5, -9, -12};
  uint8_t head = frame % 16;

  display.fillCircle(cx, cy, 23, bgColor);
  display.drawCircle(cx, cy, 19, TFT_MUTED);
  display.drawCircle(cx, cy, 12, accentColor);
  display.fillCircle(cx, cy, 7, bgColor);

  for (uint8_t i = 0; i < 16; i++) {
    bool isHead = i == head;
    bool isTrailA = i == (head + 15) % 16;
    bool isTrailB = i == (head + 14) % 16;

    if (isHead) {
      display.fillCircle(cx + x[i], cy + y[i], 3, accentColor);
    } else if (isTrailA) {
      display.fillCircle(cx + x[i], cy + y[i], 2, TFT_TEXT);
    } else if (isTrailB) {
      display.fillCircle(cx + x[i], cy + y[i], 1, TFT_MUTED);
    } else if (i % 4 == 0) {
      display.drawPixel(cx + x[i], cy + y[i], TFT_MUTED);
    }
  }

  display.drawFastHLine(cx - 28, cy, 7, accentColor);
  display.drawFastHLine(cx + 22, cy, 7, accentColor);
}

void displayLoadingScreen(const char* title, const char* subtitle, uint8_t frame) {
  if (!displayReady) return;
  if (oledStandbyBlank) return;
  if (!oledOn) oledDisplayOn();
  oledStandbyBlank = false;
  (void)title;
  (void)subtitle;

  uint16_t bgColor = uiBackgroundColor();
  uint16_t accentColor = uiStateColor();
  String titleText = "STS";
  String syncText = isWifiConnected() ? "A sincronizar" : "A ligar";

  static uint16_t lastBgColor = 0;
  static uint16_t lastAccentColor = 0;
  static String lastTitle = "";
  static String lastSyncText = "";

  bool fullRedraw =
    activeUiScreen != 2 ||
    bgColor != lastBgColor ||
    accentColor != lastAccentColor ||
    titleText != lastTitle ||
    syncText != lastSyncText;

  if (fullRedraw) {
    display.clearDisplay();
    display.fillScreen(bgColor);
    activeUiScreen = 2;

    int16_t textX;
    int16_t textY;
    uint16_t textW;
    uint16_t textH;

    display.setFont(&FreeSansBold24pt7b);
    display.setTextColor(TFT_TEXT, bgColor);
    display.getTextBounds(titleText, 0, 72, &textX, &textY, &textW, &textH);
    display.setCursor((SCREEN_WIDTH - textW) / 2 - 4, 72);
    display.print(titleText);

    display.setFont(&FreeSans9pt7b);
    display.setTextColor(TFT_MUTED, bgColor);
    display.setCursor(34, 102);
    display.print("Smart Cold");

    display.drawFastHLine(34, 124, 212, accentColor);

    display.setFont(&FreeSansBold12pt7b);
    display.setTextColor(TFT_TEXT, bgColor);
    display.getTextBounds(syncText, 0, 220, &textX, &textY, &textW, &textH);
    display.setCursor((SCREEN_WIDTH - textW) / 2 - 4, 220);
    display.print(syncText);

    lastBgColor = bgColor;
    lastAccentColor = accentColor;
    lastTitle = titleText;
    lastSyncText = syncText;
  }

  drawCleanTechSpinner(136, 166, frame, accentColor, bgColor);

  display.setFont(NULL);
  display.display();
}

void displayNoticeScreen(const char* title, const char* subtitle) {
  if (!displayReady) return;
  if (oledStandbyBlank) return;
  if (!oledOn) oledDisplayOn();
  oledStandbyBlank = false;

  uint16_t bgColor = uiBackgroundColor();
  uint16_t accentColor = uiStateColor();
  String titleText = title != nullptr ? String(title) : String("");
  String subtitleText = subtitle != nullptr ? String(subtitle) : String("");

  static uint16_t lastBgColor = 0;
  static uint16_t lastAccentColor = 0;
  static String lastTitle = "";
  static String lastSubtitle = "";

  bool fullRedraw =
    activeUiScreen != 3 ||
    bgColor != lastBgColor ||
    accentColor != lastAccentColor ||
    titleText != lastTitle;

  int16_t textX;
  int16_t textY;
  uint16_t textW;
  uint16_t textH;

  if (fullRedraw) {
    // Um único preenchimento direto na cor final evita o flash preto entre
    // atualizações do estado de alerta.
    display.fillScreen(bgColor);
    activeUiScreen = 3;

    display.setFont(&FreeSansBold12pt7b);
    display.setTextColor(TFT_TEXT, bgColor);
    display.getTextBounds("STS", 0, 42, &textX, &textY, &textW, &textH);
    display.setCursor((SCREEN_WIDTH - textW) / 2 - 4, 42);
    display.print("STS");

    display.drawFastHLine(34, 92, 212, accentColor);

    display.setFont(&FreeSansBold12pt7b);
    display.setCursor(34, 130);
    display.print(titleText);

    lastBgColor = bgColor;
    lastAccentColor = accentColor;
    lastTitle = titleText;
    lastSubtitle = "";
  }

  if (fullRedraw || subtitleText != lastSubtitle) {
    display.fillRect(30, 138, 220, 38, bgColor);
    display.setFont(&FreeSans9pt7b);
    display.setTextColor(TFT_MUTED, bgColor);
    display.setCursor(34, 162);
    display.print(subtitleText);
    lastSubtitle = subtitleText;
  }

  display.setFont(NULL);
  display.display();
}

void drawQrCode(const char* text, uint8_t qrVersion, int16_t x, int16_t y, uint8_t scale) {
  if (!displayReady) return;
  qrDrawContext = {x, y, scale};
  activeQrCache = nullptr;

  esp_qrcode_config_t config = ESP_QRCODE_CONFIG_DEFAULT();
  config.display_func = drawQrCodeCallback;
  config.max_qrcode_version = qrVersion;
  config.qrcode_ecc_level = ESP_QRCODE_ECC_LOW;

  esp_qrcode_generate(&config, text);
}

void ensureCachedQrCode(const char* text, uint8_t qrVersion, CachedQrCode &cache) {
  if (!cache.ready) {
    memset(cache.rows, 0, sizeof(cache.rows));
    cache.size = 0;
    activeQrCache = &cache;

    esp_qrcode_config_t config = ESP_QRCODE_CONFIG_DEFAULT();
    config.display_func = drawQrCodeCallback;
    config.max_qrcode_version = qrVersion;
    config.qrcode_ecc_level = ESP_QRCODE_ECC_LOW;

    esp_qrcode_generate(&config, text);
    activeQrCache = nullptr;
    cache.ready = cache.size > 0;
  }
}

void drawCachedQrCode(const char* text, uint8_t qrVersion, int16_t x, int16_t y, uint8_t scale, CachedQrCode &cache) {
  if (!displayReady) return;

  ensureCachedQrCode(text, qrVersion, cache);

  if (!cache.ready) {
    drawQrCode(text, qrVersion, x, y, scale);
    return;
  }

  int quietZonePx = QR_QUIET_ZONE_MODULES * scale;
  int qrBoxPx = (cache.size + QR_QUIET_ZONE_MODULES * 2) * scale;

  display.fillRect(x, y, qrBoxPx, qrBoxPx, WHITE);

  for (uint8_t qrY = 0; qrY < cache.size; qrY++) {
    uint32_t row = cache.rows[qrY];
    for (uint8_t qrX = 0; qrX < cache.size; qrX++) {
      if (row & (1UL << qrX)) {
        display.fillRect(
          x + quietZonePx + qrX * scale,
          y + quietZonePx + qrY * scale,
          scale,
          scale,
          BLACK
        );
      }
    }
  }
}

void drawQrCodeCallback(esp_qrcode_handle_t qrcode) {
  if (!displayReady) return;
  int size = esp_qrcode_get_size(qrcode);

  if (activeQrCache != nullptr) {
    activeQrCache->size = min(size, 29);
    for (int qrY = 0; qrY < activeQrCache->size; qrY++) {
      uint32_t row = 0;
      for (int qrX = 0; qrX < activeQrCache->size; qrX++) {
        if (esp_qrcode_get_module(qrcode, qrX, qrY)) {
          row |= (1UL << qrX);
        }
      }
      activeQrCache->rows[qrY] = row;
    }
    return;
  }

  int quietZonePx = QR_QUIET_ZONE_MODULES * qrDrawContext.scale;
  int qrBoxPx = (size + QR_QUIET_ZONE_MODULES * 2) * qrDrawContext.scale;

  display.fillRect(
    qrDrawContext.x,
    qrDrawContext.y,
    qrBoxPx,
    qrBoxPx,
    WHITE
  );

  for (int qrY = 0; qrY < size; qrY++) {
    for (int qrX = 0; qrX < size; qrX++) {
      if (esp_qrcode_get_module(qrcode, qrX, qrY)) {
        display.fillRect(
          qrDrawContext.x + quietZonePx + qrX * qrDrawContext.scale,
          qrDrawContext.y + quietZonePx + qrY * qrDrawContext.scale,
          qrDrawContext.scale,
          qrDrawContext.scale,
          BLACK
        );
      }
    }
  }
}

void displaySetupQrScreen() {
  if (!displayReady) return;
  if (!oledOn) oledDisplayOn();
  oledStandbyBlank = false;

  display.clearDisplay();
  activeUiScreen = 4;
  display.fillScreen(uiBackgroundColor());
  display.setTextColor(TFT_TEXT);

  if (setupDisplayPage == 0) {
    display.setTextSize(2);
    display.setCursor(34, 28);
    display.print("SETUP WIFI");

    display.drawFastHLine(34, 62, 212, TFT_BLUE);

    display.setTextSize(1);
    display.setTextColor(TFT_MUTED);
    display.setCursor(34, 92);
    display.print("Rede");
    display.setTextSize(2);
    display.setTextColor(TFT_TEXT);
    display.setCursor(34, 110);
    display.print(WIFI_AP_NAME);

    display.setTextSize(1);
    display.setTextColor(TFT_MUTED);
    display.setCursor(34, 158);
    display.print("Pass");
    display.setTextSize(2);
    display.setTextColor(TFT_TEXT);
    display.setCursor(34, 176);
    display.print(WIFI_AP_PASSWORD);

    display.setTextSize(1);
    display.setTextColor(TFT_MUTED);
    display.setCursor(34, 228);
    display.print("Abrir 192.168.4.1");

  } else {
    display.setTextSize(1);
    display.setCursor(34, 20);
    display.print("IP:");
    display.setCursor(58, 20);
    display.print("192.168.4.1");

    const uint8_t wifiSetupQrScale = 4;
    ensureCachedQrCode(WIFI_SETUP_QR_TEXT, 2, setupQrCache);
    const int16_t wifiSetupQrBoxPx =
      (setupQrCache.size + QR_QUIET_ZONE_MODULES * 2) * wifiSetupQrScale;
    const int16_t wifiSetupQrX = (SCREEN_WIDTH - wifiSetupQrBoxPx) / 2;
    drawCachedQrCode(
      WIFI_SETUP_QR_TEXT,
      2,
      wifiSetupQrX,
      70,
      wifiSetupQrScale,
      setupQrCache
    );

  }

  display.display();
}

void displayDashboardQrScreen() {
  if (!displayReady) return;
  if (!oledOn || oledStandbyBlank) return;
  oledStandbyBlank = false;

  uint16_t bgColor = uiBackgroundColor();
  uint16_t accentColor = uiStateColor();
  String footerText = isWifiConnected() ? "App online" : "Sem rede";

  static uint16_t lastBgColor = 0;
  static uint16_t lastAccentColor = 0;
  static String lastFooterText = "";

  bool fullRedraw =
    activeUiScreen != 5 ||
    bgColor != lastBgColor ||
    accentColor != lastAccentColor ||
    footerText != lastFooterText;

  if (!fullRedraw) return;

  display.clearDisplay();
  activeUiScreen = 5;
  display.fillScreen(bgColor);

  display.setFont(&FreeSansBold12pt7b);
  display.setTextColor(TFT_TEXT, bgColor);
  display.setCursor(34, 42);
  display.print("Dashboard");

  display.drawFastHLine(34, 62, 212, accentColor);

  drawCachedQrCode(dashboardQrText, 1, 82, 82, 5, dashboardQrCache);

  display.setFont(&FreeSans9pt7b);
  display.setTextColor(TFT_MUTED, bgColor);
  display.setCursor(34, 222);
  display.print(footerText);

  lastBgColor = bgColor;
  lastAccentColor = accentColor;
  lastFooterText = footerText;
  display.setFont(NULL);
  display.display();
}

String formatCurrentTime() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo, 10)) {
    return "";
  }

  char timeText[6];
  strftime(timeText, sizeof(timeText), "%H:%M", &timeinfo);
  return String(timeText);
}

String formatCurrentDate() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo, 10)) {
    return "";
  }

  char dateText[12];
  strftime(dateText, sizeof(dateText), "%d/%m/%Y", &timeinfo);
  return String(dateText);
}

uint16_t uiStateColor() {
  if (!primarySensorHealthy || (alarmActive && !alarmAcked)) return TFT_DANGER;
  if (alarmActive && alarmAcked) return TFT_BLUE;
  if (state == SysState::ALERT) return TFT_WARN;
  if (state == SysState::SETUP_WIFI) return TFT_BLUE;
  if (isDeviceCommunicationOffline()) return TFT_MUTED;
  return TFT_OK;
}

uint16_t uiBackgroundColor() {
  if (!primarySensorHealthy || (alarmActive && !alarmAcked)) return TFT_BG_DANGER;
  if (alarmActive && alarmAcked) return TFT_BG_BLUE;
  if (state == SysState::ALERT) return TFT_BG_WARN;
  if (state == SysState::SETUP_WIFI) return TFT_BG_BLUE;
  if (isDeviceCommunicationOffline()) return TFT_BG_OFFLINE;
  return TFT_BG_NORMAL;
}

String formatAlarmStartText() {
  unsigned long elapsedS = 0;
  time_t nowEpoch = time(nullptr);
  if (alarmStartedEpoch > CLOCK_VALID_AFTER_EPOCH && nowEpoch >= alarmStartedEpoch) {
    elapsedS = (unsigned long)(nowEpoch - alarmStartedEpoch);
  } else if (alarmStartedMs != 0) {
    elapsedS = (millis() - alarmStartedMs) / 1000UL;
  } else {
    return "-";
  }
  if (elapsedS < 60) return String("ha ") + String(elapsedS) + "s";

  unsigned long elapsedMin = elapsedS / 60UL;
  if (elapsedMin < 60) return String("ha ") + String(elapsedMin) + "m";

  return String("ha ") + String(elapsedMin / 60UL) + "h";
}

void displayMainClockScreen() {
  if (!displayReady) return;
  if (!oledOn || oledStandbyBlank) return;
  oledStandbyBlank = false;

  uint16_t bgColor = uiBackgroundColor();
  uint16_t accentColor = uiStateColor();
  String currentTime = formatCurrentTime();
  String clockText = currentTime.length() > 0 ? currentTime : "--:--";
  String currentDate = formatCurrentDate();
  String safeDate = currentDate.length() > 0 ? currentDate : "--/--/----";
  String syncText = isDeviceCommunicationOffline()
    ? "Offline"
    : clockSynced
    ? "Online e sincronizado"
    : "Online";

  static uint16_t lastBgColor = 0;
  static uint16_t lastAccentColor = 0;
  static String lastTime = "";
  static String lastDate = "";
  static String lastSyncText = "";

  bool fullRedraw =
    activeUiScreen != 6 ||
    bgColor != lastBgColor ||
    accentColor != lastAccentColor;

  if (fullRedraw) {
    display.clearDisplay();
    display.fillScreen(bgColor);
    activeUiScreen = 6;

    int16_t textX;
    int16_t textY;
    uint16_t textW;
    uint16_t textH;

    display.setFont(&FreeSansBold24pt7b);
    display.setTextColor(TFT_TEXT, bgColor);
    display.getTextBounds("STS", 0, 74, &textX, &textY, &textW, &textH);
    display.setCursor((SCREEN_WIDTH - textW) / 2 - 4, 74);
    display.print("STS");

    display.setFont(&FreeSans9pt7b);
    display.setTextColor(TFT_MUTED, bgColor);
    display.getTextBounds("Cold", 0, 100, &textX, &textY, &textW, &textH);
    display.setCursor((SCREEN_WIDTH - textW) / 2 - 4, 100);
    display.print("Cold");

    display.drawFastHLine(34, 112, 212, accentColor);

    lastTime = "";
    lastDate = "";
    lastSyncText = "";
    lastBgColor = bgColor;
    lastAccentColor = accentColor;
  }

  if (fullRedraw || clockText != lastTime) {
    int16_t textX;
    int16_t textY;
    uint16_t textW;
    uint16_t textH;
    display.setFont(&FreeSansBold24pt7b);
    display.getTextBounds(clockText, 0, 158, &textX, &textY, &textW, &textH);
    int16_t clockX = (SCREEN_WIDTH - textW) / 2 - 4;

    display.fillRect(42, 116, 196, 56, bgColor);
    display.setFont(&FreeSansBold24pt7b);
    display.setTextColor(TFT_TEXT, bgColor);
    display.setCursor(clockX, 158);
    display.print(clockText);
    lastTime = clockText;
  }

  if (fullRedraw || safeDate != lastDate) {
    int16_t textX;
    int16_t textY;
    uint16_t textW;
    uint16_t textH;
    display.setFont(&FreeSans9pt7b);
    display.getTextBounds(safeDate, 0, 28, &textX, &textY, &textW, &textH);
    display.fillRect(SCREEN_WIDTH - 34 - textW - 2, 12, textW + 4, 24, bgColor);
    display.setTextColor(TFT_MUTED, bgColor);
    display.setCursor(SCREEN_WIDTH - 34 - textW, 28);
    display.print(safeDate);
    lastDate = safeDate;
  }

  if (fullRedraw || syncText != lastSyncText) {
    display.fillRect(34, 202, 212, 28, bgColor);
    display.setFont(&FreeSans9pt7b);
    display.setTextColor(TFT_MUTED, bgColor);
    display.setCursor(34, 220);
    display.print(syncText);
    lastSyncText = syncText;
  }

  display.setFont(NULL);
  display.display();
}

void displayNormalPage(float temp, float humidity) {
  if (!displayReady) return;
  if (!oledOn || oledStandbyBlank) return;

  if (state == SysState::SENSOR_FAIL || state == SysState::SETUP_WIFI) {
    displayTemp(temp, humidity);
    return;
  }

  if (state == SysState::NO_WIFI) {
    switch (normalDisplayPage % 3) {
      case 0:
        if (isWifiConnected()) {
          displayNoticeScreen("API indisponivel", "Wi-Fi ligado / a tentar");
        } else {
          displayNoticeScreen("Sem Wi-Fi", "A tentar reconectar");
        }
        break;
      case 1:
        displayTemp(temp, humidity);
        break;
      case 2:
        displayDashboardQrScreen();
        break;
    }
    return;
  }

  if (alarmActive) {
    switch (normalDisplayPage % 4) {
      case 0:
        displayAlarmPage(temp, humidity);
        break;
      case 1:
        displayMainClockScreen();
        break;
      case 2:
        displayTemp(temp, humidity);
        break;
      case 3:
        displayDashboardQrScreen();
        break;
    }
    return;
  }

  if (state == SysState::ALERT) {
    switch (normalDisplayPage % 4) {
      case 0:
        displayAlertPage(temp, humidity);
        break;
      case 1:
        displayMainClockScreen();
        break;
      case 2:
        displayTemp(temp, humidity);
        break;
      case 3:
        displayDashboardQrScreen();
        break;
    }
    return;
  }

  switch (normalDisplayPage) {
    case 0:
      displayMainClockScreen();
      break;
    case 1:
      displayTemp(temp, humidity);
      break;
    case 2:
      displayDashboardQrScreen();
      break;
    default:
      normalDisplayPage = 0;
      displayMainClockScreen();
      break;
  }
}

void advanceSetupDisplayPage() {
  if (!displayReady) return;
  if (state != SysState::SETUP_WIFI) return;

  unsigned long now = millis();
  if (now - lastPageAdvanceMs < PAGE_ADVANCE_COOLDOWN_MS) return;
  lastPageAdvanceMs = now;

  lastUserActivityMs = now;
  lastInteractiveInputMs = lastUserActivityMs;
  setupDisplayPage = (setupDisplayPage + 1) % 2;
  lastDisplay = lastUserActivityMs;
  displaySetupQrScreen();
}

void refreshCurrentDisplay() {
  if (!displayReady) return;
  if (!oledOn) return;

  lastDisplay = millis();

  if (state == SysState::SETUP_WIFI) {
    displaySetupQrScreen();
    return;
  }

  if (state == SysState::SENSOR_FAIL) {
    displayTemp(NAN, NAN);
    return;
  }

  if (!isnan(lastTemperature) && !isnan(lastHumidity)) {
    displayNormalPage(lastTemperature, lastHumidity);
    return;
  }

  if (state == SysState::NO_WIFI) {
    displayMainClockScreen();
    return;
  }

  displayMainClockScreen();
}

void advanceNormalDisplayPage() {
  if (!displayReady) return;
  if (!(state == SysState::NORMAL || state == SysState::ALERT || state == SysState::ALARM || state == SysState::ALARM_ACK || state == SysState::NO_WIFI)) return;

  unsigned long now = millis();
  if (now - lastPageAdvanceMs < PAGE_ADVANCE_COOLDOWN_MS) return;
  lastPageAdvanceMs = now;

  lastUserActivityMs = now;
  lastInteractiveInputMs = lastUserActivityMs;

  if (state == SysState::NO_WIFI) {
    normalDisplayPage = (normalDisplayPage + 1) % 3;
  } else if (alarmActive || state == SysState::ALERT) {
    normalDisplayPage = (normalDisplayPage + 1) % 4;
  } else {
    normalDisplayPage = (normalDisplayPage + 1) % 3;
  }
  lastDisplay = lastUserActivityMs;

  if (!isnan(lastTemperature) && !isnan(lastHumidity)) {
    displayNormalPage(lastTemperature, lastHumidity);
  } else if (state == SysState::NO_WIFI) {
    displayMainClockScreen();
  } else {
    displayMainClockScreen();
  }
}

void displayAlertPage(float temp, float humidity) {
  String detail = "A aproximar do limite";

  if (activeAlertMask & 0x01) {
    detail = String("Temp ") + String(temp, 1) + " / max " + String(tempHighC, 1);
  } else if (activeAlertMask & 0x02) {
    detail = String("Temp ") + String(temp, 1) + " / min " + String(tempLowC, 1);
  } else if (activeAlertMask & 0x04) {
    detail = String("Hum ") + String(humidity, 0) + "% / max " + String(humHigh, 0) + "%";
  } else if (activeAlertMask & 0x08) {
    detail = String("Hum ") + String(humidity, 0) + "% / min " + String(humLow, 0) + "%";
  }

  displayNoticeScreen("ALERTA", detail.c_str());
}

void displayAlarmPage(float temp, float humidity) {
  if (!displayReady) return;
  if (!oledOn || oledStandbyBlank) return;
  oledStandbyBlank = false;

  uint16_t bgColor = alarmAcked ? TFT_BG_BLUE : TFT_BG_DANGER;
  uint16_t alarmColor = alarmAcked ? TFT_BLUE : TFT_DANGER;

  uint8_t mask = activeAlarmMask;
  if (mask == 0) mask = computeAlarmMask(temp, humidity);

  String reasonText = "Fora limite";
  String valueText = "--";
  String limitText = "Limite definido";
  if (mask & 0x01) {
    reasonText = "Temp alta";
    valueText = String(temp, 1) + " C";
    limitText = String("Limite max ") + String(tempHighC, 1) + " C";
  } else if (mask & 0x02) {
    reasonText = "Temp baixa";
    valueText = String(temp, 1) + " C";
    limitText = String("Limite min ") + String(tempLowC, 1) + " C";
  } else if (mask & 0x04) {
    reasonText = "Hum alta";
    valueText = String(humidity, 0) + " %RH";
    limitText = String("Limite max ") + String(humHigh, 0) + " %RH";
  } else if (mask & 0x08) {
    reasonText = "Hum baixa";
    valueText = String(humidity, 0) + " %RH";
    limitText = String("Limite min ") + String(humLow, 0) + " %RH";
  }

  String elapsedText = formatAlarmStartText();
  String ackText = alarmAcked ? "Confirmado" : "Premir 2s ACK";

  static uint16_t lastBgColor = 0;
  static uint16_t lastAlarmColor = 0;
  static String lastReasonText = "";
  static String lastLimitText = "";
  static String lastElapsedText = "";
  static String lastValueText = "";
  static String lastAckText = "";

  bool fullRedraw =
    activeUiScreen != 7 ||
    bgColor != lastBgColor ||
    alarmColor != lastAlarmColor ||
    reasonText != lastReasonText ||
    limitText != lastLimitText ||
    ackText != lastAckText;

  if (fullRedraw) {
    display.clearDisplay();
    display.fillScreen(bgColor);
    activeUiScreen = 7;

    display.setFont(&FreeSansBold12pt7b);
    display.setTextColor(TFT_TEXT, bgColor);
    display.setCursor(34, 40);
    display.print(alarmAcked ? "ACK" : "ALARME");

    display.drawFastHLine(34, 60, 212, alarmColor);

    display.setFont(&FreeSans9pt7b);
    display.setTextColor(TFT_MUTED, bgColor);
    display.setCursor(34, 96);
    display.print(reasonText);

    display.setFont(&FreeSans9pt7b);
    display.setTextColor(TFT_MUTED, bgColor);
    display.setCursor(34, 206);
    display.print(limitText);

    display.setCursor(34, 228);
    display.print(ackText);

    lastBgColor = bgColor;
    lastAlarmColor = alarmColor;
    lastReasonText = reasonText;
    lastLimitText = limitText;
    lastAckText = ackText;
    lastElapsedText = "";
    lastValueText = "";
  }

  if (fullRedraw || elapsedText != lastElapsedText) {
    display.fillRect(34, 102, 190, 32, bgColor);
    display.setFont(&FreeSansBold12pt7b);
    display.setTextColor(TFT_MUTED, bgColor);
    display.setCursor(34, 128);
    display.print(elapsedText);
    lastElapsedText = elapsedText;
  }

  if (fullRedraw || valueText != lastValueText) {
    int16_t textX;
    int16_t textY;
    uint16_t textW;
    uint16_t textH;
    display.setFont(&FreeSansBold12pt7b);
    display.getTextBounds(valueText, 0, 170, &textX, &textY, &textW, &textH);
    int16_t valueX = (SCREEN_WIDTH - textW) / 2 - 4;

    display.fillRect(30, 142, 220, 42, bgColor);
    display.setTextColor(TFT_TEXT, bgColor);
    display.setCursor(valueX, 174);
    display.print(valueText);
    lastValueText = valueText;
  }

  display.setFont(NULL);
  display.display();
}

void displayTemp(float temp, float humidity) {
  if (!displayReady) return;
  if (!oledOn || oledStandbyBlank) return;
  oledStandbyBlank = false;

  bool wifiOfflineStable = isDeviceCommunicationOffline();
  uint16_t bgColor = uiBackgroundColor();
  uint16_t statusColor = TFT_OK;
  const char* statusText = "OK";
  if (!primarySensorHealthy) {
    statusColor = TFT_DANGER;
    statusText = "SENSOR";
  } else if (state == SysState::SETUP_WIFI) {
    statusColor = TFT_BLUE;
    statusText = "SETUP";
  } else if (alarmActive) {
    statusColor = TFT_DANGER;
    statusText = alarmAcked ? "ACK" : "ALARM";
  } else if (state == SysState::ALERT) {
    statusColor = TFT_WARN;
    statusText = "ALERTA";
  } else if (wifiOfflineStable) {
    statusColor = TFT_MUTED;
    statusText = "OFFLINE";
  }

  String currentDate = formatCurrentDate();
  String safeDate = currentDate.length() > 0 ? currentDate : "--/--/----";
  static uint16_t lastBgColor = 0;
  static uint16_t lastStatusColor = 0;
  static String lastStatusText = "";
  static String lastDate = "";
  bool fullRedraw =
    activeUiScreen != 1 ||
    bgColor != lastBgColor ||
    statusColor != lastStatusColor ||
    String(statusText) != lastStatusText ||
    safeDate != lastDate;

  if (fullRedraw) {
    display.clearDisplay();
    display.fillScreen(bgColor);
    activeUiScreen = 1;

    int16_t textX;
    int16_t textY;
    uint16_t textW;
    uint16_t textH;

    display.setFont(&FreeSans9pt7b);
    display.setTextColor(TFT_TEXT, bgColor);
    display.getTextBounds(statusText, 0, 28, &textX, &textY, &textW, &textH);
    display.setCursor(34, 28);
    display.print(statusText);

    display.setTextColor(TFT_MUTED, bgColor);
    display.getTextBounds(safeDate, 0, 28, &textX, &textY, &textW, &textH);
    display.setCursor(SCREEN_WIDTH - 34 - textW, 28);
    display.print(safeDate);

    display.fillCircle(34, 44, 3, statusColor);
    display.drawFastHLine(46, 44, 200, statusColor);

    display.setTextColor(TFT_MUTED, bgColor);
    const char* tempLabel = "TEMPERATURA";
    display.getTextBounds(tempLabel, 0, 76, &textX, &textY, &textW, &textH);
    display.setCursor(34, 76);
    display.print(tempLabel);

    const char* humLabel = "HUMIDADE";
    display.getTextBounds(humLabel, 0, 180, &textX, &textY, &textW, &textH);
    display.setCursor(34, 180);
    display.print(humLabel);

    lastBgColor = bgColor;
    lastStatusColor = statusColor;
    lastStatusText = statusText;
    lastDate = safeDate;
  }

  char tempText[12];
  if (isnan(temp)) {
    snprintf(tempText, sizeof(tempText), "--");
  } else {
    dtostrf(temp, 0, 1, tempText);
  }
  String tempValue = String(tempText);
  tempValue.trim();
  int16_t textX;
  int16_t textY;
  uint16_t tempW;
  uint16_t tempH;
  uint16_t unitW;
  uint16_t unitH;
  display.setFont(&FreeSansBold24pt7b);
  display.getTextBounds(tempValue, 0, 138, &textX, &textY, &tempW, &tempH);
  display.setFont(&FreeSansBold12pt7b);
  display.getTextBounds("C", 0, 128, &textX, &textY, &unitW, &unitH);

  const int16_t tempUnitGap = 8;
  int16_t tempX = ((SCREEN_WIDTH - (int16_t)tempW - tempUnitGap - (int16_t)unitW) / 2) - 4;
  int16_t unitX = tempX + tempW + tempUnitGap;

  display.fillRect(38, 90, 204, 60, bgColor);
  display.setFont(&FreeSansBold24pt7b);
  display.setTextColor(TFT_TEXT, bgColor);
  display.setCursor(tempX, 138);
  display.print(tempValue);

  display.setFont(&FreeSansBold12pt7b);
  display.setCursor(unitX, 128);
  display.print("C");

  char humText[8];
  if (isnan(humidity)) {
    snprintf(humText, sizeof(humText), "--");
  } else {
    snprintf(humText, sizeof(humText), "%.0f%%", humidity);
  }
  uint16_t humW;
  uint16_t humH;
  display.getTextBounds(humText, 0, 218, &textX, &textY, &humW, &humH);
  int16_t humX = ((SCREEN_WIDTH - (int16_t)humW) / 2) - 4;

  display.fillRect(82, 192, 116, 34, bgColor);
  display.setTextColor(TFT_TEXT, bgColor);
  display.setCursor(humX, 218);
  display.print(humText);

  display.setFont(NULL);
  display.display();
}

// =====================================================
// HTTP
// =====================================================
void appendJsonEscapedString(String &target, const String &value) {
  for (size_t i = 0; i < value.length(); i++) {
    const char c = value.charAt(i);
    if (c == '"' || c == '\\') {
      target += '\\';
      target += c;
    } else if ((uint8_t)c >= 0x20) {
      target += c;
    }
  }
}

String buildTemperatureJson(const Reading &reading) {
  unsigned long sampleAgeS = 0;
  unsigned long nowMs = millis();
  time_t nowEpoch = time(nullptr);

  if (reading.sampleAgeOverrideS > 0) {
    sampleAgeS = reading.sampleAgeOverrideS;
  } else if (
    reading.capturedEpoch > CLOCK_VALID_AFTER_EPOCH &&
    nowEpoch > CLOCK_VALID_AFTER_EPOCH &&
    nowEpoch >= (time_t)reading.capturedEpoch
  ) {
    sampleAgeS = (unsigned long)(nowEpoch - reading.capturedEpoch);
  } else if (nowMs >= reading.capturedMillis) {
    sampleAgeS = (nowMs - reading.capturedMillis) / 1000UL;
  }

  String json = "{";
  json += "\"device_id\":\"" + String(DEVICE_ID) + "\",";
  json += "\"temperature\":" + String(reading.temperature, 1) + ",";
  json += "\"humidity\":" + String(reading.humidity, 1);
  json += ",\"sensor_semantics_version\":" + String(reading.sensorSemanticsVersion);
  if (reading.sensorSemanticsVersion >= SENSOR_SEMANTICS_SHT30_PRIMARY) {
    json += ",\"internal_temperature\":";
    json += reading.secondarySensorOk ? String(reading.secondaryTemperature, 1) : String("null");
    json += ",\"internal_humidity\":";
    json += reading.secondarySensorOk ? String(reading.secondaryHumidity, 1) : String("null");
    json += ",\"internal_sensor_ok\":" + String(reading.secondarySensorOk ? "true" : "false");
  } else {
    // Records captured by pre-v2 firmware keep their original meaning.
    json += ",\"exterior_temperature\":";
    json += reading.secondarySensorOk ? String(reading.secondaryTemperature, 1) : String("null");
    json += ",\"exterior_humidity\":";
    json += reading.secondarySensorOk ? String(reading.secondaryHumidity, 1) : String("null");
    json += ",\"exterior_sensor_ok\":" + String(reading.secondarySensorOk ? "true" : "false");
  }
  json += ",\"firmware_version\":\"" + String(FIRMWARE_VERSION) + "\"";
  json += ",\"telemetry_seq\":" + String(reading.sequence);
  json += ",\"sample_age_s\":" + String(sampleAgeS);
  json += ",\"sample_epoch\":" + String(reading.capturedEpoch);
  json += ",\"delivery_attempts\":" + String(reading.deliveryAttempts);
  json += ",\"captured_offline\":" + String(reading.capturedOffline ? "true" : "false");
  json += ",\"queued_backfill\":" + String(reading.queuedBackfill ? "true" : "false");
  json += ",\"capture_network_known\":" + String(reading.captureNetworkKnown ? "true" : "false");
  json += ",\"uptime_s\":" + String(millis() / 1000UL);
  json += ",\"wifi_rssi\":" + String(isWifiConnected() ? WiFi.RSSI() : 0);
  json += ",\"wifi_ssid\":";
  if (isWifiConnected()) {
    json += "\"";
    appendJsonEscapedString(json, WiFi.SSID());
    json += "\"";
  } else {
    json += "null";
  }
  json += ",\"wifi_reconnect_count\":" + String(wifiReconnectCount);
  json += ",\"boot_count\":" + String(bootCount);
  json += ",\"free_heap\":" + String(ESP.getFreeHeap());
  json += ",\"buffer_count\":" + String(bufferCount);
  json += ",\"post_ok_count\":" + String(postOkCount);
  json += ",\"post_fail_count\":" + String(postFailCount);
  json += ",\"last_post_ok_age_s\":" + String(lastPostOkMs == 0 ? 0 : (millis() - lastPostOkMs) / 1000UL);
  json += ",\"last_post_fail_age_s\":" + String(lastPostFailMs == 0 ? 0 : (millis() - lastPostFailMs) / 1000UL);
  json += ",\"clock_synced\":" + String(clockSynced ? "true" : "false");
  json += ",\"clock_sync_age_s\":" + String(lastClockSyncOkMs == 0 ? 0 : (millis() - lastClockSyncOkMs) / 1000UL);
  json += ",\"alarm_active\":" + String(alarmActive ? "true" : "false");
  json += ",\"alarm_ack\":" + String(alarmAcked ? "true" : "false");
  json += ",\"alarm_ack_count\":" + String(alarmAckCount);
  json += ",\"alarm_ack_age_s\":" + String(alarmAckMs == 0 ? 0 : (millis() - alarmAckMs) / 1000UL);
  json += ",\"alarm_ack_time\":\"" + alarmAckTimeText + "\"";
  json += ",\"alarm_event_count\":" + String(alarmEventCount);
  json += ",\"alarm_mask\":" + String(activeAlarmMask);
  json += ",\"proximity_alert_mask\":" + String(activeAlertMask);
  unsigned long alarmStartedAgeS = 0;
  time_t telemetryNowEpoch = time(nullptr);
  if (alarmStartedEpoch > CLOCK_VALID_AFTER_EPOCH && telemetryNowEpoch >= alarmStartedEpoch) {
    alarmStartedAgeS = (unsigned long)(telemetryNowEpoch - alarmStartedEpoch);
  } else if (alarmStartedMs != 0) {
    alarmStartedAgeS = (millis() - alarmStartedMs) / 1000UL;
  }
  json += ",\"alarm_started_age_s\":" + String(alarmStartedAgeS);
  json += ",\"alarm_event_age_s\":" + String(alarmEventMs == 0 ? 0 : (millis() - alarmEventMs) / 1000UL);
  json += ",\"alarm_reason\":\"" + alarmReasonText + "\"";
  json += ",\"alarm_event_time\":\"" + alarmEventTimeText + "\"";
  json += ",\"maintenance_mode\":" + String(maintenanceModeActive ? "true" : "false");
  json += ",\"maintenance_state\":\"" + maintenanceState + "\"";
  const bool payloadPrimaryHealthy =
    reading.sensorSemanticsVersion >= SENSOR_SEMANTICS_SHT30_PRIMARY
      ? primarySensorHealthy
      : internalSensorHealthy;
  const unsigned long payloadPrimaryFailCount =
    reading.sensorSemanticsVersion >= SENSOR_SEMANTICS_SHT30_PRIMARY
      ? primarySensorFailCount
      : internalSensorFailCount;
  json += ",\"sensor_ok\":" + String(payloadPrimaryHealthy ? "true" : "false");
  json += ",\"sensor_fail_count\":" + String(payloadPrimaryFailCount);
  json += ",\"hardware_diagnostics\":{";
  json += "\"schema_version\":1";
  json += ",\"overall_ok\":" + String(primarySensorHealthy && internalSensorHealthy && queueReady ? "true" : "false");
  json += ",\"components\":{";
  json += "\"dht22_interior\":{\"ok\":" + String(internalSensorHealthy ? "true" : "false") + ",\"health_state\":\"" + String(internalSensorHealthy ? "HEALTHY" : (internalSensorFailCount >= 3 ? "FAULT" : "DEGRADED")) + "\",\"diagnostic_confidence\":\"OBSERVED\",\"diagnostic_scope\":\"internal_diagnostic_only\",\"critical_to_operation\":false,\"label\":\"DHT22 interior do dispositivo\",\"data_pin\":" + String(DHT_INTERIOR_PIN) + ",\"consecutive_errors\":" + String(internalSensorFailCount) + "}";
  json += ",\"sht30_ambient\":{\"ok\":" + String(primarySensorHealthy ? "true" : "false") + ",\"health_state\":\"" + String(primarySensorHealthy ? "HEALTHY" : (primarySensorFailCount >= 3 ? "FAULT" : "DEGRADED")) + "\",\"diagnostic_confidence\":\"OBSERVED\",\"diagnostic_scope\":\"monitored_environment_primary\",\"critical_to_operation\":true,\"label\":\"SHT30 ambiente monitorizado\",\"bus\":\"I2C\",\"address\":\"0x44\",\"sda\":" + String(SHT30_SDA_PIN) + ",\"scl\":" + String(SHT30_SCL_PIN) + ",\"consecutive_errors\":" + String(primarySensorFailCount) + "}";
  json += ",\"tft_st7789\":{\"ok\":null,\"health_state\":\"UNKNOWN\",\"diagnostic_confidence\":\"OBSERVED\",\"diagnostic_scope\":\"interface_initialization_only\",\"interface_initialized\":" + String(displayReady ? "true" : "false") + ",\"label\":\"TFT ST7789\",\"sck\":" + String(TFT_SCK_PIN) + ",\"mosi\":" + String(TFT_MOSI_PIN) + ",\"cs\":" + String(TFT_CS_PIN) + ",\"dc\":" + String(TFT_DC_PIN) + ",\"rst\":" + String(TFT_RST_PIN) + ",\"blk\":" + String(TFT_BLK_PIN) + "}";
  json += ",\"rgb_button\":{\"ok\":null,\"health_state\":\"UNKNOWN\",\"diagnostic_confidence\":\"UNKNOWN\",\"diagnostic_scope\":\"configured_only\",\"label\":\"Botao RGB\",\"button\":" + String(BUTTON_PIN) + ",\"red\":" + String(BUTTON_RGB_R_PIN) + ",\"green\":" + String(BUTTON_RGB_G_PIN) + ",\"blue\":" + String(BUTTON_RGB_B_PIN) + "}";
  json += ",\"buzzer\":{\"ok\":null,\"health_state\":\"UNKNOWN\",\"diagnostic_confidence\":\"UNKNOWN\",\"diagnostic_scope\":\"configured_only\",\"label\":\"Buzzer passivo\",\"pin\":" + String(BUZZER_PIN) + ",\"enabled\":" + String(buzzerEnabled ? "true" : "false") + "}";
  json += ",\"offline_queue\":{\"ok\":" + String(queueReady ? "true" : "false") + ",\"health_state\":\"" + String(queueReady ? "HEALTHY" : "FAULT") + "\",\"diagnostic_confidence\":\"OBSERVED\",\"diagnostic_scope\":\"filesystem_io\",\"label\":\"Fila offline\",\"pending\":" + String(bufferCount) + ",\"bytes\":" + String(getQueueFileSize()) + "}";
  json += ",\"memory\":{\"ok\":" + String(ESP.getFreeHeap() > 40000 ? "true" : "false") + ",\"health_state\":\"" + String(ESP.getFreeHeap() > 40000 ? "HEALTHY" : "DEGRADED") + "\",\"diagnostic_confidence\":\"OBSERVED\",\"diagnostic_scope\":\"runtime_metric\",\"label\":\"Memoria ESP32\",\"free_heap\":" + String(ESP.getFreeHeap()) + "}";
  json += "}}";
  json += ",\"wifi_connected\":" + String(isWifiConnected() ? "true" : "false");
  json += ",\"device_status\":\"" + String(reading.capturedOffline ? "no_wifi" : currentDeviceStatus()) + "\"";
  json += ",\"reset_reason\":\"" + resetReasonText + "\"";
  json += "}";
  return json;
}

void logHttpTransportContext() {
  Serial.print("WiFi: ");
  Serial.print(wifiStatusLabel(WiFi.status()));
  Serial.print(" | RSSI: ");
  Serial.print(isWifiConnected() ? WiFi.RSSI() : 0);
  Serial.print(" | IP: ");
  Serial.print(isWifiConnected() ? WiFi.localIP().toString() : String("-"));
  Serial.print(" | Heap livre: ");
  Serial.print(ESP.getFreeHeap());
  Serial.print(" | Fila: ");
  Serial.print(bufferCount);
  Serial.print(" | Ficheiro fila: ");
  Serial.println(getQueueFileSize());
}

bool isEndpointRefusedError(const String &errorText) {
  String normalized = errorText;
  normalized.toLowerCase();
  return normalized.indexOf("connection refused") >= 0;
}

bool postJsonWithRetry(const String &url, const String &jsonPayload, String *responseOut) {
  if (!isWifiConnected()) {
    postFailCount++;
    lastPostFailMs = millis();
    return false;
  }

  if (strlen(DEVICE_API_TOKEN) == 0 || String(DEVICE_API_TOKEN) == "REPLACE_WITH_DEVICE_API_TOKEN") {
    Serial.println("ERRO: DEVICE_API_TOKEN nao configurado.");
    postFailCount++;
    lastPostFailMs = millis();
    return false;
  }

  bool transportFailure = false;
  bool endpointRefused = false;

  for (int attempt = 1; attempt <= HTTP_MAX_RETRIES; attempt++) {
    WiFiClientSecure client;
    if (!configureTlsClient(client)) {
      Serial.println("TLS bloqueado: CA de STAGING indisponivel.");
      return false;
    }

    HTTPClient http;
    http.setTimeout(HTTP_RESPONSE_TIMEOUT_MS);
    http.setConnectTimeout(HTTP_CONNECT_TIMEOUT_MS);
    http.setReuse(false);

    if (!http.begin(client, url)) {
      Serial.println("Falha ao iniciar HTTP POST.");
      transportFailure = true;
      if (attempt < HTTP_MAX_RETRIES) responsiveDelay(HTTP_RETRY_DELAY_MS);
      continue;
    }

    http.addHeader("Content-Type", "application/json");
    http.addHeader("Authorization", String(DEVICE_API_TOKEN));

    serviceInteractiveTasks();
    int code = http.POST(jsonPayload);
    serviceInteractiveTasks();
    Serial.print("POST tentativa ");
    Serial.print(attempt);
    Serial.print(" -> HTTP ");
    Serial.println(code);
    if (code <= 0) {
      transportFailure = true;
      String transportError = http.errorToString(code);
      if (isEndpointRefusedError(transportError)) endpointRefused = true;
      Serial.print("Erro transporte POST: ");
      Serial.println(transportError);
      logHttpTransportContext();
    }

    if (code >= 200 && code < 300) {
      if (responseOut != nullptr) {
        *responseOut = http.getString();
      } else {
        http.getString();
      }
      serviceInteractiveTasks();
      http.end();
      postOkCount++;
      lastPostOkMs = millis();
      backendStatusKnown = true;
      backendReachable = true;
      backendUnreachableSinceMs = 0;
      lastTransportRecoveryMs = 0;
      consecutiveHttpTransportFailures = 0;
      return true;
    }

    String errorBody = http.getString();
    if (errorBody.length() > 0) {
      Serial.print("Resposta POST: ");
      Serial.println(errorBody.substring(0, 160));
    }

    http.end();
    if (attempt < HTTP_MAX_RETRIES) {
      responsiveDelay(HTTP_RETRY_DELAY_MS);
    }
  }

  if (transportFailure) {
    unsigned long now = millis();
    if (
      lastTransportRecoveryMs == 0 ||
      now - lastTransportRecoveryMs >= WIFI_TRANSPORT_RECOVERY_COOLDOWN_MS
    ) {
      lastTransportRecoveryMs = now;
      if (consecutiveHttpTransportFailures < 255) consecutiveHttpTransportFailures++;
      Serial.print(endpointRefused
        ? "Ligacao HTTPS recusada. Falhas consecutivas: "
        : "Falha de transporte HTTP POST. Falhas consecutivas: ");
      Serial.println(consecutiveHttpTransportFailures);
      if (!isWifiConnected()) {
        forceWiFiReconnect(WIFI_TELEMETRY_RECONNECT_TIMEOUT_MS, "falha HTTP POST");
      } else if (consecutiveHttpTransportFailures >= HTTP_TRANSPORT_FORCE_RECONNECT_AFTER) {
        forceWiFiReconnect(
          WIFI_TELEMETRY_RECONNECT_TIMEOUT_MS,
          endpointRefused ? "ligacoes HTTPS recusadas" : "falhas HTTPS consecutivas",
          true
        );
      }
    } else {
      Serial.println("Falha de transporte HTTP POST. Recuperacao em cooldown.");
    }
  }

  postFailCount++;
  lastPostFailMs = millis();
  if (backendReachable || backendUnreachableSinceMs == 0) {
    backendUnreachableSinceMs = millis();
  }
  backendStatusKnown = true;
  backendReachable = false;
  return false;
}

bool getWithRetry(const String &url, String &responseOut) {
  if (!isWifiConnected()) {
    return false;
  }

  bool transportFailure = false;
  bool endpointRefused = false;

  for (int attempt = 1; attempt <= HTTP_MAX_RETRIES; attempt++) {
    WiFiClientSecure client;
    if (!configureTlsClient(client)) {
      Serial.println("TLS bloqueado: CA de STAGING indisponivel.");
      return false;
    }

    HTTPClient http;
    http.setTimeout(HTTP_RESPONSE_TIMEOUT_MS);
    http.setConnectTimeout(HTTP_CONNECT_TIMEOUT_MS);
    http.setReuse(false);

    if (!http.begin(client, url)) {
      Serial.println("Falha ao iniciar HTTP GET.");
      transportFailure = true;
      if (attempt < HTTP_MAX_RETRIES) responsiveDelay(HTTP_RETRY_DELAY_MS);
      continue;
    }

    http.addHeader("Authorization", String(DEVICE_API_TOKEN));

    serviceInteractiveTasks();
    int code = http.GET();
    serviceInteractiveTasks();
    Serial.print("GET tentativa ");
    Serial.print(attempt);
    Serial.print(" -> HTTP ");
    Serial.println(code);
    if (code <= 0) {
      transportFailure = true;
      String transportError = http.errorToString(code);
      if (isEndpointRefusedError(transportError)) endpointRefused = true;
      Serial.print("Erro transporte GET: ");
      Serial.println(transportError);
      logHttpTransportContext();
    }

    if (code == 200) {
      responseOut = http.getString();
      serviceInteractiveTasks();
      http.end();
      backendStatusKnown = true;
      backendReachable = true;
      backendUnreachableSinceMs = 0;
      lastTransportRecoveryMs = 0;
      consecutiveHttpTransportFailures = 0;
      return true;
    }

    http.end();
    if (attempt < HTTP_MAX_RETRIES) {
      responsiveDelay(HTTP_RETRY_DELAY_MS);
    }
  }

  if (transportFailure) {
    unsigned long now = millis();
    if (
      lastTransportRecoveryMs == 0 ||
      now - lastTransportRecoveryMs >= WIFI_TRANSPORT_RECOVERY_COOLDOWN_MS
    ) {
      lastTransportRecoveryMs = now;
      if (consecutiveHttpTransportFailures < 255) consecutiveHttpTransportFailures++;
      Serial.print(endpointRefused
        ? "Ligacao HTTPS recusada. Falhas consecutivas: "
        : "Falha de transporte HTTP GET. Falhas consecutivas: ");
      Serial.println(consecutiveHttpTransportFailures);
      if (!isWifiConnected()) {
        forceWiFiReconnect(WIFI_TELEMETRY_RECONNECT_TIMEOUT_MS, "falha HTTP GET");
      } else if (consecutiveHttpTransportFailures >= HTTP_TRANSPORT_FORCE_RECONNECT_AFTER) {
        forceWiFiReconnect(
          WIFI_TELEMETRY_RECONNECT_TIMEOUT_MS,
          endpointRefused ? "ligacoes HTTPS recusadas" : "falhas HTTPS consecutivas",
          true
        );
      }
    } else {
      Serial.println("Falha de transporte HTTP GET. Recuperacao em cooldown.");
    }
  }

  if (backendReachable || backendUnreachableSinceMs == 0) {
    backendUnreachableSinceMs = millis();
  }
  backendStatusKnown = true;
  backendReachable = false;
  return false;
}

bool sendReadingDirect(const Reading &reading, bool enqueueOnFail) {
  if (!isWifiConnected()) {
    if (enqueueOnFail) {
      Reading queuedReading = reading;
      markReadingQueuedBackfill(queuedReading);
      enqueueReading(queuedReading);
    }
    return false;
  }

  String json = buildTemperatureJson(reading);
  String response;
  bool ok = postJsonWithRetry(String(temperatureUrl), json, &response);

  if (ok) {
    Serial.println("Leitura atual enviada diretamente.");
    if (response.length() > 0) {
      Serial.print("Backend OK: ");
      Serial.println(response.substring(0, 160));
    }
    return true;
  }

  Serial.println("Falha no envio direto da leitura atual.");
  if (enqueueOnFail) {
    Reading queuedReading = reading;
    markReadingQueuedBackfill(queuedReading);
    enqueueReading(queuedReading);
  }
  return false;
}

bool sendReadingToServer(const Reading &reading) {
  updateBufferCount();

  if (!isWifiConnected()) {
    forceWiFiReconnect(WIFI_TELEMETRY_RECONNECT_TIMEOUT_MS, "antes de enviar telemetria");
  }

  if (!isWifiConnected()) {
    Reading queuedReading = reading;
    markReadingQueuedBackfill(queuedReading);
    return enqueueReading(queuedReading);
  }

  if (bufferCount > 0) {
    bool accepted = false;

    if (!reading.capturedOffline && !reading.queuedBackfill) {
      Serial.println("Fila offline pendente. A enviar leitura atual primeiro.");
      if (sendReadingDirect(reading, false)) {
        flushBufferedReadings();
        return true;
      }
      Serial.println("Leitura atual falhou. Guardada para reenviar.");
    }

    Reading queuedReading = reading;
    markReadingQueuedBackfill(queuedReading);
    accepted = enqueueReading(queuedReading);
    flushBufferedReadings();
    return accepted;
  }

  if (sendReadingDirect(reading, false)) {
    Serial.println("Leitura enviada com sucesso.");
    return true;
  }

  Serial.println("Leitura atual falhou. Guardada para reenviar.");
  Reading queuedReading = reading;
  markReadingQueuedBackfill(queuedReading);
  return enqueueReading(queuedReading);
}

bool sendToServer(float temperature, float humidity) {
  return sendReadingToServer(makeReading(temperature, humidity));
}

String buildHeartbeatJson() {
  String json;
  json.reserve(1800);
  json += "{\"device_id\":\"" + String(DEVICE_ID) + "\"";
  json += ",\"device_status\":\"" + currentDeviceStatus() + "\"";
  json += ",\"firmware_version\":\"" + String(FIRMWARE_VERSION) + "\"";
  json += ",\"wifi_connected\":" + String(isWifiConnected() ? "true" : "false");
  json += ",\"maintenance_mode\":" + String(maintenanceModeActive ? "true" : "false");
  json += ",\"maintenance_state\":\"" + maintenanceState + "\"";
  json += ",\"hardware_diagnostics\":{";
  json += "\"schema_version\":1";
  json += ",\"overall_ok\":" + String(primarySensorHealthy && internalSensorHealthy ? "true" : "false");
  json += ",\"components\":{";
  json += "\"dht22_interior\":{\"ok\":" + String(internalSensorHealthy ? "true" : "false") + ",\"health_state\":\"" + String(internalSensorHealthy ? "HEALTHY" : (internalSensorFailCount >= 3 ? "FAULT" : "DEGRADED")) + "\",\"diagnostic_confidence\":\"OBSERVED\",\"diagnostic_scope\":\"internal_diagnostic_only\",\"critical_to_operation\":false,\"label\":\"DHT22 interior do dispositivo\",\"data_pin\":" + String(DHT_INTERIOR_PIN) + ",\"consecutive_errors\":" + String(internalSensorFailCount) + "}";
  json += ",\"sht30_ambient\":{\"ok\":" + String(primarySensorHealthy ? "true" : "false") + ",\"health_state\":\"" + String(primarySensorHealthy ? "HEALTHY" : (primarySensorFailCount >= 3 ? "FAULT" : "DEGRADED")) + "\",\"diagnostic_confidence\":\"OBSERVED\",\"diagnostic_scope\":\"monitored_environment_primary\",\"critical_to_operation\":true,\"label\":\"SHT30 ambiente monitorizado\",\"bus\":\"I2C\",\"address\":\"0x44\",\"sda\":" + String(SHT30_SDA_PIN) + ",\"scl\":" + String(SHT30_SCL_PIN) + ",\"consecutive_errors\":" + String(primarySensorFailCount) + "}";
  json += ",\"tft_st7789\":{\"ok\":null,\"health_state\":\"UNKNOWN\",\"diagnostic_confidence\":\"OBSERVED\",\"diagnostic_scope\":\"interface_initialization_only\",\"interface_initialized\":" + String(displayReady ? "true" : "false") + ",\"label\":\"TFT ST7789\",\"sck\":" + String(TFT_SCK_PIN) + ",\"mosi\":" + String(TFT_MOSI_PIN) + ",\"cs\":" + String(TFT_CS_PIN) + ",\"dc\":" + String(TFT_DC_PIN) + ",\"rst\":" + String(TFT_RST_PIN) + ",\"blk\":" + String(TFT_BLK_PIN) + "}";
  json += ",\"rgb_button\":{\"ok\":null,\"health_state\":\"UNKNOWN\",\"diagnostic_confidence\":\"UNKNOWN\",\"diagnostic_scope\":\"configured_only\",\"label\":\"Botao RGB\",\"button\":" + String(BUTTON_PIN) + ",\"red\":" + String(BUTTON_RGB_R_PIN) + ",\"green\":" + String(BUTTON_RGB_G_PIN) + ",\"blue\":" + String(BUTTON_RGB_B_PIN) + "}";
  json += ",\"buzzer\":{\"ok\":null,\"health_state\":\"UNKNOWN\",\"diagnostic_confidence\":\"UNKNOWN\",\"diagnostic_scope\":\"configured_only\",\"label\":\"Buzzer passivo\",\"pin\":" + String(BUZZER_PIN) + ",\"enabled\":" + String(buzzerEnabled ? "true" : "false") + "}";
  json += "}}";
  json += ",\"communication_diagnostics\":{";
  json += "\"wifi_rssi\":" + String(isWifiConnected() ? WiFi.RSSI() : 0);
  json += ",\"wifi_ssid\":";
  if (isWifiConnected()) {
    json += "\"";
    appendJsonEscapedString(json, WiFi.SSID());
    json += "\"";
  } else {
    json += "null";
  }
  json += ",\"wifi_reconnect_count\":" + String(wifiReconnectCount);
  json += ",\"post_ok_count\":" + String(postOkCount);
  json += ",\"post_fail_count\":" + String(postFailCount);
  json += ",\"buffer_count\":" + String(bufferCount);
  json += ",\"boot_count\":" + String(bootCount);
  json += ",\"reset_reason\":\"" + resetReasonText + "\"";
  json += ",\"clock_synced\":" + String(clockSynced ? "true" : "false");
  json += ",\"free_heap\":" + String(ESP.getFreeHeap());
  json += "}}";
  return json;
}

bool sendHeartbeatToServer() {
  if (!isWifiConnected()) return false;

  String response;
  bool ok = postJsonWithRetry(String(heartbeatUrl), buildHeartbeatJson(), &response);
  Serial.println(ok ? "Heartbeat enviado ao backend." : "Falha ao enviar heartbeat.");
  return ok;
}

bool shouldSendImmediateTelemetry(float temperature, float humidity) {
  String currentStatus = currentDeviceStatus();

  if (lastSentDeviceStatus.length() == 0) return true;
  if (currentStatus != lastSentDeviceStatus) return true;
  if (activeAlarmMask != lastSentAlarmMask) return true;
  if (alarmAckCount != lastSentAckCount) return true;

  unsigned long now = millis();
  if (now - lastSend < VALUE_CHANGE_SEND_MIN_INTERVAL_MS) {
    return false;
  }

  if (!isnan(lastSentTemperature) && fabs(temperature - lastSentTemperature) >= IMMEDIATE_SEND_TEMP_DELTA_C) {
    return true;
  }

  if (!isnan(lastSentHumidity) && fabs(humidity - lastSentHumidity) >= IMMEDIATE_SEND_HUM_DELTA) {
    return true;
  }

  return false;
}

void markTelemetrySentSnapshot(float temperature, float humidity) {
  lastSentDeviceStatus = currentDeviceStatus();
  lastSentAlarmMask = activeAlarmMask;
  lastSentAckCount = alarmAckCount;
  lastSentTemperature = temperature;
  lastSentHumidity = humidity;
}

void queueTelemetryNow(float temperature, float humidity, unsigned long now) {
  Serial.print("Telemetria agendada. Intervalo atual: ");
  Serial.print(sendIntervalS);
  Serial.println("s");

  bool accepted = scheduleReadingForNetwork(temperature, humidity);
  if (!accepted) {
    accepted = sendToServer(temperature, humidity);
  }

  if (accepted) {
    lastSend = now;
    markTelemetrySentSnapshot(temperature, humidity);
  } else {
    Serial.println("Leitura nao aceite por nenhuma fila. Nova tentativa no proximo ciclo.");
  }
}

bool scheduleReadingForNetwork(float temperature, float humidity) {
  Reading reading = makeReading(temperature, humidity);
  if (networkReadingQueue == nullptr || networkTaskHandle == nullptr) {
    Serial.println("Tarefa de rede indisponivel. A usar envio direto/fila persistente.");
    markReadingQueuedBackfill(reading);
    return false;
  }

  if (xQueueSend(networkReadingQueue, &reading, 0) == pdTRUE) {
    Serial.print("Leitura entregue a tarefa de rede. Seq: ");
    Serial.println(reading.sequence);
    return true;
  }

  Serial.println("Fila de rede ocupada. Leitura guardada no buffer local.");
  markReadingQueuedBackfill(reading);
  return enqueueReading(reading);
}

void networkTask(void *parameter) {
  Reading reading;
  unsigned long lastBackgroundConfigFetch = millis();

  for (;;) {
    if (xQueueReceive(networkReadingQueue, &reading, pdMS_TO_TICKS(250)) == pdTRUE) {
      sendReadingToServer(reading);
    }

    if (isWifiConnected()) {
      unsigned long now = millis();
      const unsigned long activeConfigFetchInterval =
        (alarmActive && !alarmAcked) ? alarmAckFetchInterval : configFetchInterval;
      if (now - lastBackgroundConfigFetch >= activeConfigFetchInterval) {
        lastBackgroundConfigFetch = now;
        fetchRemoteConfig();
      }

      flushBufferedReadings();
    }

    vTaskDelay(pdMS_TO_TICKS(20));
  }
}

// =====================================================
// REMOTE CONFIG
// =====================================================
bool fetchRemoteConfig() {
  if (!isWifiConnected()) return false;

  String url = String(backendBaseUrl) + "/api/device/" + DEVICE_ID + "/config";
  String payload;

  Serial.println("A pedir config...");
  Serial.println(url);

  if (!getWithRetry(url, payload)) {
    Serial.println("Erro ao obter config.");
    return false;
  }

  JsonDocument doc;
  DeserializationError error = deserializeJson(doc, payload);

  if (error) {
    Serial.print("Erro ao interpretar JSON da config: ");
    Serial.println(error.c_str());
    return false;
  }

  JsonObject config = doc["config"];
  JsonObject maintenance = config["maintenance"];
  String nextMaintenanceState = maintenance["maintenance_state"] | "INACTIVE";
  nextMaintenanceState.toUpperCase();
  bool nextMaintenanceModeActive = nextMaintenanceState == "ACTIVE";
  if (nextMaintenanceModeActive != maintenanceModeActive || nextMaintenanceState != maintenanceState) {
    maintenanceModeActive = nextMaintenanceModeActive;
    maintenanceState = nextMaintenanceState;
    lastHeartbeatMs = 0;
    Serial.println(maintenanceModeActive
      ? "Maintenance Mode STS Core ativo: buzzer de processo suprimido."
      : "Maintenance Mode STS Core inativo.");
  }
  String remoteAckToken = config["remote_ack_token"] | "";
  if (remoteAckToken.length() > 0 && remoteAckToken != lastRemoteAckToken) {
    lastRemoteAckToken = remoteAckToken;
    prefs.putString("remote_ack", lastRemoteAckToken);

    if (alarmActive && !alarmAcked) {
      acknowledgeAlarm();
      Serial.println("ALARME ACK recebido remotamente pela dashboard.");
    } else {
      Serial.println("Pedido ACK remoto recebido sem alarme ativo.");
    }
  }

  int newVersion = doc["config_version"] | 0;
  if (newVersion == configVersion) {
    Serial.println("Config sem alteracoes.");
    return true;
  }

  tempLowC = config["temp_low_c"] | tempLowC;
  tempHighC = config["temp_high_c"] | tempHighC;
  humLow = config["hum_low"] | humLow;
  humHigh = config["hum_high"] | humHigh;
  hystC = config["hyst_c"] | hystC;
  hystHum = config["hyst_hum"] | hystHum;
  sendIntervalS = config["send_interval_s"] | sendIntervalS;
  displayStandbyMin = config["display_standby_min"] | displayStandbyMin;
  buzzerEnabled = config["buzzer_enabled"] | buzzerEnabled;

  if (sendIntervalS < MIN_SEND_INTERVAL_S) sendIntervalS = MIN_SEND_INTERVAL_S;
  if (sendIntervalS > MAX_SEND_INTERVAL_S) sendIntervalS = MAX_SEND_INTERVAL_S;
  if (displayStandbyMin <= 0 || displayStandbyMin > MAX_DISPLAY_STANDBY_MIN) {
    displayStandbyMin = MAX_DISPLAY_STANDBY_MIN;
  }

  sendIntervalMs = (unsigned long)sendIntervalS * 1000UL;
  oledStandbyMs = (unsigned long)displayStandbyMin * 60UL * 1000UL;
  configVersion = newVersion;

  saveLocalConfig();

  Serial.println("Nova config aplicada:");
  Serial.print("sendIntervalS: "); Serial.println(sendIntervalS);
  Serial.print("displayStandbyMin: "); Serial.println(displayStandbyMin);
  Serial.print("buzzerEnabled: "); Serial.println(buzzerEnabled ? "sim" : "nao");
  Serial.print("configVersion: "); Serial.println(configVersion);

  return true;
}

// =====================================================
// LED / ALARM
// =====================================================
// Buzzer passivo: tom PWM não bloqueante, apenas em alarme sem ACK.
void updateBuzzer() {
  static uint16_t currentFrequency = 0;
  const bool shouldSound = buzzerEnabled && !maintenanceModeActive && alarmActive && !alarmAcked;
  const unsigned long phase = millis() % 1800UL;
  uint16_t targetFrequency = 0;

  if (shouldSound) {
    if (phase < 150UL) {
      targetFrequency = BUZZER_FIRST_FREQUENCY_HZ;
    } else if (phase >= 270UL && phase < 420UL) {
      targetFrequency = BUZZER_SECOND_FREQUENCY_HZ;
    }
  }

  if (targetFrequency == currentFrequency) return;
  currentFrequency = targetFrequency;
  ledcWriteTone(BUZZER_PIN, currentFrequency);
}

void updateLedPatterns() {
  unsigned long now = millis();

  switch (state) {
    case SysState::NORMAL: {
      const unsigned long PERIOD = 5000;
      const unsigned long GLOW_MS = 1600;
      const uint8_t BASE_DUTY = 28;
      unsigned long t = (now - patternT0) % PERIOD;
      uint8_t glow = smoothGlowDuty(t, GLOW_MS, 68);
      rgbButtonWrite(0, (uint8_t)(BASE_DUTY + glow), 0);
      break;
    }

    case SysState::ALERT: {
      const unsigned long PERIOD = 5000;
      const unsigned long GLOW_MS = 2800;
      const uint8_t BASE_DUTY = 16;
      unsigned long t = (now - patternT0) % PERIOD;
      uint8_t duty = (uint8_t)(BASE_DUTY + smoothGlowDuty(t, GLOW_MS, 72));
      // Amarelo preventivo: mais verde do que o laranja de falha da API.
      rgbButtonWrite(duty, (uint8_t)((duty * 72UL) / 100UL), 0);
      break;
    }

    case SysState::NO_WIFI: {
      const unsigned long PERIOD = 6500;
      const unsigned long FADE_MS = 1200;
      const unsigned long GAP = 450;
      unsigned long t = (now - patternT0) % PERIOD;
      uint8_t duty = 0;
      if (t < FADE_MS) {
        duty = smoothGlowDuty(t, FADE_MS, 105);
      } else if (t >= FADE_MS + GAP && t < FADE_MS + GAP + FADE_MS) {
        duty = smoothGlowDuty(t - FADE_MS - GAP, FADE_MS, 105);
      }
      const bool backendOffline =
        isWifiConnected() && backendStatusKnown && !backendReachable;
      if (backendOffline) {
        // Laranja: Wi-Fi presente, mas backend/API indisponível.
        rgbButtonWrite(duty, (uint8_t)((duty * 35UL) / 100UL), 0);
      } else {
        // Azul: ligação Wi-Fi perdida.
        rgbButtonWrite(0, 0, duty);
      }
      break;
    }

    case SysState::ALARM: {
      const unsigned long PERIOD = 2600;
      unsigned long t = (now - patternT0) % PERIOD;
      rgbButtonWrite(smoothGlowDuty(t, PERIOD, 210), 0, 0);
      break;
    }

    case SysState::ALARM_ACK: {
      const unsigned long PERIOD = 5200;
      const unsigned long GLOW_MS = 4400;
      unsigned long t = (now - patternT0) % PERIOD;
      rgbButtonWrite(0, 0, smoothGlowDuty(t, GLOW_MS, 90));
      break;
    }

    case SysState::SENSOR_FAIL: {
      const unsigned long PERIOD = 1200;
      unsigned long t = (now - patternT0) % PERIOD;
      rgbButtonWrite(t < 150 ? 255 : 0, 0, 0);
      break;
    }

    case SysState::SETUP_WIFI: {
      const unsigned long PERIOD = 3800;
      unsigned long t = (now - patternT0) % PERIOD;
      uint8_t duty = smoothGlowDuty(t, PERIOD, 110);
      rgbButtonWrite(0, 0, duty);
      break;
    }
  }
}

uint8_t computeAlarmMask(float temperature, float humidity) {
  uint8_t mask = alarmActive ? activeAlarmMask : 0;

  if (mask & 0x01) {
    if (temperature <= tempHighC - hystC) mask &= ~0x01;
  } else if (temperature >= tempHighC) {
    mask |= 0x01;
  }

  if (mask & 0x02) {
    if (temperature >= tempLowC + hystC) mask &= ~0x02;
  } else if (temperature <= tempLowC) {
    mask |= 0x02;
  }

  if (mask & 0x04) {
    if (humidity <= humHigh - hystHum) mask &= ~0x04;
  } else if (humidity >= humHigh) {
    mask |= 0x04;
  }

  if (mask & 0x08) {
    if (humidity >= humLow + hystHum) mask &= ~0x08;
  } else if (humidity <= humLow) {
    mask |= 0x08;
  }

  return mask;
}

uint8_t computeAlertMask(float temperature, float humidity) {
  uint8_t mask = activeAlertMask;

  if (temperature >= tempHighC) {
    mask &= ~0x01;
  } else if (mask & 0x01) {
    if (temperature < tempHighC - TEMP_ALERT_RELEASE_MARGIN_C) mask &= ~0x01;
  } else if (temperature >= tempHighC - TEMP_ALERT_MARGIN_C) {
    mask |= 0x01;
  }

  if (temperature <= tempLowC) {
    mask &= ~0x02;
  } else if (mask & 0x02) {
    if (temperature > tempLowC + TEMP_ALERT_RELEASE_MARGIN_C) mask &= ~0x02;
  } else if (temperature <= tempLowC + TEMP_ALERT_MARGIN_C) {
    mask |= 0x02;
  }

  if (humidity >= humHigh) {
    mask &= ~0x04;
  } else if (mask & 0x04) {
    if (humidity < humHigh - HUM_ALERT_RELEASE_MARGIN) mask &= ~0x04;
  } else if (humidity >= humHigh - HUM_ALERT_MARGIN) {
    mask |= 0x04;
  }

  if (humidity <= humLow) {
    mask &= ~0x08;
  } else if (mask & 0x08) {
    if (humidity > humLow + HUM_ALERT_RELEASE_MARGIN) mask &= ~0x08;
  } else if (humidity <= humLow + HUM_ALERT_MARGIN) {
    mask |= 0x08;
  }

  return mask;
}

String alarmMaskToText(uint8_t mask) {
  String text = "";

  if (mask & 0x01) text += "Temp alta";
  if (mask & 0x02) {
    if (text.length() > 0) text += " + ";
    text += "Temp baixa";
  }
  if (mask & 0x04) {
    if (text.length() > 0) text += " + ";
    text += "Hum alta";
  }
  if (mask & 0x08) {
    if (text.length() > 0) text += " + ";
    text += "Hum baixa";
  }

  return text.length() > 0 ? text : "Fora limite";
}

void updateAlarmAndState(float temperature, float humidity) {
  if (!primarySensorHealthy) {
    activeAlertMask = 0;
    setState(SysState::SENSOR_FAIL);
    return;
  }

  uint8_t nextAlarmMask = computeAlarmMask(temperature, humidity);
  uint8_t newAlarmMask = alarmActive ? (nextAlarmMask & ~activeAlarmMask) : nextAlarmMask;

  if (nextAlarmMask != 0) {
    activeAlertMask = 0;
    if (!alarmActive || newAlarmMask != 0) {
      alarmActive = true;
      alarmAcked = false;
      if (alarmStartedMs == 0) {
        alarmStartedMs = millis();
        time_t alarmNowEpoch = time(nullptr);
        if (alarmStartedEpoch <= CLOCK_VALID_AFTER_EPOCH && alarmNowEpoch > CLOCK_VALID_AFTER_EPOCH) {
          alarmStartedEpoch = (uint32_t)alarmNowEpoch;
          prefs.putUInt("alarm_epoch", alarmStartedEpoch);
        }
      }
      alarmEventMs = millis();
      alarmAckMs = 0;
      alarmEventCount++;
      alarmReasonText = alarmMaskToText(newAlarmMask != 0 ? newAlarmMask : nextAlarmMask);
      alarmEventTimeText = formatCurrentTime();
      alarmAckTimeText = "";
      normalDisplayPage = 0;
      Serial.print("ALARME ATIVO/NOVO: ");
      Serial.println(alarmReasonText);
      refreshCurrentDisplay();
    } else {
      alarmReasonText = alarmMaskToText(nextAlarmMask);
    }
    activeAlarmMask = nextAlarmMask;

    if (alarmStartedEpoch <= CLOCK_VALID_AFTER_EPOCH) {
      time_t alarmNowEpoch = time(nullptr);
      if (alarmNowEpoch > CLOCK_VALID_AFTER_EPOCH && alarmStartedMs != 0) {
        unsigned long elapsedBeforeClockSyncS = (millis() - alarmStartedMs) / 1000UL;
        time_t derivedAlarmEpoch = alarmNowEpoch - (time_t)elapsedBeforeClockSyncS;
        if (derivedAlarmEpoch <= CLOCK_VALID_AFTER_EPOCH) derivedAlarmEpoch = CLOCK_VALID_AFTER_EPOCH + 1;
        alarmStartedEpoch = (uint32_t)derivedAlarmEpoch;
        prefs.putUInt("alarm_epoch", alarmStartedEpoch);
      }
    }
  } else {
    if (alarmActive) {
      alarmActive = false;
      alarmAcked = false;
      alarmStartedMs = 0;
      alarmStartedEpoch = 0;
      prefs.remove("alarm_epoch");
      alarmEventMs = 0;
      alarmAckMs = 0;
      activeAlarmMask = 0;
      alarmReasonText = "";
      alarmEventTimeText = "";
      alarmAckTimeText = "";
      normalDisplayPage = 0;
      Serial.println("ALARME RESOLVIDO.");
      refreshCurrentDisplay();
    } else if (alarmStartedEpoch != 0) {
      alarmStartedEpoch = 0;
      prefs.remove("alarm_epoch");
    }
  }

  if (alarmActive) {
    setState(alarmAcked ? SysState::ALARM_ACK : SysState::ALARM);
    return;
  }

  activeAlertMask = computeAlertMask(temperature, humidity);
  if (isDeviceCommunicationOffline()) {
    setState(SysState::NO_WIFI);
  } else {
    setState(activeAlertMask != 0 ? SysState::ALERT : SysState::NORMAL);
  }
}

// =====================================================
// SETUP
// =====================================================
void setup() {
  Serial.begin(115200);
  delay(300);

  prefs.begin("sts", false);
  resetReasonText = resetReasonToText(esp_reset_reason());
  bootCount = prefs.getUInt("boot_count", 0) + 1;
  prefs.putUInt("boot_count", bootCount);
  loadLocalConfig();

  Serial.print("Firmware: ");
  Serial.println(FIRMWARE_VERSION);
  Serial.print("Reset reason: ");
  Serial.println(resetReasonText);
  Serial.print("Boot count: ");
  Serial.println(bootCount);

  environmentConfigValid = validateEnvironmentConfig();

  registerMainTaskWatchdog("arranque");

  pinMode(BUTTON_RGB_R_PIN, OUTPUT);
  pinMode(BUTTON_RGB_G_PIN, OUTPUT);
  pinMode(BUTTON_RGB_B_PIN, OUTPUT);
  pinMode(TFT_BLK_PIN, OUTPUT);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  digitalWrite(TFT_BLK_PIN, HIGH);
  ledcAttach(BUZZER_PIN, BUZZER_FIRST_FREQUENCY_HZ, BUZZER_PWM_RESOLUTION);
  ledcWriteTone(BUZZER_PIN, 0);
  attachInterrupt(digitalPinToInterrupt(BUTTON_PIN), buttonIsr, CHANGE);
  interactiveTasksReady = true;

  digitalWrite(BUTTON_RGB_R_PIN, HIGH);
  digitalWrite(BUTTON_RGB_G_PIN, HIGH);
  digitalWrite(BUTTON_RGB_B_PIN, HIGH);
  ledcAttach(BUTTON_RGB_R_PIN, 5000, 8);
  ledcAttach(BUTTON_RGB_G_PIN, 5000, 8);
  ledcAttach(BUTTON_RGB_B_PIN, 5000, 8);
  rgbButtonWrite(0, 0, 0);

  dhtInterior.begin();
  Wire.begin(SHT30_SDA_PIN, SHT30_SCL_PIN);
  Wire.setClock(SHT30_I2C_FREQUENCY_HZ);
  primarySensorHealthy = sht30Ambient.begin(SHT30_AMBIENT_ADDRESS);
  if (!primarySensorHealthy) {
    Serial.println("SHT30 ambiente nao encontrado no endereco I2C 0x44");
  }

  if (!display.initialize()) {
    Serial.println("Falha ao inicializar TFT ST7789");
    displayReady = false;
  } else {
    displayReady = true;
    ensureCachedQrCode(dashboardQrText, 1, dashboardQrCache);
    ensureCachedQrCode(WIFI_SETUP_QR_TEXT, 2, setupQrCache);
    display.clearDisplay();
    display.display();
  }

  oledOn = true;
  lastUserActivityMs = millis();
  setState(SysState::NORMAL);
  displayMainClockScreen();
  responsiveDelay(150);
  initReadingQueue();

  if (!environmentConfigValid) {
    displayNoticeScreen("STAGING bloqueado", "Config local em falta");
    return;
  }

  connectWiFi();
  if (isWifiConnected()) {
    setupOta();
    syncClock();
    fetchRemoteConfig();
  }

  networkReadingQueue = xQueueCreate(32, sizeof(Reading));
  if (networkReadingQueue == nullptr) {
    Serial.println("Falha ao criar fila da tarefa de rede.");
  } else {
    BaseType_t networkTaskResult = xTaskCreatePinnedToCore(
      networkTask,
      "sts_network",
      12288,
      nullptr,
      1,
      &networkTaskHandle,
      0
    );

    if (networkTaskResult != pdPASS) {
      networkTaskHandle = nullptr;
      Serial.println("Falha ao iniciar tarefa de rede.");
    }
  }

  lastDisplay = millis();
  lastSend = millis();
  lastHeartbeatMs = 0;
  lastConfigFetch = millis();
  lastSensorRead = 0;
  lastWifiConnected = isWifiConnected();

  setState(isWifiConnected() ? SysState::NORMAL : SysState::NO_WIFI);
  if (isWifiConnected()) {
    bufferFlushPausedUntilMs = 0;
    lastBufferFlushMs = 0;
  }
}

// =====================================================
// LOOP
// =====================================================
void loop() {
  feedMainTaskWatchdog();

  if (!environmentConfigValid) {
    responsiveDelay(250);
    return;
  }

  serviceInteractiveTasks();

  if (isWifiConnected()) {
    ArduinoOTA.handle();
    syncClock();
  }

  if (wifiPortalRequested) {
    wifiPortalRequested = false;
    if (wifiResetFired && !wifiResetArmed) {
      startWiFiSetupPortal(true);
    } else {
      Serial.println("Pedido WiFi ignorado: reset nao confirmado por 8s.");
    }
  }

  ensureWiFiConnected();

  unsigned long now = millis();

  if (
    isWifiConnected() &&
    !userInteractionInProgress() &&
    (lastHeartbeatMs == 0 || now - lastHeartbeatMs >= HEARTBEAT_INTERVAL_MS)
  ) {
    if (sendHeartbeatToServer()) {
      lastHeartbeatMs = now;
    } else {
      // Evita uma repetição apertada quando o backend está temporariamente indisponível.
      lastHeartbeatMs = now;
    }
  }

  if (!userInteractionInProgress() && (now - lastSensorRead >= sensorReadInterval || isnan(lastTemperature) || isnan(lastHumidity))) {
    lastSensorRead = now;

    float internalT = dhtInterior.readTemperature();
    float internalH = dhtInterior.readHumidity();
    float ambientT = sht30Ambient.readTemperature();
    float ambientH = sht30Ambient.readHumidity();

    if (!isnan(internalT) && !isnan(internalH)) {
      lastInternalTemperature = internalT;
      lastInternalHumidity = internalH;
      internalSensorHealthy = true;
      internalSensorFailCount = 0;
    } else {
      lastInternalTemperature = NAN;
      lastInternalHumidity = NAN;
      internalSensorHealthy = false;
      internalSensorFailCount++;
      if (internalSensorFailCount == 1) lastHeartbeatMs = 0;
      Serial.println("Erro ao ler DHT22 interior do dispositivo (GPIO 4)");
    }

    if (!isnan(ambientT) && !isnan(ambientH)) {
      lastTemperature = ambientT;
      lastHumidity = ambientH;
      primarySensorHealthy = true;
      primarySensorFailCount = 0;
    } else {
      lastTemperature = NAN;
      lastHumidity = NAN;
      primarySensorHealthy = false;
      primarySensorFailCount++;
      if (primarySensorFailCount == 1) {
        lastHeartbeatMs = 0;
        activeAlertMask = 0;
        activeAlarmMask = 0;
        alarmActive = false;
        alarmAcked = false;
        alarmStartedMs = 0;
        alarmStartedEpoch = 0;
        prefs.remove("alarm_epoch");
        alarmReasonText = "";
        alarmEventTimeText = "";
        alarmAckTimeText = "";
      }
      setState(SysState::SENSOR_FAIL);
      refreshCurrentDisplay();
      Serial.println("Erro ao ler SHT30 do ambiente monitorizado (I2C 0x44)");
    }
  }

  if (!isnan(lastTemperature) && !isnan(lastHumidity)) {
    updateAlarmAndState(lastTemperature, lastHumidity);

    bool wifiConnectedNow = isWifiConnected();
    if (
      wifiConnectedNow &&
      !lastWifiConnected &&
      !userInteractionInProgress()
    ) {
      Serial.println("WiFi recuperado. A enviar leitura atual imediata.");
      queueTelemetryNow(lastTemperature, lastHumidity, now);
    }
    lastWifiConnected = wifiConnectedNow;

    unsigned long currentDisplayInterval = displayInterval;

    if (!oledStandbyBlank && now - lastDisplay >= currentDisplayInterval) {
      lastDisplay = now;

      Serial.print("Ambiente monitorizado: ");
      Serial.print(lastTemperature, 1);
      Serial.print(" C | Hum: ");
      Serial.print(lastHumidity, 0);
      Serial.print(" %");
      Serial.print(" | Interior dispositivo: ");
      if (internalSensorHealthy) {
        Serial.print(lastInternalTemperature, 1);
        Serial.print(" C | Hum: ");
        Serial.print(lastInternalHumidity, 0);
        Serial.print(" %");
      } else {
        Serial.print("indisponivel");
      }
      Serial.println();

      displayNormalPage(lastTemperature, lastHumidity);
    }

    bool immediateTelemetry =
      wifiConnectedNow &&
      !userInteractionInProgress() &&
      shouldSendImmediateTelemetry(lastTemperature, lastHumidity);

    if (immediateTelemetry) {
      Serial.println("Evento relevante. A enviar leitura imediata.");
      queueTelemetryNow(lastTemperature, lastHumidity, now);
    } else if (!userInteractionInProgress() && now - lastSend >= sendIntervalMs) {
      queueTelemetryNow(lastTemperature, lastHumidity, now);
    }
  } else {
    if (isDeviceCommunicationOffline()) setState(SysState::NO_WIFI);
  }

  updateOledStandby();
  updateLedPatterns();
  updateBuzzer();

  delay(10);
}
