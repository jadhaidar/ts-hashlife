const MIN_BUFFER_SIZE = 0x100;
const MAX_BUFFER_SIZE = 0x1000000;
const DENSITY_ESTIMATE = 0.009;

export interface Pattern {
  title: string;
  description: string;
  source_url: string;
  view_url: string;
  urls: string[];
  rule?: string;
  author?: string;
}

export interface Result {
  comment: string;
  urls: string[];
  title?: string;
  author?: string;
  rule?: string;
  pattern_string?: string;
  width?: number;
  height?: number;
  rule_s?: number;
  rule_b?: number;
  field_x?: Int32Array | number[];
  field_y?: Int32Array | number[];
  error?: string;
}

function parse_rle(pattern_string: string): Result {
  const result = parse_comments(pattern_string, "#");
  let x = 0,
    y = 0;
  let expr = /([a-zA-Z]+) *= *([a-zA-Z0-9\/()]+)/g;
  let header_match: RegExpExecArray | null;

  pattern_string = result.pattern_string!;
  let pos = pattern_string.indexOf("\n");

  if (pos === -1) {
    return { ...result, error: "RLE Syntax Error: No Header" };
  }

  while ((header_match = expr.exec(pattern_string.substr(0, pos)))) {
    switch (header_match[1]) {
      case "x":
        result.width = Number(header_match[2]);
        break;

      case "y":
        result.height = Number(header_match[2]);
        break;

      case "rule":
        result.rule_s = parse_rule_rle(header_match[2], true);
        result.rule_b = parse_rule_rle(header_match[2], false);

        result.rule = rule2str(result.rule_s, result.rule_b);
        break;

      default:
        return {
          ...result,
          error: "RLE Syntax Error: Invalid Header: " + header_match[1],
        };
    }
  }

  let initial_size = MIN_BUFFER_SIZE;

  if (result.width && result.height) {
    const size = result.width * result.height;

    if (size > 0) {
      initial_size = Math.max(
        initial_size,
        Math.floor(size * DENSITY_ESTIMATE)
      );
      initial_size = Math.min(MAX_BUFFER_SIZE, initial_size);
    }
  }

  let count = 1;
  let in_number = false;
  let chr: number;
  let field_x = new Int32Array(initial_size);
  let field_y = new Int32Array(initial_size);
  let alive_count = 0;
  const len = pattern_string.length;

  for (; pos < len; pos++) {
    chr = pattern_string.charCodeAt(pos);

    if (chr >= 48 && chr <= 57) {
      if (in_number) {
        count *= 10;
        count += chr ^ 48;
      } else {
        count = chr ^ 48;
        in_number = true;
      }
    } else {
      if (chr === 98) {
        x += count;
      } else if ((chr >= 65 && chr <= 90) || (chr >= 97 && chr < 122)) {
        if (alive_count + count > field_x.length) {
          field_x = increase_buf_size(field_x);
          field_y = increase_buf_size(field_y);
        }

        while (count--) {
          field_x[alive_count] = x++;
          field_y[alive_count] = y;
          alive_count++;
        }
      } else if (chr === 36) {
        y += count;
        x = 0;
      } else if (chr === 33) {
        break;
      }

      count = 1;
      in_number = false;
    }
  }

  result.field_x = new Int32Array(field_x.buffer, 0, alive_count);
  result.field_y = new Int32Array(field_y.buffer, 0, alive_count);

  return result;
}

function increase_buf_size(buffer: Int32Array): Int32Array {
  const new_buffer = new Int32Array(Math.floor(buffer.length * 1.5));
  new_buffer.set(buffer);
  return new_buffer;
}

function parse_comments(pattern_string: string, comment_char: string): Result {
  const result: Result = {
    comment: "",
    urls: [],
  };
  let nl: number;
  let line: string;
  const advanced = comment_char === "#";

  while (pattern_string[0] === comment_char) {
    nl = pattern_string.indexOf("\n");
    if (nl === -1) nl = pattern_string.length; // Handle the case where there's no newline
    line = pattern_string.substring(1, nl).trim();

    // Check for special comment types (N, O, R)
    if (advanced && pattern_string.length > 1) {
      const secondChar = pattern_string[1];

      if (secondChar === "N") {
        result.title = line.substring(1).trim();
      } else if (secondChar === "O") {
        result.author = line.substring(1).trim();
      } else if (secondChar === "R") {
        result.rule = line.substring(1).trim();
      } else if (secondChar === "C") {
        // Handle regular comments and URLs
        const commentLine = line.substring(1).trim();

        if (/^(?:https?:\/\/|www\.)[a-z0-9]/i.test(commentLine)) {
          let urlLine = commentLine;
          if (urlLine.substring(0, 4) !== "http") {
            urlLine = "http://" + urlLine;
          }
          result.urls.push(urlLine);
        } else {
          result.comment += commentLine + "\n";
        }
      }
    }

    pattern_string = pattern_string.substring(nl + 1);
  }

  result.pattern_string = pattern_string;
  result.comment = result.comment.trim();

  return result;
}

