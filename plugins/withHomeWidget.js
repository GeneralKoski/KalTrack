const {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
  withStringsXml,
} = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Widget della home con le kcal rimaste e i passi di oggi.
 *
 * Il widget e' scritto in Kotlin e legge il database dell'app da se': un
 * widget vive in un processo senza runtime JavaScript, quindi non puo'
 * chiedere i numeri al codice dell'app. I sorgenti stanno in plugins/widget/
 * e vengono copiati a ogni prebuild, perche' android/ viene rigenerato e un
 * file messo li' a mano sparirebbe.
 *
 * Il segnaposto PACKAGE_NAME nel Kotlin viene sostituito qui: il package
 * dell'app vive in app.json ed e' quello a comandare, non una stringa
 * duplicata nel sorgente nativo.
 */

const SOURCE_DIR = path.join(__dirname, "widget");

/** I colori del widget: chiaro e scuro, come l'app. */
const COLORS_LIGHT = {
  kaltrack_widget_surface: "#FFFFFF",
  kaltrack_widget_text: "#0A0A0A",
  kaltrack_widget_muted: "#71717A",
};
const COLORS_DARK = {
  kaltrack_widget_surface: "#141414",
  kaltrack_widget_text: "#FAFAFA",
  kaltrack_widget_muted: "#A1A1AA",
};

const colorsXml = (colors) =>
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n${Object.entries(colors)
    .map(([name, value]) => `  <color name="${name}">${value}</color>`)
    .join("\n")}\n</resources>\n`;

const withWidgetSources = (config) =>
  withDangerousMod(config, [
    "android",
    async (cfg) => {
      const packageName = cfg.android?.package;
      if (!packageName) {
        throw new Error("withHomeWidget: manca android.package in app.json");
      }

      const root = cfg.modRequest.platformProjectRoot;
      const res = path.join(root, "app/src/main/res");
      const javaDir = path.join(
        root,
        "app/src/main/java",
        packageName.replace(/\./g, "/"),
      );

      for (const dir of [
        javaDir,
        path.join(res, "layout"),
        path.join(res, "drawable"),
        path.join(res, "xml"),
        path.join(res, "values"),
        path.join(res, "values-night"),
      ]) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const kotlin = fs
        .readFileSync(path.join(SOURCE_DIR, "KalTrackWidget.kt"), "utf8")
        .replaceAll("PACKAGE_NAME", packageName);
      fs.writeFileSync(path.join(javaDir, "KalTrackWidget.kt"), kotlin, "utf8");

      const copies = [
        ["kaltrack_widget.xml", "layout/kaltrack_widget.xml"],
        ["kaltrack_widget_bg.xml", "drawable/kaltrack_widget_bg.xml"],
        ["kaltrack_widget_info.xml", "xml/kaltrack_widget_info.xml"],
      ];
      for (const [from, to] of copies) {
        fs.copyFileSync(path.join(SOURCE_DIR, from), path.join(res, to));
      }

      fs.writeFileSync(
        path.join(res, "values/kaltrack_widget_colors.xml"),
        colorsXml(COLORS_LIGHT),
        "utf8",
      );
      fs.writeFileSync(
        path.join(res, "values-night/kaltrack_widget_colors.xml"),
        colorsXml(COLORS_DARK),
        "utf8",
      );

      return cfg;
    },
  ]);

const withWidgetStrings = (config) =>
  withStringsXml(config, (cfg) => {
    cfg.modResults = AndroidConfig.Strings.setStringItem(
      [
        {
          $: { name: "widget_description", translatable: "false" },
          _: "Calorie rimaste e passi di oggi",
        },
      ],
      cfg.modResults,
    );
    return cfg;
  });

/** Il receiver e' come il sistema sa che questo widget esiste. */
const withWidgetReceiver = (config) =>
  withAndroidManifest(config, (cfg) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(
      cfg.modResults,
    );
    application.receiver = (application.receiver ?? []).filter(
      (item) => item.$?.["android:name"] !== ".KalTrackWidget",
    );
    application.receiver.push({
      $: {
        "android:name": ".KalTrackWidget",
        "android:exported": "false",
      },
      "intent-filter": [
        {
          action: [
            { $: { "android:name": "android.appwidget.action.APPWIDGET_UPDATE" } },
            // Il cambio di data: a mezzanotte i totali di oggi ripartono.
            { $: { "android:name": "android.intent.action.DATE_CHANGED" } },
            { $: { "android:name": "android.intent.action.TIME_SET" } },
            { $: { "android:name": "android.intent.action.TIMEZONE_CHANGED" } },
          ],
        },
      ],
      "meta-data": [
        {
          $: {
            "android:name": "android.appwidget.provider",
            "android:resource": "@xml/kaltrack_widget_info",
          },
        },
      ],
    });
    return cfg;
  });

module.exports = (config) =>
  withWidgetReceiver(withWidgetStrings(withWidgetSources(config)));
