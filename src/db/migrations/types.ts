export interface Migration {
  version: number;
  name: string;
  up: string;
}
