/**
 * Contratto di un tool dell'assistente.
 *
 * Il set di azioni è chiuso: aggiungerne una significa scrivere un tool qui
 * accanto, mai allargare i prompt. Le descrizioni e lo schema dei parametri
 * sono in INGLESE (i modelli seguono meglio le istruzioni in inglese), mentre
 * anteprime e messaggi di conferma sono in italiano perché li legge o li sente
 * l'utente.
 *
 * Deroga voluta a t("chiave"): le stringhe italiane del layer AI (anteprime,
 * messaggi, etichette delle schermate) sono letterali. L'assistente parla
 * italiano per costruzione - prompt, trascrizione e sintesi vocale sono tarati
 * su quella lingua - quindi passarle da i18n darebbe chiavi con una sola
 * traduzione. Se un giorno l'app diventa multilingua, si comincia da qui.
 */

export type ToolRiskLevel = "read" | "write" | "destructive";

/** Sottoinsieme di JSON Schema che i tool usano davvero. */
export type JsonSchema = {
  type: "object" | "array" | "string" | "number" | "integer" | "boolean";
  description?: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  enum?: readonly string[];
};

/** Anteprima leggibile in italiano di cosa sta per succedere. */
export interface ToolPreview {
  title: string;
  lines: string[];
}

/** Esito di un tool. `message` è in italiano: finisce nella conferma parlata. */
export interface ToolResult {
  message: string;
}

export interface AssistantTool<TArgs> {
  name: string;
  description: string;
  parameters: JsonSchema;
  riskLevel: ToolRiskLevel;
  /**
   * Restringe gli argomenti grezzi del modello. Il JSON Schema è un
   * suggerimento per il modello, non una garanzia: la validazione vera è qui.
   */
  parse: (raw: unknown) => TArgs;
  preview: (args: TArgs) => Promise<ToolPreview>;
  execute: (args: TArgs) => Promise<ToolResult>;
}

/**
 * Tool con gli argomenti erasi a `unknown`.
 *
 * Serve perché il registro tiene tool con argomenti diversi in un array solo e
 * il loop li invoca con quello che arriva dal modello: la conversione passa da
 * `defineTool`, che è l'unico punto in cui i due tipi si incontrano.
 */
export interface RegisteredTool {
  name: string;
  description: string;
  parameters: JsonSchema;
  riskLevel: ToolRiskLevel;
  preview: (raw: unknown) => Promise<ToolPreview>;
  execute: (raw: unknown) => Promise<ToolResult>;
}

export function defineTool<TArgs>(tool: AssistantTool<TArgs>): RegisteredTool {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    riskLevel: tool.riskLevel,
    preview: async (raw) => tool.preview(tool.parse(raw)),
    execute: async (raw) => tool.execute(tool.parse(raw)),
  };
}

/**
 * Una chiamata di tool decisa dal modello, con la sua anteprima.
 *
 * `executed` distingue i tool `read`, che il loop esegue subito perché non
 * cambiano nulla, dalle scritture che restano in attesa della conferma della
 * UI. `navigate` è un caso a parte: è innocuo, quindi risulta eseguito, ma la
 * navigazione vera la fa la UI leggendo l'intento.
 */
export interface ToolIntent {
  toolName: string;
  riskLevel: ToolRiskLevel;
  args: unknown;
  preview: ToolPreview;
  executed: boolean;
  result: ToolResult | null;
}
