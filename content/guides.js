// content/guides.js - All APK modding guide content
// Merged tabs: 'guides' combines Quick Start + Quick Guides + Detailed Guides
// 'modding' combines Client-Side + Server-Side
const GUIDES = {
  guides: [
    // From quickStart
    {
      id: 'qs-overview',
      title: 'What is APK Modding?',
      difficulty: 'beginner',
      content: `An APK (Android Package Kit) is the file format Android uses to distribute and install apps. Modding an APK means **decompiling** the app, **editing** its code or resources, then **rebuilding** it into a working APK.

### Why Mod APKs?
- **Customization**: Change themes, icons, layouts, and UI elements
- **Remove annoyances**: Strip ads, disable analytics, remove permissions
- **Add features**: Inject new functionality or enable hidden features
- **Learning**: Understand how Android apps work under the hood

### The Modding Pipeline
\`\`\`
Original APK → Decompile → Edit → Recompile → Sign → Install
     .apk        smali/    code/    .apk        .apk    Device
                 xml/img  resources
\`\`\`

> **Legal Note**: Modding apps you own for personal use is generally fine. Distributing modified APKs of apps you don't own may violate copyright laws and terms of service.`
    },
    {
      id: 'qs-tools',
      title: 'Essential Tools You Need',
      difficulty: 'beginner',
      content: `Here are the must-have tools for APK modding:

### Desktop Tools (Recommended)
| Tool | Purpose | Platform |
|------|---------|----------|
| **APKTool** | Decompile & recompile APKs | Windows/Mac/Linux |
| **jadx** | Decompile to readable Java | Windows/Mac/Linux |
| **jarsigner / apksigner** | Sign APK files | All (Java required) |
| **zipalign** | Optimize APK alignment | Android SDK |
| **Android Studio** | Full IDE + emulator | Windows/Mac/Linux |

### Android Tools (On-Device)
| Tool | Purpose |
|------|---------|
| **MT Manager** | Edit APKs on Android |
| **NP Manager** | Alternative APK editor |
| **Termux** | Linux terminal on Android |
| **Lucky Patcher** | Quick patches (no source) |

### Setup Checklist
1. Install **Java JDK 17+** (required for most tools)
2. Download **APKTool** from official GitHub
3. Get **jadx** for reading decompiled code
4. Have an **Android device or emulator** for testing`
    },

    // From quickGuides
    {
      id: 'qg-change-icon',
      title: 'Change App Icon',
      difficulty: 'beginner',
      content: `### Quick Steps
1. Decompile APK with APKTool
2. Find icon files in \`res/mipmap-*/\`
3. Replace with your icon (same size and name)
4. Recompile and sign

### Icon Sizes Required
\`\`\`
mipmap-mdpi    - 48x48
mipmap-hdpi    - 72x72
mipmap-xhdpi   - 96x96
mipmap-xxhdpi  - 144x144
mipmap-xxxhdpi - 192x192
\`\`\`

> **Tip**: Use Android Studio's Image Asset Generator to create all sizes from one image.`
    },
    {
      id: 'qg-change-name',
      title: 'Change App Name',
      difficulty: 'beginner',
      content: `### Quick Steps
1. Open \`res/values/strings.xml\`
2. Find: \`<string name="app_name">Old Name</string>\`
3. Change to: \`<string name="app_name">New Name</string>\`
4. Recompile and sign

### Also Check
- \`AndroidManifest.xml\` - the \`android:label\` attribute
- Other locale files in \`res/values-*/strings.xml\``
    },
    {
      id: 'qg-remove-ads',
      title: 'Remove Ads (Basic)',
      difficulty: 'intermediate',
      content: `### Method 1: Remove Ad Activities from Manifest
\`\`\`xml
<!-- Remove or comment out ad-related activities -->
<!-- <activity android:name="com.google.android.gms.ads.AdActivity" ... /> -->
\`\`\`

### Method 2: Edit Layouts
Find and remove ad container views in layout XML files:
\`\`\`xml
<!-- Remove or set visibility to gone -->
<com.google.android.gms.ads.AdView
    android:id="@+id/adView"
    android:visibility="gone"
    ... />
\`\`\`

### Method 3: Modify Ad SDK Calls
Search smali for ad loading methods and replace with no-ops:
\`\`\`smali
# Find: invoke-virtual {v0}, Lcom/google/android/gms/ads/InterstitialAd;->loadAd(...)
# Replace body with: return-void
\`\`\`

> **Note**: Some apps check if ads loaded before showing content. You may need to bypass ad-loaded checks too.`
    },
    {
      id: 'qg-enable-backup',
      title: 'Enable App Backup',
      difficulty: 'beginner',
      content: `### Quick Steps
1. Open \`AndroidManifest.xml\`
2. Find the \`<application>\` tag
3. Set: \`android:allowBackup="true"\`
4. Add: \`android:fullBackupContent="true"\` if missing
5. Recompile and sign

### Before
\`\`\`xml
<application android:allowBackup="false" ...>
\`\`\`

### After
\`\`\`xml
<application android:allowBackup="true" android:fullBackupContent="true" ...>
\`\`\`

This lets you backup app data with ADB:
\`\`\`bash
adb backup -apk com.target.app
\`\`\``
    },
    {
      id: 'qg-change-version',
      title: 'Change Version Info',
      difficulty: 'beginner',
      content: `### Edit apktool.yml
File: \`apktool.yml\`
\`\`\`yaml
versionInfo:
  versionCode: '100'
  versionName: '10.0.0'
\`\`\`

### Or Edit AndroidManifest.xml
\`\`\`xml
<manifest
    android:versionCode="100"
    android:versionName="10.0.0"
    ...>
\`\`\`

### Why Change Versions?
- Install over existing app (same signature needed)
- Bypass version-check prompts
- Match server-expected versions`
    },

    // From detailedGuides
    {
      id: 'dg-full-workflow',
      title: 'Complete Modding Workflow',
      difficulty: 'intermediate',
      content: `## The Full Pipeline: Start to Finish

### Step 1: Get the APK
\`\`\`bash
# From device
adb shell pm path com.target.app
adb pull /data/app/com.target.app-1/base.apk target.apk

# Or download from APK mirror sites
\`\`\`

### Step 2: Decompile
\`\`\`bash
apktool d target.apk -o target_mod
\`\`\`

### Step 3: Analyze with jadx
\`\`\`bash
jadx-gui target.apk
\`\`\`
Browse the Java source to understand app structure.

### Step 4: Make Modifications
- Edit smali files for code changes
- Edit XML files for resource changes
- Replace images in drawable/mipmap folders
- Modify AndroidManifest.xml for permissions

### Step 5: Recompile
\`\`\`bash
apktool b target_mod -o target_mod.apk
\`\`\`

### Step 6: Sign
\`\`\`bash
# Generate keystore (first time only)
keytool -genkey -v -keystore my-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias mykey

# Sign with apksigner
apksigner sign --ks my-key.jks --ks-pass pass:mypassword target_mod.apk

# Or with jarsigner (older method)
jarsigner -verbose -sigalg SHA1withRSA -digestalg SHA1 -keystore my-key.jks target_mod.apk mykey
\`\`\`

### Step 7: Align
\`\`\`bash
zipalign -v 4 target_mod.apk target_final.apk
\`\`\`

### Step 8: Install
\`\`\`bash
adb install target_final.apk

# Or force install over existing
adb install -r target_final.apk
\`\`\`

### Step 9: Test
- Open the app and verify your changes
- Check logcat for errors: \`adb logcat | grep "com.target"\`
- If crash, read the stacktrace and fix smali errors`
    },
    {
      id: 'dg-error-fix',
      title: 'Fixing Common Errors',
      difficulty: 'intermediate',
      content: `## Common Build Errors and Fixes

### Error: "Could not decode arsc file"
\`\`\`bash
# Fix: Use latest APKTool
apktool --version
# Update from GitHub if below 2.7.0

# Or try with framework
apktool d target.apk -o target_mod -f
\`\`\`

### Error: "brut.androlib.AndrolibException"
This usually means resource processing failed.
\`\`\`bash
# Try adding -r flag (no resource decode)
apktool d target.apk -o target_mod -r

# Then edit smali only, recompile
apktool b target_mod -o output.apk
\`\`\`

### Error: "INSTALL_PARSE_FAILED_NO_CERTIFICATES"
APK is not signed.
\`\`\`bash
# Sign the APK
apksigner sign --ks my-key.jks output.apk
\`\`\`

### Error: "INSTALL_FAILED_UPDATE_INCOMPATIBLE"
Signature mismatch with installed version.
\`\`\`bash
# Uninstall first
adb uninstall com.target.app

# Then install
adb install output.apk
\`\`\`

### Error: Smali Compilation Error
Usually a syntax error in modified smali.
- Check line numbers in error message
- Verify register counts (.locals N)
- Ensure method signatures match
- Use jadx to verify original logic

### Error: App Crashes After Mod
\`\`\`bash
# Check logcat
adb logcat -d | grep -A 10 "FATAL EXCEPTION"
\`\`\`

# Common causes:
# 1. Modified method has wrong return type
# 2. Register overflow (increase .locals)
# 3. Removed code that other parts depend on
# 4. String encoding issues in XML
`
    },
    {
      id: 'dg-advanced-smali',
      title: 'Advanced Smali Techniques',
      difficulty: 'advanced',
      content: `## Advanced Smali Editing

### Method Hooking (Replacing Methods)
\`\`\`smali
# Original method calls a server check
.method public checkLicense()Z
    .locals 2

    # Instead of complex server logic, just return true
    const/4 v0, 0x1
    return v0
.end method
\`\`\`

### Adding New Methods
\`\`\`smali
# Add a helper method to a class
.method public getModVersion()Ljava/lang/String;
    .locals 1

    const-string v0, "v2.0-mod"
    return-object v0
.end method
\`\`\`

### Modifying Conditional Logic
\`\`\`smali
# Original: if (count > 0) { showContent(); }
# Change to: always show content

# Before:
if-lez v0, :skip
invoke-virtual {p0}, Lcom/app/Activity;->showContent()V
:skip

# After: (remove the condition, always execute)
invoke-virtual {p0}, Lcom/app/Activity;->showContent()V
\`\`\`

### Modifying Integer Values
\`\`\`smali
# Change coin count from loaded value to 999999
# Before:
invoke-virtual {v0}, Lcom/app/User;->getCoins()I
move-result v0

# After:
const v0, 0xF423F    # 999999 in hex
\`\`\`

### String Replacement
\`\`\`smali
# Change premium check string
# Before:
const-string v0, "basic"

# After:
const-string v0, "premium"
\`\`\``
    },
    {
      id: 'dg-signing',
      title: 'APK Signing Deep Dive',
      difficulty: 'intermediate',
      content: `## Understanding APK Signing

Android requires APKs to be signed. There are two main signing schemes.

### V1 Signing (JAR Signature)
\`\`\`bash
jarsigner -verbose -sigalg SHA1withRSA -digestalg SHA1 -keystore my-release.jks target.apk alias_name
\`\`\`

### V2 Signing (APK Signature Scheme)
\`\`\`bash
apksigner sign --ks my-release.jks --ks-pass pass:mypassword --key-pass pass:mypassword target.apk
\`\`\`

### Generate a Keystore
\`\`\`bash
keytool -genkeypair -keystore my-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias modding -storepass password123 -keypass password123 -dname "CN=Modder, O=Mod, C=US"
\`\`\`

### Verify Signature
\`\`\`bash
apksigner verify --verbose target.apk
\`\`\`

Expected output:
- Verified using v1 scheme (JAR signing): true
- Verified using v2 scheme (APK Signature Scheme v2): true
- Verified using v3 scheme (APK Signature Scheme v3): true

### Important Notes
- You **cannot** sign with the original developer's key
- Signed-but-different apps cannot update the original
- **Uninstall** the original before installing modded version
- Keep your keystore safe -- you need it to update your mod`
    }
  ],

  modding: [
    // From clientSide
    {
      id: 'cs-decompile',
      title: 'Decompiling APKs (Client-Side)',
      difficulty: 'beginner',
      content: `Decompilation extracts the APK contents into editable files. This is always done on your computer or device.

### Using APKTool (Command Line)
\`\`\`bash
# Basic decompile
apktool d myapp.apk -o myapp_mod

# With framework resources
apktool d myapp.apk -o myapp_mod -f
\`\`\`

### What You Get After Decompiling
\`\`\`
myapp_mod/
├── AndroidManifest.xml    # App permissions & components
├── res/                   # Resources (layouts, strings, images)
│   ├── layout/           # XML layout files
│   ├── values/           # Strings, colors, dimensions
│   ├── drawable/         # Images and shapes
│   └── xml/              # Config files
├── smali/                 # Decompiled bytecode (Dalvik)
├── smali_classes2/        # Multi-dex classes
├── assets/               # Raw asset files
├── lib/                  # Native .so libraries
└── apktool.yml           # APKTool metadata
\`\`\`

### Using MT Manager (Android)
1. Install MT Manager from Play Store or website
2. Open the APK file in MT Manager
3. Choose "View" to browse or "Edit" to modify
4. Use the built-in smali editor and resource viewer

### Using jadx (GUI)
\`\`\`bash
# Open APK in jadx GUI
jadx-gui myapp.apk
\`\`\`
jadx converts smali to readable Java. Use it to **understand** the code, then edit with APKTool.`
    },
    {
      id: 'cs-resources',
      title: 'Editing Resources',
      difficulty: 'beginner',
      content: `Resources are the easiest things to modify — layouts, strings, images, and colors.

### Editing Strings
File: \`res/values/strings.xml\`
\`\`\`xml
<!-- Before -->
<string name="app_name">Original App</string>

<!-- After -->
<string name="app_name">My Modded App</string>
\`\`\`

### Changing Colors
File: \`res/values/colors.xml\`
\`\`\`xml
<!-- Change primary color from blue to green -->
<color name="colorPrimary">#FF4CAF50</color>
<color name="colorPrimaryDark">#FF388E3C</color>
\`\`\`

### Replacing Images
1. Find the image in \`res/drawable/\` or \`res/mipmap/\`
2. Replace with same filename and dimensions
3. Supported formats: PNG, JPG, WebP, XML (vector)

### Editing Layouts
File: \`res/layout/activity_main.xml\`
\`\`\`xml
<!-- Change button text -->
<Button
    android:id="@+id/btn_start"
    android:layout_width="wrap_content"
    android:layout_height="wrap_content"
    android:text="MODDED Button"
    android:backgroundTint="#FF00FF00" />
\`\`\`

### Pro Tips
- Use **jadx** to understand what each resource does
- Keep backup copies of original files
- XML changes are case-sensitive
- Image replacements must match the original dimensions`
    },
    {
      id: 'cs-smali',
      title: 'Understanding Smali Code',
      difficulty: 'intermediate',
      content: `Smali is the human-readable format of Android's Dalvik bytecode. Think of it as Android assembly language.

### Smali Basics
\`\`\`smali
# Method declaration
.method public isPremium()Z
    .locals 1

    # Load 'this' reference
    invoke-virtual {p0}, Lcom/app/MyApp;->getLicense()Ljava/lang/String;
    move-result-object v0

    # Compare string
    const-string v1, "premium"
    invoke-virtual {v0, v1}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z
    move-result v0

    # Return boolean
    return v0
.end method
\`\`\`

### Common Smali Patterns
| Pattern | Meaning |
|---------|---------|
| \`const/4 v0, 0x1\` | Set v0 = true (1) |
| \`const/4 v0, 0x0\` | Set v0 = false (0) |
| \`return v0\` | Return the value |
| \`return-void\` | Return nothing |
| \`invoke-virtual\` | Call a method |
| \`move-result\` | Store return value |

### Quick Bool Toggle (Most Common Mod)
To make a method always return \`true\`:
\`\`\`smali
.method public isPremium()Z
    .locals 1
    const/4 v0, 0x1    # true
    return v0
.end method
\`\`\`

To make a method always return \`false\`:
\`\`\`smali
.method public isPremium()Z
    .locals 1
    const/4 v0, 0x0    # false
    return v0
.end method
\`\`\``
    },
    {
      id: 'cs-manifest',
      title: 'Editing AndroidManifest.xml',
      difficulty: 'intermediate',
      content: `The manifest controls permissions, activities, services, and app metadata.

### Remove Permissions
\`\`\`xml
<!-- Remove unwanted permissions -->
<!-- DELETE these lines: -->
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.READ_CONTACTS" />
\`\`\`

### Change App Properties
\`\`\`xml
<application
    android:allowBackup="true"
    android:debuggable="true"
    android:theme="@style/AppTheme"
    android:extractNativeLibs="true">
\`\`\`

### Common Manifest Mods
| Modification | What to Change |
|-------------|---------------|
| Enable backup | Set \`android:allowBackup="true"\` |
| Allow install on SD card | Add \`android:installLocation="preferExternal"\` |
| Disable app permissions | Remove \`<uses-permission>\` lines |
| Change package name | Change \`package\` attribute |
| Add debuggable flag | Set \`android:debuggable="true"\` |`
    },

    // From serverSide
    {
      id: 'ss-api',
      title: 'Intercepting API Calls',
      difficulty: 'advanced',
      content: `Server-side modding involves intercepting and modifying network requests between the app and its backend.

### Setup mitmproxy
\`\`\`bash
# Install mitmproxy
pip install mitmproxy

# Start proxy on port 8080
mitmproxy --listen-port 8080

# Or use the web interface
mitmweb --listen-port 8080
\`\`\`

### Configure Android Device
1. Set device proxy to your computer's IP:8080
2. Install mitmproxy CA certificate on device
3. Browse the app to capture traffic

### SSL Pinning Bypass
Many apps use SSL pinning. To bypass:
\`\`\`bash
# Using Frida
frida -U -f com.target.app -l ssl-pinning-bypass.js

# Using Objection
objection -g com.target.app explore
ssl pinning disable
\`\`\`

### API Modification Strategies
| Strategy | Use Case |
|----------|----------|
| **Response modification** | Change server data before app reads it |
| **Request modification** | Alter data sent to server |
| **Response replay** | Cache and replay successful responses |
| **Mock server** | Replace server entirely |

> **Warning**: Tampering with live server APIs may violate terms of service and could result in account bans.`
    },
    {
      id: 'ss-frida',
      title: 'Frida Dynamic Instrumentation',
      difficulty: 'advanced',
      content: `Frida lets you inject JavaScript into running Android apps to modify behavior in real-time.

### Install Frida
\`\`\`bash
# Install Frida tools
pip install frida-tools

# Push frida-server to device
adb push frida-server /data/local/tmp/
adb shell chmod 755 /data/local/tmp/frida-server
adb shell /data/local/tmp/frida-server &
\`\`\`

### Basic Frida Script
\`\`\`javascript
// hook-premium.js
Java.perform(function() {
    var MainActivity = Java.use("com.app.MainActivity");

    // Override isPremium to always return true
    MainActivity.isPremium.implementation = function() {
        console.log("[+] isPremium() called - returning true");
        return true;
    };
});
\`\`\`

### Run the Hook
\`\`\`bash
# Attach to running app
frida -U -l hook-premium.js com.target.app

# Spawn app with hook
frida -U -f com.target.app -l hook-premium.js --no-pause
\`\`\`

### Useful Frida Snippets
\`\`\`javascript
// Bypass root detection
Java.use("com.app.SecurityCheck").isRooted.implementation = function() {
    return false;
};

// Read SharedPreferences
var context = Java.use("android.app.ActivityThread")
    .currentApplication().getApplicationContext();
var prefs = context.getSharedPreferences("config", 0);
console.log("Premium: " + prefs.getBoolean("premium", false));
\`\`\`
`
    },
    {
      id: 'ss-repack',
      title: 'Repackaging with Server Redirect',
      difficulty: 'advanced',
      content: `Redirect an app to your own server for full backend control.

### Step 1: Find API Endpoints
\`\`\`bash
# Decompile and search for URLs
grep -r "https://api.example.com" smali/
grep -r "baseUrl" smali/
\`\`\`

### Step 2: Modify Base URL in Smali
\`\`\`smali
# Find the URL constant
const-string v0, "https://api.example.com"

# Replace with your server
const-string v0, "https://myserver.com/api"
\`\`\`

### Step 3: Set Up Mock Server
\`\`\`javascript
// Node.js mock server
const express = require('express');
const app = express();

app.post('/api/premium/verify', (req, res) => {
    res.json({
        status: "success",
        isPremium: true,
        expires: "2099-12-31"
    });
});

app.listen(3000, () => console.log('Mock server on :3000'));
\`\`\`

### Checklist
- [ ] Found all API endpoints in decompiled code
- [ ] Modified base URL or specific endpoints
- [ ] Set up mock server with all required endpoints
- [ ] Configured SSL/HTTPS properly
- [ ] Tested app with mock server
- [ ] Repackaged and signed the APK`
    }
  ],

  commands: [
    { cmd: 'apktool d app.apk -o output', desc: 'Decompile APK' },
    { cmd: 'apktool b output -o mod.apk', desc: 'Recompile APK' },
    { cmd: 'jadx-gui app.apk', desc: 'Open APK in jadx GUI' },
    { cmd: 'keytool -genkey -v -keystore key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias mykey', desc: 'Generate signing keystore' },
    { cmd: 'apksigner sign --ks key.jks mod.apk', desc: 'Sign APK with apksigner' },
    { cmd: 'jarsigner -verbose -sigalg SHA1withRSA -digestalg SHA1 -keystore key.jks mod.apk mykey', desc: 'Sign APK with jarsigner' },
    { cmd: 'zipalign -v 4 mod.apk final.apk', desc: 'Align APK for optimization' },
    { cmd: 'adb install final.apk', desc: 'Install APK to device' },
    { cmd: 'adb install -r final.apk', desc: 'Force install over existing app' },
    { cmd: 'adb uninstall com.app.name', desc: 'Uninstall app from device' },
    { cmd: 'adb shell pm path com.app.name', desc: 'Find APK path on device' },
    { cmd: 'adb pull /path/to/app.apk ./', desc: 'Pull APK from device' },
    { cmd: 'adb logcat | grep "com.app.name"', desc: 'View app logs' },
    { cmd: 'adb logcat -d | grep "FATAL"', desc: 'Check crash logs' },
    { cmd: 'apksigner verify --verbose app.apk', desc: 'Verify APK signature' },
    { cmd: 'grep -r "searchterm" smali/', desc: 'Search in smali code' },
    { cmd: 'frida -U -l hook.js com.app', desc: 'Run Frida hook on app' },
    { cmd: 'mitmweb --listen-port 8080', desc: 'Start mitmproxy web UI' },
    { cmd: 'aapt dump badging app.apk', desc: 'Dump APK info' },
    { cmd: 'aapt dump xmltree app.apk AndroidManifest.xml', desc: 'Dump manifest as tree' }
  ]
};

export default GUIDES;
