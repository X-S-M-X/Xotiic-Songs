// Update 19 ships in local-only mode. Add a reviewed HTTPS backend later before enabling it.
window.XOTIIC_ONLINE_CONFIG = Object.freeze({
  enabled: false,
  endpoint: "",
  features: Object.freeze({
    accounts: false,
    globalCharts: false,
    releaseAlerts: false,
  }),
});
