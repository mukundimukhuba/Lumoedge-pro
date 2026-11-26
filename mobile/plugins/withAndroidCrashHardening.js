/**
 * Persist ProGuard keep rules through Continuous Native Generation.
 * Minify is currently OFF for release stability; rules are ready if re-enabled.
 */
const { withDangerousMod, createRunOncePlugin } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const KEEP_RULES = `# Lumo Edge Pro — release keep rules (AN-127 crash hardening)
# Minify is OFF for release stability. If re-enabled, keep -dontoptimize
# until device smoke passes (AGP 9 requires proguard-android-optimize.txt).

-dontoptimize

-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }
-keep class com.facebook.soloader.** { *; }
-keep class com.facebook.fresco.** { *; }
-keep class expo.modules.** { *; }
-keep class com.swmansion.reanimated.** { *; }
-keep class com.swmansion.rnscreens.** { *; }
-keep class com.swmansion.gesturehandler.** { *; }
-keep class com.th3rdwave.safeareacontext.** { *; }
-keep class com.reactnativecommunity.asyncstorage.** { *; }
-keep class host.exp.exponent.** { *; }

-keep class * implements com.facebook.react.bridge.NativeModule { *; }
-keep class * implements com.facebook.react.bridge.JavaScriptModule { *; }
-keepclassmembers class * { native <methods>; }

-dontwarn com.facebook.react.**
-dontwarn expo.modules.**
-dontwarn com.squareup.zstd.**
-keep class com.squareup.zstd.** { *; }
`;

function withProguardFile(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const file = path.join(
        cfg.modRequest.platformProjectRoot,
        'app',
        'proguard-rules.pro',
      );
      let existing = '';
      try {
        existing = fs.readFileSync(file, 'utf8');
      } catch {
        existing = '';
      }
      if (!existing.includes('AN-127 crash hardening')) {
        fs.writeFileSync(
          file,
          `${existing.trimEnd()}\n\n${KEEP_RULES}\n`,
          'utf8',
        );
      }
      return cfg;
    },
  ]);
}

const withAndroidCrashHardening = (config) => withProguardFile(config);

module.exports = createRunOncePlugin(
  withAndroidCrashHardening,
  'withAndroidCrashHardening',
  '1.0.1',
);
