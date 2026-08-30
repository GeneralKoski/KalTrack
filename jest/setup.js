/**
 * Una chiave finta per i test dell'AI.
 *
 * Prima non serviva, e questo era il problema: `jest-expo` carica i file .env,
 * quindi i test leggevano la chiave VERA dal disco di chi li lanciava. Su un
 * clone pulito - o in CI - fallivano tutti, e sulla macchina di chi l'aveva
 * configurata passavano. Un test che dipende da un segreto locale non dice se
 * il codice funziona, dice chi lo sta eseguendo.
 *
 * I test che verificano il comportamento SENZA chiave continuano a valere:
 * mockano `hasGroqKey` per conto loro, e quel mock vince su questo.
 */
/*
 * Il require sta DENTRO l'hook, e non in cima al file.
 *
 * I setup girano prima che il file di test venga caricato, quindi prima che i
 * suoi `jest.mock` esistano: caricando lo store qui fuori si porterebbe dietro
 * l'expo-secure-store vero, e i test che lo mockano si troverebbero due moduli
 * diversi. Dentro il beforeEach il caricamento avviene a mock gia' registrati.
 */
beforeEach(() => {
  const { useAiKeyStore } = require("../src/stores/aiKeyStore");
  useAiKeyStore.setState({ key: "gsk_chiave-di-test", isHydrated: true });
});
