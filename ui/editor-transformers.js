// ui/editor-transformers.js - 45+ mod transformations across 4 file types
function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export var FILE_TYPES = {
  manifest: {
    key: 'manifest',
    label: 'AndroidManifest.xml',
    placeholder: '<?xml version="1.0" encoding="utf-8"?>\n<manifest xmlns:android="http://schemas.android.com/apk/res/android"\n    package="com.example.app"\n    android:versionCode="1"\n    android:versionName="1.0"\n    android:installLocation="auto">\n\n    <uses-permission android:name="android.permission.INTERNET" />\n    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />\n    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />\n    <uses-permission android:name="android.permission.CAMERA" />\n    <uses-permission android:name="android.permission.READ_CONTACTS" />\n    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />\n    <uses-permission android:name="android.permission.READ_PHONE_STATE" />\n    <uses-permission android:name="android.permission.RECORD_AUDIO" />\n    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />\n    <uses-permission android:name="android.permission.WAKE_LOCK" />\n\n    <application\n        android:allowBackup="false"\n        android:debuggable="false"\n        android:theme="@style/AppTheme"\n        android:label="Original App"\n        android:supportsRtl="true">\n\n        <activity android:name=".MainActivity" android:screenOrientation="portrait">\n            <intent-filter>\n                <action android:name="android.intent.action.MAIN" />\n                <category android:name="android.intent.category.LAUNCHER" />\n            </intent-filter>\n        </activity>\n        <activity android:name=".SettingsActivity" />\n        <activity android:name=".PremiumActivity" />\n        <activity android:name="com.google.android.gms.ads.AdActivity" />\n        <activity android:name="com.facebook.ads.AudienceNetworkActivity" />\n\n        <service android:name="com.google.firebase.messaging.FirebaseMessagingService" />\n        <service android:name="com.google.firebase.analytics.connector.internal.AnalyticsConnectorService" />\n\n        <receiver android:name="com.google.firebase.analytics.FirebaseAnalyticsReceiver" />\n        <receiver android:name="com.google.android.gms.measurement.AppMeasurementReceiver" />\n        <receiver android:name="com.example.app.BootReceiver" />\n\n        <provider android:name="com.google.firebase.provider.FirebaseInitProvider" android:authorities="com.example.app.firebaseinitprovider" />\n        <provider android:name="com.example.app.AppContentProvider" android:authorities="com.example.app.provider" />\n\n        <meta-data android:name="com.google.android.gms.ads.APPLICATION_ID" android:value="ca-app-pub-xxx" />\n        <meta-data android:name="com.google.firebase.analytics.defaultconsent" android:value="1" />\n        <meta-data android:name="com.crashlytics.android.project_id" android:value="abc123" />\n        <meta-data android:name="com.google.android.gms.version" android:value="@integer/google_play_services_version" />\n        <meta-data android:name="firebase_messaging_auto_init_enabled" android:value="true" />\n    </application>\n</manifest>',
    transforms: [
      {
        id: 'manifestRemoveAds', label: 'Remove All Ads', category: 'ads',
        description: 'Remove AdMob, Facebook Ads and all ad activities/services/meta-data',
        detect: function(c) { return /ads|admob|AdActivity|AudienceNetwork/i.test(c); },
        apply: function(c) {
          var out = c.replace(/<activity[^>]*(?:ads|admob|AdActivity|AudienceNetwork)[^>]*\/>/gi, '');
          out = out.replace(/<activity[^>]*(?:ads|admob|AdActivity|AudienceNetwork)[^>]*>[\s\S]*?<\/activity>/gi, '');
          out = out.replace(/<meta-data[^>]*(?:ads|admob|com\.google\.android\.gms\.ads)[^>]*\/>/gi, '');
          return out;
        }
      },
      {
        id: 'manifestRemoveSponsored', label: 'Remove Sponsored References', category: 'ads',
        description: 'Remove sponsored/monetization meta-data and banner activities',
        detect: function(c) { return /sponsor|monetiz|banner|interstitial|reward/i.test(c); },
        apply: function(c) {
          var out = c.replace(/<meta-data[^>]*(?:sponsor|monetiz|banner|interstitial|reward)[^>]*\/>/gi, '');
          out = out.replace(/\s*<activity[^>]*(?:sponsor|banner|interstitial|reward)[^>]*>[\s\S]*?<\/activity>/gi, '');
          return out;
        }
      },
      {
        id: 'manifestRemoveNonEssentialPerms', label: 'Remove Non-Essential Permissions', category: 'privacy',
        description: 'Keep INTERNET and NETWORK_STATE only \u2014 remove all tracking/storage/location perms',
        detect: function(c) { return /uses-permission/i.test(c); },
        apply: function(c) {
          var keep = ['INTERNET', 'ACCESS_NETWORK_STATE'];
          return c.replace(/<uses-permission[^>]*android:name="android\.permission\.([^"]+)"[^>]*\/>\s*/g, function(m, p) {
            return keep.indexOf(p) >= 0 ? m : '';
          });
        }
      },
      {
        id: 'manifestRemoveLocation', label: 'Remove Location Permissions', category: 'privacy',
        description: 'Remove ACCESS_FINE_LOCATION and ACCESS_COARSE_LOCATION',
        detect: function(c) { return /ACCESS_(FINE|COARSE)_LOCATION/i.test(c); },
        apply: function(c) { return c.replace(/\s*<uses-permission[^>]*ACCESS_(?:FINE|COARSE)_LOCATION[^>]*\/>\s*\n?/gi, ''); }
      },
      {
        id: 'manifestRemoveCamera', label: 'Remove Camera Permission', category: 'privacy',
        description: 'Remove CAMERA permission',
        detect: function(c) { return /CAMERA/i.test(c); },
        apply: function(c) { return c.replace(/\s*<uses-permission[^>]*CAMERA[^>]*\/>\s*\n?/gi, ''); }
      },
      {
        id: 'manifestRemoveContacts', label: 'Remove Contacts Permission', category: 'privacy',
        description: 'Remove READ/WRITE_CONTACTS permissions',
        detect: function(c) { return /CONTACTS/i.test(c); },
        apply: function(c) { return c.replace(/\s*<uses-permission[^>]*(?:READ|WRITE)_CONTACTS[^>]*\/>\s*\n?/gi, ''); }
      },
      {
        id: 'manifestRemovePhoneState', label: 'Remove Phone State Permission', category: 'privacy',
        description: 'Remove READ_PHONE_STATE (stops device fingerprinting)',
        detect: function(c) { return /READ_PHONE_STATE/i.test(c); },
        apply: function(c) { return c.replace(/\s*<uses-permission[^>]*READ_PHONE_STATE[^>]*\/>\s*\n?/gi, ''); }
      },
      {
        id: 'manifestRemoveRecordAudio', label: 'Remove Record Audio Permission', category: 'privacy',
        description: 'Remove RECORD_AUDIO permission',
        detect: function(c) { return /RECORD_AUDIO/i.test(c); },
        apply: function(c) { return c.replace(/\s*<uses-permission[^>]*RECORD_AUDIO[^>]*\/>\s*\n?/gi, ''); }
      },
      {
        id: 'manifestRemoveStorage', label: 'Remove Storage Permissions', category: 'privacy',
        description: 'Remove READ/WRITE_EXTERNAL_STORAGE',
        detect: function(c) { return /EXTERNAL_STORAGE/i.test(c); },
        apply: function(c) { return c.replace(/\s*<uses-permission[^>]*(?:READ|WRITE)_EXTERNAL_STORAGE[^>]*\/>\s*\n?/gi, ''); }
      },
      {
        id: 'manifestRemoveFirebaseAnalytics', label: 'Disable FirebaseAnalytics', category: 'trackers',
        description: 'Remove FirebaseAnalytics receivers, services, providers, meta-data',
        detect: function(c) { return /firebase.*analytics|appmeasurement|analytics.*connector/i.test(c); },
        apply: function(c) {
          var out = c.replace(/\s*<receiver[^>]*(?:firebase.*analytics|appmeasurement)[^>]*\/>\s*\n?/gi, '');
          out = out.replace(/\s*<receiver[^>]*(?:firebase.*analytics|appmeasurement)[^>]*>[\s\S]*?<\/receiver>\s*\n?/gi, '');
          out = out.replace(/\s*<service[^>]*(?:firebase.*analytics|appmeasurement|analytics.*connector)[^>]*\/>\s*\n?/gi, '');
          out = out.replace(/\s*<service[^>]*(?:firebase.*analytics|appmeasurement|analytics.*connector)[^>]*>[\s\S]*?<\/service>\s*\n?/gi, '');
          out = out.replace(/\s*<meta-data[^>]*firebase.*analytics[^>]*\/>\s*\n?/gi, '');
          return out;
        }
      },
      {
        id: 'manifestRemoveCrashlytics', label: 'Remove Crashlytics', category: 'trackers',
        description: 'Remove Crashlytics providers, meta-data, build IDs',
        detect: function(c) { return /crashlytics/i.test(c); },
        apply: function(c) {
          var out = c.replace(/\s*<meta-data[^>]*crashlytics[^>]*\/>\s*\n?/gi, '');
          out = out.replace(/\s*<provider[^>]*crashlytics[^>]*\/>\s*\n?/gi, '');
          out = out.replace(/\s*<provider[^>]*crashlytics[^>]*>[\s\S]*?<\/provider>\s*\n?/gi, '');
          return out;
        }
      },
      {
        id: 'manifestRemoveAllTrackers', label: 'Remove All Trackers & Receivers', category: 'trackers',
        description: 'Remove all non-essential receivers, services, providers and meta-data',
        detect: function(c) { return /<receiver|<service|<provider|<meta-data/i.test(c); },
        apply: function(c) {
          var out = c.replace(/\s*<receiver[^>]*\/>\s*\n?/gi, '');
          out = out.replace(/\s*<receiver[^>]*>[\s\S]*?<\/receiver>\s*\n?/gi, '');
          out = out.replace(/\s*<service[^>]*(?:firebase|google)[^>]*\/>\s*\n?/gi, '');
          out = out.replace(/\s*<service[^>]*(?:firebase|google)[^>]*>[\s\S]*?<\/service>\s*\n?/gi, '');
          out = out.replace(/\s*<provider[^>]*(?:firebase|google)[^>]*\/>\s*\n?/gi, '');
          out = out.replace(/\s*<provider[^>]*(?:firebase|google)[^>]*>[\s\S]*?<\/provider>\s*\n?/gi, '');
          out = out.replace(/\s*<meta-data[^>]*(?:firebase|crashlytics|analytics|gms\.version|messaging)[^>]*\/>\s*\n?/gi, '');
          return out;
        }
      },
      {
        id: 'manifestEnableBackup', label: 'Enable Backup', category: 'features',
        description: 'Set android:allowBackup="true"',
        detect: function(c) { return /allowBackup\s*=\s*"false"/i.test(c); },
        apply: function(c) { return c.replace(/(android:allowBackup\s*=\s*)"false"/gi, '$1"true"'); }
      },
      {
        id: 'manifestEnableDebuggable', label: 'Enable Debuggable', category: 'features',
        description: 'Set android:debuggable="true" for logcat',
        detect: function(c) { return /<application/i.test(c); },
        apply: function(c) {
          if (/debuggable\s*=\s*"true"/i.test(c)) return c;
          if (/debuggable\s*=\s*"false"/i.test(c)) return c.replace(/(android:debuggable\s*=\s*)"false"/gi, '$1"true"');
          return c.replace(/(<application\b)/i, '$1\n        android:debuggable="true"');
        }
      },
      {
        id: 'manifestSdCardInstall', label: 'Install on SD Card', category: 'features',
        description: 'Set android:installLocation="preferExternal"',
        detect: function(c) { return /installLocation/i.test(c); },
        apply: function(c) { return c.replace(/(android:installLocation\s*=\s*)"[^"]*"/gi, '$1"preferExternal"'); }
      },
      {
        id: 'manifestFixInstallError', label: 'Fix Installation Package Error', category: 'features',
        description: 'Clean installLocation and remove duplicate permissions',
        detect: function(c) { return /installLocation|versionCode|package/i.test(c); },
        apply: function(c) {
          var out = c;
          if (/installLocation/i.test(out)) out = out.replace(/(android:installLocation\s*=\s*)"[^"]*"/gi, '$1"auto"');
          var lines = out.split('\n');
          var seen = {};
          var result = [];
          for (var li = 0; li < lines.length; li++) {
            var m = lines[li].match(/android:name="(android\.permission\.\w+)"/);
            if (m) { if (seen[m[1]]) continue; seen[m[1]] = true; }
            result.push(lines[li]);
          }
          return result.join('\n');
        }
      },
      {
        id: 'manifestRemoveScreenshotRestriction', label: 'Remove Screenshot Restrictions', category: 'features',
        description: 'Add FLAG_SECURE removal comment for screenshot unblock',
        detect: function(c) { return /<application|<activity/i.test(c); },
        apply: function(c) { return c.replace(/(<\/application>)/i, '    <!-- MOD: Screenshot restrictions removed \u2014 remove FLAG_SECURE in smali -->\n$1'); }
      },
      {
        id: 'manifestRemovePortraitLock', label: 'Remove Screen Orientation Lock', category: 'features',
        description: 'Remove screenOrientation so app rotates freely',
        detect: function(c) { return /screenOrientation/i.test(c); },
        apply: function(c) { return c.replace(/\s*android:screenOrientation="[^"]*"/gi, ''); }
      },
    ]
  },

  strings: {
    key: 'strings',
    label: 'values/strings.xml',
    placeholder: '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <string name="app_name">Original App</string>\n    <string name="welcome_message">Welcome to the app!</string>\n    <string name="settings">Settings</string>\n    <string name="about">About</string>\n    <string name="version">Version 1.0</string>\n    <string name="premium_feature">Unlock Premium</string>\n    <string name="premium_text">Subscribe to Premium for $9.99/month</string>\n    <string name="pro_badge">PRO</string>\n    <string name="upgrade_button">Upgrade Now</string>\n    <string name="ad_text">Sponsored</string>\n    <string name="ad_label">Advertisement</string>\n    <string name="gems_count">0 Gems</string>\n    <string name="coins_count">0 Coins</string>\n    <string name="orbs_count">0 Orbs</string>\n    <string name="damage_value">100</string>\n    <string name="cooldown_text">Skill on cooldown: 30s</string>\n    <string name="gallery_locked">Gallery Locked \u2014 Complete the story</string>\n    <string name="gallery_unlock">Unlock Gallery</string>\n    <string name="save_slot_1">Empty Slot</string>\n    <string name="daily_searches_remaining">5 searches remaining today</string>\n    <string name="feature_locked">This feature requires a subscription</string>\n    <string name="login_required">Please login to access this feature</string>\n    <string name="file_upload">Upload File</string>\n</resources>',
    transforms: [
      {
        id: 'stringsChangeAppName', label: 'Change App Name', category: 'branding',
        description: 'Rename the app to a custom name',
        hasInput: true, inputPlaceholder: 'My Modded App',
        detect: function(c) { return /app_name/i.test(c); },
        apply: function(c, val) { return c.replace(/(<string\s+name="app_name">)(.*?)(<\/string>)/gi, '$1' + escapeXml(val || 'My Modded App') + '$3'); }
      },
      {
        id: 'stringsChangeVersion', label: 'Change Version Text', category: 'branding',
        description: 'Change displayed version to show modded build',
        hasInput: true, inputPlaceholder: 'v2.0 MOD',
        detect: function(c) { return /name="version"/i.test(c); },
        apply: function(c, val) { return c.replace(/(<string\s+name="version">)(.*?)(<\/string>)/gi, '$1' + escapeXml(val || 'v2.0 MOD') + '$3'); }
      },
      {
        id: 'stringsForceEnglish', label: 'Force English Translation', category: 'branding',
        description: 'Add English locale marker for non-English APKs',
        detect: function(c) { return /<resources|<string/i.test(c); },
        apply: function(c) { return '<!-- MOD: Translation set to English (en) -->\n' + c; }
      },
      {
        id: 'stringsPremiumProUnlocked', label: 'Premium & Pro Unlocked', category: 'premium',
        description: 'Replace premium/pro/upgrade text to show unlocked status',
        detect: function(c) { return /premium|pro_badge|upgrade|subscribe/i.test(c); },
        apply: function(c) {
          var out = c;
          out = out.replace(/(<string\s+name="premium_feature">)(.*?)(<\/string>)/gi, '$1Active$3');
          out = out.replace(/(<string\s+name="premium_text">)(.*?)(<\/string>)/gi, '$1Active$3');
          out = out.replace(/(<string\s+name="upgrade_button">)(.*?)(<\/string>)/gi, '$1Active$3');
          out = out.replace(/(<string\s+name="pro_badge">)(.*?)(<\/string>)/gi, '$1ACTIVE$3');
          return out;
        }
      },
      {
        id: 'stringsAllFeaturesUnlocked', label: 'All Features Unlocked', category: 'premium',
        description: 'Replace locked/subscription/feature text to show unlocked status',
        detect: function(c) { return /feature_locked|locked|subscription|login_required/i.test(c); },
        apply: function(c) {
          var out = c;
          out = out.replace(/(<string\s+name="feature_locked">)(.*?)(<\/string>)/gi, '$1All Features Available$3');
          out = out.replace(/(<string\s+name="login_required">)(.*?)(<\/string>)/gi, '$1Access Granted$3');
          out = out.replace(/(<string\s+name="[^"]*subscription[^"]*">)(.*?)(<\/string>)/gi, '$1Active$3');
          return out;
        }
      },
      {
        id: 'stringsMaxUnlocked', label: 'Set Max Level Display', category: 'branding',
        description: 'Set max_unlocked text and mark tiers as maxed',
        detect: function(c) { return /max_unlocked|tier|level/i.test(c); },
        apply: function(c) {
          var out = c;
          out = out.replace(/(<string\s+name="max_unlocked">)(.*?)(<\/string>)/gi, '$1Max Level$3');
          out = out.replace(/(<string\s+name="[^"]*tier[^"]*">)(.*?)(<\/string>)/gi, '$1MAX$3');
          return out;
        }
      },
      {
        id: 'stringsSetGems', label: 'Unlimited Gems', category: 'resources',
        description: 'Set gems display text to 9,999,999',
        detect: function(c) { return /gem/i.test(c); },
        apply: function(c) { return c.replace(/(<string\s+name="[^"]*gems[^"]*">)(.*?)(<\/string>)/gi, '$19,999,999 Gems$3'); }
      },
      {
        id: 'stringsSetCoins', label: 'Unlimited Coins', category: 'resources',
        description: 'Set coins display text to 9,999,999',
        detect: function(c) { return /coin/i.test(c); },
        apply: function(c) { return c.replace(/(<string\s+name="[^"]*coins[^"]*">)(.*?)(<\/string>)/gi, '$19,999,999 Coins$3'); }
      },
      {
        id: 'stringsSetOrbs', label: 'Infinite Orbs', category: 'resources',
        description: 'Set orbs display text to 9,999,999',
        detect: function(c) { return /orb/i.test(c); },
        apply: function(c) { return c.replace(/(<string\s+name="[^"]*orbs[^"]*">)(.*?)(<\/string>)/gi, '$19,999,999 Orbs$3'); }
      },
      {
        id: 'stringsDamageMultiplier', label: 'Damage Multiplier Text', category: 'resources',
        description: 'Set damage value text (enter custom number)',
        hasInput: true, inputPlaceholder: '999999',
        detect: function(c) { return /damage/i.test(c); },
        apply: function(c, val) { return c.replace(/(<string\s+name="[^"]*damage[^"]*">)(.*?)(<\/string>)/gi, '$1' + escapeXml(val || '999999') + '$3'); }
      },
      {
        id: 'stringsNoCooldown', label: 'No Skill Cooldown', category: 'gameplay',
        description: 'Replace cooldown timer text with Ready',
        detect: function(c) { return /cooldown/i.test(c); },
        apply: function(c) { return c.replace(/(<string\s+name="[^"]*cooldown[^"]*">)(.*?)(<\/string>)/gi, '$1Ready$3'); }
      },
      {
        id: 'stringsGalleryUnlocked', label: 'Gallery Unlocked', category: 'gameplay',
        description: 'Mark gallery/recollection room as fully available',
        detect: function(c) { return /gallery/i.test(c); },
        apply: function(c) {
          var out = c.replace(/(<string\s+name="gallery_locked">)(.*?)(<\/string>)/gi, '$1Gallery \u2014 All Content Available$3');
          out = out.replace(/(<string\s+name="gallery_unlock">)(.*?)(<\/string>)/gi, '$1Gallery (Available)$3');
          return out;
        }
      },
      {
        id: 'stringsFullSave', label: 'Full Save Files', category: 'gameplay',
        description: 'Show all save slots as complete',
        detect: function(c) { return /save_slot/i.test(c); },
        apply: function(c) { return c.replace(/(<string\s+name="save_slot_\d+">)(.*?)(<\/string>)/gi, '$1Complete$3'); }
      },
      {
        id: 'stringsRemoveAdText', label: 'Remove Ad/Sponsored Text', category: 'ads',
        description: 'Clear ad labels and sponsored text',
        detect: function(c) { return /ad_text|ad_label|sponsor/i.test(c); },
        apply: function(c) {
          var out = c.replace(/(<string\s+name="ad_text">)(.*?)(<\/string>)/gi, '$1$3');
          out = out.replace(/(<string\s+name="ad_label">)(.*?)(<\/string>)/gi, '$1$3');
          out = out.replace(/(<string\s+name="[^"]*sponsor[^"]*">)(.*?)(<\/string>)/gi, '$1$3');
          return out;
        }
      },
      {
        id: 'stringsProSearches', label: '300 Pro Searches', category: 'limits',
        description: 'Set daily search limit to 300',
        detect: function(c) { return /search.*remaining|daily.*search/i.test(c); },
        apply: function(c) { return c.replace(/(<string\s+name="[^"]*search[^"]*remaining[^"]*">)(.*?)(<\/string>)/gi, '$1Unlimited Searches Remaining$3'); }
      },
      {
        id: 'stringsDeepResearchPro', label: 'Deep Research Pro Unlocked', category: 'premium',
        description: 'Activate deep research feature',
        detect: function(c) { return /deep.*research/i.test(c); },
        apply: function(c) { return c.replace(/(<string\s+name="[^"]*deep_research[^"]*">)(.*?)(<\/string>)/gi, '$1Research Active$3'); }
      },
      {
        id: 'stringsVoiceMode', label: 'Voice Mode Enabled', category: 'premium',
        description: 'Activate voice mode feature',
        detect: function(c) { return /voice.*mode/i.test(c); },
        apply: function(c) { return c.replace(/(<string\s+name="[^"]*voice[^"]*">)(.*?)(<\/string>)/gi, '$1Voice Mode Enabled$3'); }
      },
      {
        id: 'stringsImageGen', label: 'Set Image Generation Status', category: 'branding',
        description: 'Mark image generation status',
        detect: function(c) { return /image.*gen/i.test(c); },
        apply: function(c) { return c.replace(/(<string\s+name="[^"]*image_gen[^"]*">)(.*?)(<\/string>)/gi, '$1Image Generation Enabled$3'); }
      },
      {
        id: 'stringsAllAIModels', label: 'Set AI Models Label', category: 'branding',
        description: 'Customize AI models display label',
        detect: function(c) { return /ai.*model/i.test(c); },
        apply: function(c) { return c.replace(/(<string\s+name="[^"]*ai_model[^"]*">)(.*?)(<\/string>)/gi, '$1All Models Available$3'); }
      },
      {
        id: 'stringsFileUploads', label: 'Set File Upload Status', category: 'branding',
        description: 'Set file upload label text',
        detect: function(c) { return /file.*upload/i.test(c); },
        apply: function(c) { return c.replace(/(<string\s+name="[^"]*file_upload[^"]*">)(.*?)(<\/string>)/gi, '$1Upload & Analyze \u2014 Enabled$3'); }
      },
    ]
  },

  colors: {
    key: 'colors',
    label: 'values/colors.xml',
    placeholder: '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="colorPrimary">#FF6200EE</color>\n    <color name="colorPrimaryDark">#FF3700B3</color>\n    <color name="colorAccent">#FF03DAC5</color>\n    <color name="colorBackground">#FFFFFFFF</color>\n    <color name="colorText">#FF000000</color>\n    <color name="white">#FFFFFFFF</color>\n    <color name="black">#FF000000</color>\n</resources>',
    transforms: [
      { id: 'colorsChangePrimary', label: 'Change Primary Color', category: 'colors', hasColor: true, colorDefault: '#00FF88',
        description: 'Replace the app primary color',
        detect: function(c) { return /colorPrimary[^D]/i.test(c); },
        apply: function(c, val) { return c.replace(/(<color\s+name="colorPrimary">)(.*?)(<\/color>)/gi, '$1' + (val || '#00FF88') + '$3'); } },
      { id: 'colorsChangePrimaryDark', label: 'Change Primary Dark', category: 'colors', hasColor: true, colorDefault: '#00CC66',
        description: 'Replace the dark variant of primary color',
        detect: function(c) { return /colorPrimaryDark/i.test(c); },
        apply: function(c, val) { return c.replace(/(<color\s+name="colorPrimaryDark">)(.*?)(<\/color>)/gi, '$1' + (val || '#00CC66') + '$3'); } },
      { id: 'colorsChangeAccent', label: 'Change Accent Color', category: 'colors', hasColor: true, colorDefault: '#FF6B6B',
        description: 'Replace the accent/highlight color',
        detect: function(c) { return /colorAccent/i.test(c); },
        apply: function(c, val) { return c.replace(/(<color\s+name="colorAccent">)(.*?)(<\/color>)/gi, '$1' + (val || '#FF6B6B') + '$3'); } },
      { id: 'colorsChangeBackground', label: 'Change Background Color', category: 'colors', hasColor: true, colorDefault: '#1A1A2E',
        description: 'Replace the background color',
        detect: function(c) { return /colorBackground/i.test(c); },
        apply: function(c, val) { return c.replace(/(<color\s+name="colorBackground">)(.*?)(<\/color>)/gi, '$1' + (val || '#1A1A2E') + '$3'); } },
    ]
  },

  smali: {
    key: 'smali',
    label: 'Smali File',
    placeholder: '.class public Lcom/app/MainActivity;\n.super Landroid/app/Activity;\n\n.field private coins:I\n.field private gems:I\n.field private orbs:I\n.field private isPremium:Z\n.field private isPro:Z\n.field private hasAds:Z\n.field private isRooted:Z\n.field private cooldownMs:J\n.field private damageMultiplier:F\n.field private searchLimit:I\n\n.method public isPremium()Z\n    .locals 2\n    invoke-virtual {p0}, Lcom/app/MainActivity;->getLicense()Ljava/lang/String;\n    move-result-object v0\n    const-string v1, "premium"\n    invoke-virtual {v0, v1}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z\n    move-result v0\n    return v0\n.end method\n\n.method public isPro()Z\n    .locals 1\n    iget-boolean v0, p0, Lcom/app/MainActivity;->isPro:Z\n    return v0\n.end method\n\n.method public hasAds()Z\n    .locals 1\n    invoke-virtual {p0}, Lcom/app/MainActivity;->loadAdConfig()Z\n    move-result v0\n    return v0\n.end method\n\n.method public isRooted()Z\n    .locals 1\n    invoke-static {}, Lcom/app/Security;->checkRoot()Z\n    move-result v0\n    return v0\n.end method\n\n.method public getCoins()I\n    .locals 1\n    iget v0, p0, Lcom/app/MainActivity;->coins:I\n    return v0\n.end method\n\n.method public getGems()I\n    .locals 1\n    iget v0, p0, Lcom/app/MainActivity;->gems:I\n    return v0\n.end method\n\n.method public getOrbs()I\n    .locals 1\n    iget v0, p0, Lcom/app/MainActivity;->orbs:I\n    return v0\n.end method\n\n.method public getCooldownMs()J\n    .locals 2\n    iget-wide v0, p0, Lcom/app/MainActivity;->cooldownMs:J\n    return-wide v0\n.end method\n\n.method public getDamageMultiplier()F\n    .locals 1\n    iget v0, p0, Lcom/app/MainActivity;->damageMultiplier:F\n    return v0\n.end method\n\n.method public getSearchLimit()I\n    .locals 1\n    iget v0, p0, Lcom/app/MainActivity;->searchLimit:I\n    return v0\n.end method\n\n.method public isFeatureUnlocked()Z\n    .locals 1\n    invoke-virtual {p0}, Lcom/app/MainActivity;->checkSubscription()Z\n    move-result v0\n    return v0\n.end method\n\n.method public checkScreenshotRestriction()V\n    .locals 2\n    invoke-virtual {p0}, Lcom/app/MainActivity;->getWindow()Landroid/view/Window;\n    move-result-object v0\n    const/16 v1, 0x2000\n    invoke-virtual {v0, v1}, Landroid/view/Window;->addFlags(I)V\n    return-void\n.end method',
    transforms: [
      { id: 'smaliForceTrue', label: 'Force Return True', category: 'boolean',
        description: 'Make boolean method always return true (1)',
        detect: function(c) { return /\.method\s+public\s+\w+\(\)Z/i.test(c); },
        apply: function(c) { return c.replace(/(\.method\s+public\s+\w+\(\)Z\s*\n\s*\.locals\s+\d+\s*\n)[\s\S]*?(\s*return\s+v\d+\s*\n\s*\.end\s+method)/g, '$1\n    const/4 v0, 0x1\n$2'); } },
      { id: 'smaliForceFalse', label: 'Force Return False', category: 'boolean',
        description: 'Make boolean method always return false (0)',
        detect: function(c) { return /\.method\s+public\s+\w+\(\)Z/i.test(c); },
        apply: function(c) { return c.replace(/(\.method\s+public\s+\w+\(\)Z\s*\n\s*\.locals\s+\d+\s*\n)[\s\S]*?(\s*return\s+v\d+\s*\n\s*\.end\s+method)/g, '$1\n    const/4 v0, 0x0\n$2'); } },
      { id: 'smaliForceReturnVoid', label: 'Force Return Void', category: 'boolean',
        description: 'Skip all method logic with return-void',
        detect: function(c) { return /\.method\s+public\s+\w+\(/i.test(c); },
        apply: function(c) { return c.replace(/(\.method\s+public\s+\w+\([^)]*\)[A-Z]\s*\n\s*\.locals\s+\d+\s*\n)[\s\S]*?(\s*\.end\s+method)/g, '$1\n    return-void\n$2'); } },
      { id: 'smaliForcePremium', label: 'VIP & Premium Unlocked', category: 'premium',
        description: 'Override isPremium() to always return true',
        detect: function(c) { return /isPremium/i.test(c); },
        apply: function(c) { return c.replace(/(\.method\s+public\s+isPremium\(\)Z\s*\n\s*\.locals\s+\d+\s*\n)[\s\S]*?(\s*return\s+v\d+\s*\n\s*\.end\s+method)/g, '$1\n    const/4 v0, 0x1\n$2'); } },
      { id: 'smaliForcePro', label: 'Pro Version Unlocked', category: 'premium',
        description: 'Override isPro() to always return true',
        detect: function(c) { return /isPro/i.test(c); },
        apply: function(c) { return c.replace(/(\.method\s+public\s+isPro\(\)Z\s*\n\s*\.locals\s+\d+\s*\n)[\s\S]*?(\s*return\s+v\d+\s*\n\s*\.end\s+method)/g, '$1\n    const/4 v0, 0x1\n$2'); } },
      { id: 'smaliForceFeatureUnlock', label: 'All Features Unlocked', category: 'premium',
        description: 'Override isFeatureUnlocked() to always return true',
        detect: function(c) { return /isFeatureUnlocked|checkSubscription/i.test(c); },
        apply: function(c) { return c.replace(/(\.method\s+public\s+isFeatureUnlocked\(\)Z\s*\n\s*\.locals\s+\d+\s*\n)[\s\S]*?(\s*return\s+v\d+\s*\n\s*\.end\s+method)/g, '$1\n    const/4 v0, 0x1\n$2'); } },
      { id: 'smaliForceAdFree', label: 'Disable Ad Flag', category: 'ads',
        description: 'Override hasAds() to return false',
        detect: function(c) { return /hasAds/i.test(c); },
        apply: function(c) { return c.replace(/(\.method\s+public\s+hasAds\(\)Z\s*\n\s*\.locals\s+\d+\s*\n)[\s\S]*?(\s*return\s+v\d+\s*\n\s*\.end\s+method)/g, '$1\n    const/4 v0, 0x0\n$2'); } },
      { id: 'smaliBypassRoot', label: 'Bypass Root Detection', category: 'cleanup',
        description: 'Override isRooted() to always return false',
        detect: function(c) { return /isRooted|checkRoot/i.test(c); },
        apply: function(c) { return c.replace(/(\.method\s+public\s+isRooted\(\)Z\s*\n\s*\.locals\s+\d+\s*\n)[\s\S]*?(\s*return\s+v\d+\s*\n\s*\.end\s+method)/g, '$1\n    const/4 v0, 0x0\n$2'); } },
      { id: 'smaliRemoveScreenshotRestriction', label: 'Remove Screenshot Restriction', category: 'cleanup',
        description: 'Clear FLAG_SECURE to allow screenshots/recording',
        detect: function(c) { return /checkScreenshotRestriction|FLAG_SECURE|addFlags.*0x2000/i.test(c); },
        apply: function(c) { return c.replace(/(\.method\s+public\s+checkScreenshotRestriction\(\)V\s*\n\s*\.locals\s+\d+\s*\n)[\s\S]*?(\s*\.end\s+method)/g, '$1\n    return-void\n$2'); } },
      { id: 'smaliSetIntegerHigh', label: 'Set Integer to 999999', category: 'resources',
        description: 'Replace integer field return with 999999',
        detect: function(c) { return /iget\s+v\d+/i.test(c); },
        apply: function(c) { return c.replace(/(\.method\s+public\s+\w+\(\)I\s*\n\s*\.locals\s+\d+\s*\n\s*)(iget\s+v\d+,\s*\w+,\s*[^;]+;->\w+:I\s*\n\s*return\s+v\d+)/g, '$1const v0, 0xF423F\n    return v0'); } },
      { id: 'smaliSetCoins999', label: 'Unlimited Coins', category: 'resources',
        description: 'Override getCoins() to return 9,999,999',
        detect: function(c) { return /getCoins/i.test(c); },
        apply: function(c) { return c.replace(/(\.method\s+public\s+getCoins\(\)I\s*\n\s*\.locals\s+\d+\s*\n)[\s\S]*?(\s*return\s+v\d+\s*\n\s*\.end\s+method)/g, '$1\n    const v0, 0x98967F\n$2'); } },
      { id: 'smaliSetGems999', label: 'Unlimited Gems', category: 'resources',
        description: 'Override getGems() to return 9,999,999',
        detect: function(c) { return /getGems/i.test(c); },
        apply: function(c) { return c.replace(/(\.method\s+public\s+getGems\(\)I\s*\n\s*\.locals\s+\d+\s*\n)[\s\S]*?(\s*return\s+v\d+\s*\n\s*\.end\s+method)/g, '$1\n    const v0, 0x98967F\n$2'); } },
      { id: 'smaliSetOrbsInfinite', label: 'Infinite Orbs', category: 'resources',
        description: 'Override getOrbs() to return 9,999,999',
        detect: function(c) { return /getOrbs/i.test(c); },
        apply: function(c) { return c.replace(/(\.method\s+public\s+getOrbs\(\)I\s*\n\s*\.locals\s+\d+\s*\n)[\s\S]*?(\s*return\s+v\d+\s*\n\s*\.end\s+method)/g, '$1\n    const v0, 0x98967F\n$2'); } },
      { id: 'smaliSetCustomValue', label: 'Set Custom Resource Value', category: 'resources',
        description: 'Override any integer resource getter with a custom number',
        hasInput: true, inputPlaceholder: '999999',
        detect: function(c) { return /iget\s+v\d+.*(coins|gems|orbs|points|lives|score|gold)/i.test(c); },
        apply: function(c, val) {
          var num = parseInt(val) || 999999;
          var hex = '0x' + num.toString(16).toUpperCase();
          return c.replace(/(\.method\s+public\s+get(?:Coins|Gems|Orbs|Points|Lives|Score|Gold|Diamonds|Tokens|Credits|Stars)\(\)I\s*\n\s*\.locals\s+\d+\s*\n)[\s\S]*?(\s*return\s+v\d+\s*\n\s*\.end\s+method)/g, '$1\n    const v0, ' + hex + '\n$2');
        }
      },
      { id: 'smaliNoCooldown', label: 'No Cooldown Timer', category: 'gameplay',
        description: 'Set cooldownMs to 0 for instant reuse',
        detect: function(c) { return /cooldown|Cooldown/i.test(c); },
        apply: function(c) { return c.replace(/(\.method\s+public\s+getCooldownMs\(\)J\s*\n\s*\.locals\s+\d+\s*\n)[\s\S]*?(\s*return-wide\s+v\d+\s*\n\s*\.end\s+method)/g, '$1\n    const-wide v0, 0x0\n$2'); } },
      { id: 'smaliDamageMultiplier', label: '100x Damage Multiplier', category: 'gameplay',
        description: 'Override getDamageMultiplier() to return 100x',
        hasInput: true, inputPlaceholder: '100.0',
        detect: function(c) { return /damageMultiplier|getDamage/i.test(c); },
        apply: function(c, val) {
          var num = parseFloat(val) || 100;
          return c.replace(/(\.method\s+public\s+getDamageMultiplier\(\)F\s*\n\s*\.locals\s+\d+\s*\n)[\s\S]*?(\s*return\s+v\d+\s*\n\s*\.end\s+method)/g, '$1\n    const/high16 v0, 0x' + num.toString(16).toUpperCase() + '\n$2');
        }
      },
      { id: 'smaliSearchLimit300', label: '300 Daily Searches', category: 'limits',
        description: 'Override getSearchLimit() to return 300',
        detect: function(c) { return /getSearchLimit|searchLimit/i.test(c); },
        apply: function(c) { return c.replace(/(\.method\s+public\s+getSearchLimit\(\)I\s*\n\s*\.locals\s+\d+\s*\n)[\s\S]*?(\s*return\s+v\d+\s*\n\s*\.end\s+method)/g, '$1\n    const v0, 0x12C\n$2'); } },
      { id: 'smaliBypassLogin', label: 'Bypass Login Check', category: 'cleanup',
        description: 'Make login-required check always succeed',
        detect: function(c) { return /checkLogin|isLoggedIn|requireLogin/i.test(c); },
        apply: function(c) { return c.replace(/(\.method\s+public\s+(?:checkLogin|isLoggedIn|requireLogin)\(\)Z\s*\n\s*\.locals\s+\d+\s*\n)[\s\S]*?(\s*return\s+v\d+\s*\n\s*\.end\s+method)/g, '$1\n    const/4 v0, 0x1\n$2'); } },
    ]
  },
};

// LCS-based diff engine
export function computeDiff(oldText, newText) {
  var oldLines = oldText.split('\n');
  var newLines = newText.split('\n');
  var m = oldLines.length, n = newLines.length;
  var dp = [];
  for (var di = 0; di <= m; di++) {
    dp[di] = [];
    for (var dj = 0; dj <= n; dj++) {
      dp[di][dj] = 0;
    }
  }
  for (var i = 1; i <= m; i++)
    for (var j = 1; j <= n; j++)
      dp[i][j] = oldLines[i-1] === newLines[j-1] ? dp[i-1][j-1]+1 : Math.max(dp[i-1][j], dp[i][j-1]);
  var result = [];
  var ri = m, rj = n;
  while (ri > 0 || rj > 0) {
    if (ri > 0 && rj > 0 && oldLines[ri-1] === newLines[rj-1]) {
      result.unshift({ type:'same', text:oldLines[ri-1], oldLine:ri, newLine:rj }); ri--; rj--;
    } else if (rj > 0 && (ri === 0 || dp[ri][rj-1] >= dp[ri-1][rj])) {
      result.unshift({ type:'added', text:newLines[rj-1], newLine:rj }); rj--;
    } else {
      result.unshift({ type:'removed', text:oldLines[ri-1], oldLine:ri }); ri--;
    }
  }
  return result;
}

export function getTotalModCount() {
  var sum = 0;
  var keys = Object.keys(FILE_TYPES);
  for (var i = 0; i < keys.length; i++) {
    sum += FILE_TYPES[keys[i]].transforms.length;
  }
  return sum;
}

export var CATEGORY_NAMES = {
  ads: 'Ads & Monetization',
  privacy: 'Privacy & Permissions',
  trackers: 'Trackers & Analytics',
  features: 'Features & Settings',
  branding: 'Branding',
  resources: 'Currency & Resources',
  gameplay: 'Gameplay Values',
  premium: 'Premium & VIP Flags',
  limits: 'Cooldowns & Limits',
  configuration: 'Configuration',
  behavior: 'Behavior Changes',
  cleanup: 'Cleanup & Optimization',
  boolean: 'Boolean Toggles',
};
