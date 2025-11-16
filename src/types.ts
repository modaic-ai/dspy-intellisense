// Shared types used across the extension
export type FieldKind = "input" | "output";

export interface FieldInfo {
  name: string;
  kind: FieldKind;
  annotation?: string | null;
  description?: string | null;
}

export interface SignatureInfo {
  name: string;
  inputs: FieldInfo[];
  outputs: FieldInfo[];
  docstring?: string | null;
}

export interface ModuleInfo {
  name: string; // e.g. "my_predict"
  signature: string; // e.g. "MySignature"
  line: number;
  column: number;
}

export interface PredictionInfo {
  name: string; // e.g. "result"
  signature: string; // e.g. "MySignature"
  line: number;
  column: number;
}

export interface IntrospectionResult {
  file: string;
  signatures: Record<string, SignatureInfo>;
  modules: Record<string, ModuleInfo>;
  predictions: Record<string, PredictionInfo>;
}
