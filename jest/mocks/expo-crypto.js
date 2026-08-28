// Mock di expo-crypto per i test su Node: il mock del preset jest-expo non
// espone randomUUID, che è l'unica funzione del modulo usata dall'app (src/db/ids.ts).
// Registrato via moduleNameMapper in jest.config.js.
module.exports = {
  randomUUID: () => crypto.randomUUID(),
  digestStringAsync: async (_algorithm, data) => String(data),
};
