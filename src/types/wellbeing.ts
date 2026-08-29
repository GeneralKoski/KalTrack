/**
 * Le chiavi del benessere: siti delle misure e pose delle foto.
 *
 * Stanno qui e non nelle schermate che le mostrano perche' sono dati, non
 * presentazione: sono le stringhe scritte a database, e servono anche al test
 * che verifica di avere una traduzione per ognuna. Importare una schermata in
 * un test tirerebbe dentro i moduli nativi e non e' possibile.
 *
 * In italiano minuscolo: sono la chiave a DB, non un'etichetta. L'app e'
 * monolingua e le misure gia' registrate usano questa forma, quindi una chiave
 * inglese tradotta a video romperebbe la continuita' dello storico.
 */
export const MEASUREMENT_SITES = [
  "vita",
  "fianchi",
  "petto",
  "braccio",
  "coscia",
  "polpaccio",
  "collo",
] as const;

export const PHOTO_POSES = ["fronte", "lato", "retro"] as const;
