/**
 * A tiny math expression evaluator for `draw_plot`.
 *
 * The model hands us strings like "sin(x)/x" or "0.5*x^2 - 3". Feeding those to
 * `eval` would hand a remote model arbitrary code execution in the student's
 * browser, so we parse them ourselves. Recursive descent, one variable, a fixed
 * function table — anything else fails closed and the curve just doesn't draw.
 */

type Fn = (...args: number[]) => number;

const FUNCTIONS: Record<string, Fn> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  abs: Math.abs,
  exp: Math.exp,
  ln: Math.log,
  log: (x: number, base?: number) =>
    base === undefined ? Math.log10(x) : Math.log(x) / Math.log(base),
  log2: Math.log2,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  sign: Math.sign,
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
};

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
  tau: Math.PI * 2,
};

type Token =
  | { kind: "num"; value: number }
  | { kind: "name"; value: string }
  | { kind: "op"; value: string };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < input.length && /[0-9.]/.test(input[j])) j += 1;
      const value = Number(input.slice(i, j));
      if (!Number.isFinite(value)) throw new Error("bad number");
      tokens.push({ kind: "num", value });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let j = i;
      while (j < input.length && /[a-zA-Z_0-9]/.test(input[j])) j += 1;
      tokens.push({ kind: "name", value: input.slice(i, j).toLowerCase() });
      i = j;
      continue;
    }
    if ("+-*/^(),%".includes(ch)) {
      tokens.push({ kind: "op", value: ch });
      i += 1;
      continue;
    }
    throw new Error(`unexpected character ${ch}`);
  }
  return tokens;
}

/**
 * Compiles an expression to a `(x) => number`, or null if it can't be parsed.
 * Compile once per curve, then call it a few hundred times to sample.
 */
export function compileExpression(source: string): ((x: number) => number) | null {
  let tokens: Token[];
  try {
    // Strip a leading "y =" the way a student would write it.
    tokens = tokenize(source.replace(/^\s*[a-z]\s*\(?x?\)?\s*=(?!=)/i, ""));
  } catch {
    return null;
  }
  if (!tokens.length) return null;

  let pos = 0;
  const peek = () => tokens[pos];
  const eat = (value: string) => {
    const t = peek();
    if (t && t.kind === "op" && t.value === value) {
      pos += 1;
      return true;
    }
    return false;
  };

  type Node = (x: number) => number;

  function parseExpression(): Node {
    let left = parseTerm();
    for (;;) {
      if (eat("+")) {
        const right = parseTerm();
        const l = left;
        left = (x) => l(x) + right(x);
      } else if (eat("-")) {
        const right = parseTerm();
        const l = left;
        left = (x) => l(x) - right(x);
      } else return left;
    }
  }

  function parseTerm(): Node {
    let left = parseUnary();
    for (;;) {
      if (eat("*")) {
        const right = parseUnary();
        const l = left;
        left = (x) => l(x) * right(x);
      } else if (eat("/")) {
        const right = parseUnary();
        const l = left;
        left = (x) => l(x) / right(x);
      } else if (eat("%")) {
        const right = parseUnary();
        const l = left;
        left = (x) => l(x) % right(x);
      } else if (isImplicitMultiply()) {
        // "2x", "3sin(x)", "2(x+1)" — students and models write all three.
        const right = parseUnary();
        const l = left;
        left = (x) => l(x) * right(x);
      } else return left;
    }
  }

  function isImplicitMultiply(): boolean {
    const t = peek();
    if (!t) return false;
    if (t.kind === "num" || t.kind === "name") return true;
    return t.kind === "op" && t.value === "(";
  }

  function parseUnary(): Node {
    if (eat("-")) {
      const inner = parseUnary();
      return (x) => -inner(x);
    }
    if (eat("+")) return parseUnary();
    return parsePower();
  }

  function parsePower(): Node {
    const base = parseAtom();
    if (eat("^")) {
      const exponent = parseUnary(); // right associative
      return (x) => Math.pow(base(x), exponent(x));
    }
    return base;
  }

  function parseAtom(): Node {
    const t = peek();
    if (!t) throw new Error("unexpected end");
    if (t.kind === "num") {
      pos += 1;
      return () => t.value;
    }
    if (t.kind === "name") {
      pos += 1;
      const name = t.value;
      if (eat("(")) {
        const args: Node[] = [];
        if (!eat(")")) {
          do {
            args.push(parseExpression());
          } while (eat(","));
          if (!eat(")")) throw new Error("missing )");
        }
        const fn = FUNCTIONS[name];
        if (!fn) throw new Error(`unknown function ${name}`);
        return (x) => fn(...args.map((a) => a(x)));
      }
      if (name === "x") return (x) => x;
      const constant = CONSTANTS[name];
      if (constant === undefined) throw new Error(`unknown name ${name}`);
      return () => constant;
    }
    if (t.kind === "op" && t.value === "(") {
      pos += 1;
      const inner = parseExpression();
      if (!eat(")")) throw new Error("missing )");
      return inner;
    }
    throw new Error(`unexpected token ${t.value}`);
  }

  try {
    const fn = parseExpression();
    if (pos !== tokens.length) return null;
    // Smoke test: a compiled expression that throws on a plain number is junk.
    const probe = fn(1);
    if (typeof probe !== "number") return null;
    return fn;
  } catch {
    return null;
  }
}