function parse_rule_rle(rule_str: string, survived: boolean): number {
  const tokens = rule_str.split("/");

  if (!tokens[1]) {
    return 0;
  }

  if (Number(tokens[0])) {
    return parse_rule(tokens.join("/"), survived);
  }

  if (tokens[0][0].toLowerCase() === "b") {
    tokens.reverse();
  }

  return parse_rule(tokens[0].substr(1) + "/" + tokens[1].substr(1), survived);
}

function parse_rule(rule_str: string, survived: boolean): number {
  let rule = 0;
  const parsed = rule_str.split("/")[survived ? 0 : 1];

  for (const char of parsed) {
    const n = Number(char);

    if (isNaN(n) || rule & (1 << n)) {
      return 0;
    }

    rule |= 1 << n;
  }

  return rule;
}

function rule2str(rule_s: number, rule_b: number): string {
  let rule = "";

  for (let i = 0; rule_s; rule_s >>= 1, i++) {
    if (rule_s & 1) {
      rule += i;
    }
  }

  rule += "/";

  for (let i = 0; rule_b; rule_b >>= 1, i++) {
    if (rule_b & 1) {
      rule += i;
    }
  }

  return rule;
}

function rule2str_rle(rule_s: number, rule_b: number): string {
  const rule = rule2str(rule_s, rule_b);
  const tokens = rule.split("/");
  return `B${tokens[1]}/S${tokens[0]}`;
}

function* rle_generator(life: any, bounds: any): Generator<string> {
  function make(length: number, is_empty: boolean): string {
    if (length === 0) return "";
    const length_tag = length > 1 ? String(length) : "";
    return length_tag + (is_empty ? "b" : "o");
  }

  for (let y = bounds.top; y <= bounds.bottom; y++) {
    let state_is_empty = true;
    let run_start = bounds.left;

    for (let x = bounds.left; x <= bounds.right; x++) {
      const is_empty = !life.get_bit(x, y);
      const run_length = x - run_start;

      if (state_is_empty !== is_empty) {
        yield make(run_length, state_is_empty);
        run_start = x;
        state_is_empty = is_empty;
      }
    }

    if (!state_is_empty) {
      const run_length = bounds.right + 1 - run_start;
      yield make(run_length, state_is_empty);
    }

    if (y !== bounds.bottom) yield "$";
  }

  yield "!";
}

function generate_rle(life: any, name: string, comments: string[]): string {
  const lines: string[] = [];
  const MAX_LINE_LENGTH = 70;

  if (name) {
    lines.push("#N " + name);
  }

  comments.forEach((c) => lines.push("#C " + c));

  const bounds = life.get_root_bounds();
  const width = bounds.right - bounds.left + 1;
  const height = bounds.bottom - bounds.top + 1;
  const rule = rule2str_rle(life.rule_s, life.rule_b);

  lines.push(`x = ${width}, y = ${height}, rule = ${rule}`);

  let current_line = "";
  for (const fragment of rle_generator(life, bounds)) {
    if (current_line.length + fragment.length > MAX_LINE_LENGTH) {
      lines.push(current_line);
      current_line = "";
    }
    current_line += fragment;
  }
  lines.push(current_line);

  return lines.join("\n");
}

function parse_pattern(
  pattern_text: string
): Partial<Result> | { error: string } {
  pattern_text = pattern_text.replace(/\r/g, "");

  if (pattern_text[0] === "!") {
    return parse_plaintext(pattern_text);
  } else if (
    /^(?:#[^\n]*\n)*\n*(?:(?:x|y|rule|color|alpha) *= *[a-z0-9\/(),]+,? *)+\s*\n/i.test(
      pattern_text
    )
  ) {
    return parse_rle(pattern_text);
  } else if (pattern_text.substr(0, 10) === "#Life 1.06") {
    return parse_life106(pattern_text);
  } else {
    return { error: "Format detection failed." };
  }
}

function parse_plaintext(pattern_string: string): Result | { error: string } {
  const result = parse_comments(pattern_string, "!");

  pattern_string = result.pattern_string!;

  const field_x: number[] = [];
  const field_y: number[] = [];
  let x = 0,
    y = 0;
  const len = pattern_string.length;

  for (let i = 0; i < len; i++) {
    switch (pattern_string[i]) {
      case ".":
        x++;
        break;
      case "O":
        field_x.push(x++);
        field_y.push(y);
        break;
      case "\n":
        y++;
        x = 0;
        break;
      case "\r":
      case " ":
        break;
      default:
        return { error: "Plaintext: Syntax Error" };
    }
  }

  result.field_x = field_x;
  result.field_y = field_y;

  return result;
}

function parse_life106(pattern_string: string): Partial<Result> {
  const expr = /\s*(-?\d+)\s+(-?\d+)\s*(?:\n|$)/g;
  const field_x: number[] = [];
  const field_y: number[] = [];
  let match: RegExpExecArray | null;

  while ((match = expr.exec(pattern_string))) {
    field_x.push(Number(match[1]));
    field_y.push(Number(match[2]));
  }

  return { field_x, field_y };
}

export const formats = {
  parse_rle,
  parse_pattern,
  rule2str,
  parse_rule,
  parse_comments,
  generate_rle,
};
