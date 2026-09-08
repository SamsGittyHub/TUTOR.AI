/**
 * Pulls complete top-level JSON objects out of a text stream as they close.
 *
 * The tutor protocol asks for one JSON object per line, but models wander:
 * they wrap output in ```json fences, emit a top-level array, add prose before
 * the first brace, or pretty-print across twenty lines. All of that is fine
 * here — we scan for balanced braces while respecting string literals and
 * escapes, and hand back each object the moment its closing brace arrives.
 * That's what makes the board draw itself while the model is still talking.
 */
export class JsonObjectStream {
  private buffer = "";
  /** Next index in `buffer` to examine. Persists across pushes so a chunk that
      splits an object mid-key doesn't get rescanned (and re-counted). */
  private pos = 0;
  private depth = 0;
  private start = -1;
  private inString = false;
  private escaped = false;
  /** Text seen outside of any object — a model that ignored the protocol. */
  private looseText = "";

  /** Feed a chunk; get back every object that completed inside it. */
  push(chunk: string): unknown[] {
    this.buffer += chunk;
    const out: unknown[] = [];

    while (this.pos < this.buffer.length) {
      const ch = this.buffer[this.pos];

      if (this.inString) {
        if (this.escaped) this.escaped = false;
        else if (ch === "\\") this.escaped = true;
        else if (ch === '"') this.inString = false;
        this.pos += 1;
        continue;
      }

      if (ch === '"' && this.depth > 0) {
        this.inString = true;
        this.pos += 1;
        continue;
      }

      if (ch === "{") {
        if (this.depth === 0) this.start = this.pos;
        this.depth += 1;
        this.pos += 1;
        continue;
      }

      if (ch === "}") {
        if (this.depth === 0) {
          // A stray brace outside any object; drop it.
          this.buffer = this.buffer.slice(1);
          continue;
        }
        this.depth -= 1;
        this.pos += 1;
        if (this.depth === 0 && this.start >= 0) {
          const slice = this.buffer.slice(this.start, this.pos);
          try {
            out.push(JSON.parse(slice));
          } catch {
            // Balanced but unparseable — keep it as loose text so the caller
            // can still show the student something.
            this.looseText += slice;
          }
          this.buffer = this.buffer.slice(this.pos);
          this.start = -1;
          this.pos = 0;
        }
        continue;
      }

      if (this.depth === 0) {
        // Prose, fences, array brackets, commas between objects. At depth 0
        // `pos` is always 0, so dropping the head keeps the invariant.
        if (!/[\s,\[\]`]/.test(ch)) this.looseText += ch;
        this.buffer = this.buffer.slice(1);
        continue;
      }

      this.pos += 1;
    }

    return out;
  }

  /** True while an object is half-written. */
  get isMidObject(): boolean {
    return this.depth > 0;
  }

  /** Everything the model said that wasn't part of a JSON object. */
  get stray(): string {
    return this.looseText.replace(/^json\b/i, "").trim();
  }

  /** Anything left dangling when the stream ends (truncated object, usually). */
  flush(): string {
    const rest = this.buffer;
    this.buffer = "";
    this.pos = 0;
    this.depth = 0;
    this.start = -1;
    this.inString = false;
    this.escaped = false;
    return rest;
  }
}

/** One-shot parse for non-streaming paths (quiz generation, key validation). */
export function extractJsonObjects(text: string): unknown[] {
  const stream = new JsonObjectStream();
  return stream.push(text);
}

/** First JSON object or array found in a blob of model text. */
export function extractFirstJson<T = unknown>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidates = [fenced?.[1], text].filter(Boolean) as string[];
  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    try {
      return JSON.parse(trimmed) as T;
    } catch {
      /* fall through to brace scanning */
    }
    const arrayStart = trimmed.indexOf("[");
    const objStart = trimmed.indexOf("{");
    const start =
      arrayStart >= 0 && (objStart < 0 || arrayStart < objStart)
        ? arrayStart
        : objStart;
    if (start < 0) continue;
    const open = trimmed[start];
    const close = open === "[" ? "]" : "}";
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < trimmed.length; i += 1) {
      const ch = trimmed[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === open) depth += 1;
      else if (ch === close) {
        depth -= 1;
        if (depth === 0) {
          try {
            return JSON.parse(trimmed.slice(start, i + 1)) as T;
          } catch {
            break;
          }
        }
      }
    }
  }
  return null;
}
