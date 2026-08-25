/** Deterministic, benchmark-only source interventions for correction ownership. */
import { createHash } from "node:crypto";
import ts from "typescript";

export type InterventionOperator =
  | "negate-condition"
  | "swap-binary-operator"
  | "flip-boolean"
  | "remove-negation";

export interface CausalIntervention {
  id: string;
  owner: string;
  operator: InterventionOperator;
  line: number;
  start: number;
  end: number;
  before: string;
  after: string;
  preferred_line_distance: number | null;
}

export interface InterventionReceipt {
  owner: string;
  admitted: boolean;
}

export interface InterventionAdjudication {
  owner: string | null;
  reason: "unique-behavioral-owner" | "no-behavioral-owner" | "ambiguous-behavioral-owners";
  admitted_owners: string[];
  infrastructure_levers: string[];
}

const BINARY_SWAPS = new Map<ts.SyntaxKind, string>([
  [ts.SyntaxKind.EqualsEqualsEqualsToken, "!=="],
  [ts.SyntaxKind.ExclamationEqualsEqualsToken, "==="],
  [ts.SyntaxKind.EqualsEqualsToken, "!="],
  [ts.SyntaxKind.ExclamationEqualsToken, "=="],
  [ts.SyntaxKind.GreaterThanToken, "<="],
  [ts.SyntaxKind.GreaterThanEqualsToken, "<"],
  [ts.SyntaxKind.LessThanToken, ">="],
  [ts.SyntaxKind.LessThanEqualsToken, ">"],
  [ts.SyntaxKind.AmpersandAmpersandToken, "||"],
  [ts.SyntaxKind.BarBarToken, "&&"],
  [ts.SyntaxKind.QuestionQuestionToken, "||"],
]);

function declarationName(statement: ts.Statement): string[] {
  if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
    return statement.name ? [statement.name.text] : [];
  }
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations.flatMap((declaration) =>
      ts.isIdentifier(declaration.name) ? [declaration.name.text] : []);
  }
  return [];
}

function lineOf(source: ts.SourceFile, offset: number): number {
  return source.getLineAndCharacterOfPosition(offset).line + 1;
}

function distanceTo(lines: number[], line: number): number | null {
  return lines.length ? Math.min(...lines.map((candidate) => Math.abs(candidate - line))) : null;
}

function mutationId(owner: string, operator: string, start: number, end: number, after: string): string {
  return createHash("sha256").update(`${owner}\0${operator}\0${start}\0${end}\0${after}`).digest("hex").slice(0, 16);
}

/** Enumerate small counterfactuals inside one top-level runtime declaration.
 * Preferred lines normally come from target-only V8 ranges and affect ordering
 * only; they never change which mutations are generated. */
export function enumerateCausalInterventions(
  path: string,
  content: string,
  owner: string,
  preferredLines: number[] = [],
  limit = 12,
): CausalIntervention[] {
  if (!Number.isSafeInteger(limit) || limit <= 0) return [];
  const symbol = owner.split("::").at(-1);
  if (!symbol) return [];
  const source = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const root = source.statements.find((statement) => declarationName(statement).includes(symbol));
  if (!root) return [];
  const mutations: CausalIntervention[] = [];
  const add = (node: ts.Node, operator: InterventionOperator, start: number, end: number, after: string): void => {
    const before = content.slice(start, end);
    if (!before || before === after) return;
    const line = lineOf(source, start);
    mutations.push({
      id: mutationId(owner, operator, start, end, after),
      owner,
      operator,
      line,
      start,
      end,
      before,
      after,
      preferred_line_distance: distanceTo(preferredLines, line),
    });
  };
  const visit = (node: ts.Node): void => {
    if (ts.isIfStatement(node) || ts.isConditionalExpression(node)) {
      const expression = ts.isIfStatement(node) ? node.expression : node.condition;
      add(expression, "negate-condition", expression.getStart(source), expression.getEnd(), `!(${expression.getText(source)})`);
    } else if (ts.isBinaryExpression(node)) {
      const replacement = BINARY_SWAPS.get(node.operatorToken.kind);
      if (replacement) add(node.operatorToken, "swap-binary-operator", node.operatorToken.getStart(source), node.operatorToken.getEnd(), replacement);
    } else if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword) {
      add(node, "flip-boolean", node.getStart(source), node.getEnd(), node.kind === ts.SyntaxKind.TrueKeyword ? "false" : "true");
    } else if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken) {
      add(node, "remove-negation", node.getStart(source), node.operand.getStart(source), "");
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  const operatorOrder: Record<InterventionOperator, number> = {
    "negate-condition": 0,
    "swap-binary-operator": 1,
    "remove-negation": 2,
    "flip-boolean": 3,
  };
  const unique = new Map(mutations.map((mutation) => [`${mutation.start}:${mutation.end}:${mutation.after}`, mutation]));
  return [...unique.values()].sort((a, b) =>
    (a.preferred_line_distance ?? Number.POSITIVE_INFINITY) - (b.preferred_line_distance ?? Number.POSITIVE_INFINITY)
    || operatorOrder[a.operator] - operatorOrder[b.operator]
    || a.start - b.start
    || a.id.localeCompare(b.id)).slice(0, limit);
}

export function applyCausalIntervention(content: string, intervention: CausalIntervention): string {
  if (content.slice(intervention.start, intervention.end) !== intervention.before) {
    throw new Error(`intervention ${intervention.id} no longer matches its frozen source span`);
  }
  return `${content.slice(0, intervention.start)}${intervention.after}${content.slice(intervention.end)}`;
}

function infrastructureLever(owner: string): boolean {
  const path = owner.split("::")[0] ?? "";
  return /(?:^|\/)(?:util|utils|helpers?|core)\.tsx?$/.test(path);
}

/** A broad initialization/helper lever can change behavior without owning its
 * correction. Admit only one unambiguous non-infrastructure owner; otherwise
 * abstain rather than convert causal influence into a location claim. */
export function adjudicateCausalInterventions(receipts: InterventionReceipt[]): InterventionAdjudication {
  const all = [...new Set(receipts.filter((receipt) => receipt.admitted).map((receipt) => receipt.owner))].sort();
  const infrastructure = all.filter(infrastructureLever);
  const admitted = all.filter((owner) => !infrastructureLever(owner));
  if (admitted.length === 1) {
    return { owner: admitted[0]!, reason: "unique-behavioral-owner", admitted_owners: admitted, infrastructure_levers: infrastructure };
  }
  return {
    owner: null,
    reason: admitted.length ? "ambiguous-behavioral-owners" : "no-behavioral-owner",
    admitted_owners: admitted,
    infrastructure_levers: infrastructure,
  };
}
