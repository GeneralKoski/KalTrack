import { I18n } from "i18n-js";

import en from "./locales/en.json";
import it from "./locales/it.json";

// Italiano se il dispositivo lo parla, altrimenti inglese di default (vedi
// `translationStore`, che sceglie e persiste la lingua effettiva). L'inglese
// resta il fallback: una chiave mancante in it.json non lascia lo schermo
// vuoto.
export const i18n = new I18n({ it, en });

i18n.defaultLocale = "en";
i18n.locale = "en";
i18n.enableFallback = true;
