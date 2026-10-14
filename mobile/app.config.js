/**
 * Dynamic layer on top of app.json, driven by environment variables (set per build profile in eas.json):
 *
 *   APP_VARIANT                 development | preview | production
 *   EXPO_PUBLIC_API_URL         API base URL baked into the build (can be changed on the login screen)
 *   GOOGLE_MAPS_ANDROID_API_KEY Google Maps key for Android map screens
 *   GOOGLE_SERVICES_JSON        path to google-services.json (default ./google-services.json) for FCM push
 */
const fs = require('fs');
const path = require('path');

module.exports = ({ config }) => {
  const variant = process.env.APP_VARIANT || 'development';
  const isProd = variant === 'production';
  const googleServices = process.env.GOOGLE_SERVICES_JSON || './google-services.json';
  const hasGoogleServices = fs.existsSync(path.resolve(__dirname, googleServices));

  // Development and preview builds may talk to a test server over plain http on the office Wi-Fi;
  // production builds are HTTPS-only.
  const plugins = (config.plugins || []).filter((p) => p !== 'expo-build-properties');
  plugins.push(['expo-build-properties', { android: { usesCleartextTraffic: !isProd } }]);

  return {
    ...config,
    // Separate app names/ids let the test build and the store build be installed side by side.
    name: isProd ? config.name : `${config.name} (${variant === 'preview' ? 'Test' : 'Dev'})`,
    plugins,
    android: {
      ...config.android,
      package: isProd ? config.android.package : `${config.android.package}.${variant === 'preview' ? 'test' : 'dev'}`,
      ...(hasGoogleServices ? { googleServicesFile: googleServices } : {}),
      config: {
        ...config.android?.config,
        googleMaps: { apiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY || config.android?.config?.googleMaps?.apiKey },
      },
    },
    extra: {
      ...config.extra,
      variant,
      pushConfigured: hasGoogleServices,
    },
  };
};
