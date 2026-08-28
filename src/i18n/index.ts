import { I18n } from "i18n-js";

import en from "./locales/en.json";
import it from "./locales/it.json";

export const i18n = new I18n({ it, en });

// Italiano come fallback quando una chiave non esiste nella lingua corrente
i18n.defaultLocale = "it";
i18n.enableFallback = true;
