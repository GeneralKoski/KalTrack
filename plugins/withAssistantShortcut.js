const {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
  withStringsXml,
} = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Scorciatoia "Parla con KalTrack" sull'icona dell'app.
 *
 * Tenendo premuta l'icona sulla home compare una voce che apre direttamente
 * l'assistente in ascolto, senza passare per la schermata di oggi. È il modo
 * in cui questa app arriva più vicina a un assistente di sistema restando
 * un'app normale: l'invocazione parte dal launcher, un gesto solo.
 *
 * NON è l'assistente predefinito di Android (ACTION_ASSIST). Quello richiede
 * di gestire un intent che non porta dati, e senza codice nativo l'app non
 * saprebbe di essere stata aperta così: si aprirebbe sulla home invece che in
 * ascolto, che è peggio del non esserci. Se un giorno servirà, la strada è un
 * modulo nativo che legga l'intent di partenza.
 *
 * Il file XML va scritto a mano perché `android/` viene rigenerato a ogni
 * prebuild: un file messo lì e basta sparirebbe al primo rebuild.
 */

const SHORTCUTS_XML = `<?xml version="1.0" encoding="utf-8"?>
<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">
  <shortcut
    android:shortcutId="assistant"
    android:enabled="true"
    android:icon="@mipmap/ic_launcher"
    android:shortcutShortLabel="@string/shortcut_assistant_short"
    android:shortcutLongLabel="@string/shortcut_assistant_long">
    <intent
      android:action="android.intent.action.VIEW"
      android:data="kaltrack://assistente"
      android:targetPackage="PACKAGE_NAME"
      android:targetClass="PACKAGE_NAME.MainActivity" />
    <categories android:name="android.shortcut.conversation" />
  </shortcut>
</shortcuts>
`;

const withShortcutXml = (config) =>
  withDangerousMod(config, [
    "android",
    async (cfg) => {
      const packageName = cfg.android?.package;
      if (!packageName) {
        throw new Error(
          "withAssistantShortcut: manca android.package in app.json",
        );
      }

      const resDir = path.join(
        cfg.modRequest.platformProjectRoot,
        "app/src/main/res",
      );
      fs.mkdirSync(path.join(resDir, "xml"), { recursive: true });
      fs.writeFileSync(
        path.join(resDir, "xml/shortcuts.xml"),
        SHORTCUTS_XML.replaceAll("PACKAGE_NAME", packageName),
        "utf8",
      );
      return cfg;
    },
  ]);

/** Le etichette stanno in strings.xml perché shortcuts.xml vuole risorse. */
const withShortcutStrings = (config) =>
  withStringsXml(config, (cfg) => {
    cfg.modResults = AndroidConfig.Strings.setStringItem(
      [
        {
          $: { name: "shortcut_assistant_short", translatable: "false" },
          _: "Parla",
        },
        {
          $: { name: "shortcut_assistant_long", translatable: "false" },
          _: "Parla con KalTrack",
        },
      ],
      cfg.modResults,
    );
    return cfg;
  });

/** Il meta-data è come l'activity dichiara di avere scorciatoie statiche. */
const withShortcutMetaData = (config) =>
  withAndroidManifest(config, (cfg) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(
      cfg.modResults,
    );
    activity["meta-data"] = (activity["meta-data"] ?? []).filter(
      (item) => item.$?.["android:name"] !== "android.app.shortcuts",
    );
    activity["meta-data"].push({
      $: {
        "android:name": "android.app.shortcuts",
        "android:resource": "@xml/shortcuts",
      },
    });
    return cfg;
  });

module.exports = (config) =>
  withShortcutMetaData(withShortcutStrings(withShortcutXml(config)));
