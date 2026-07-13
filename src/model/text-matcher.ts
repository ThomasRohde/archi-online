export interface TextMatcherOptions {
  find: string;
  matchCase: boolean;
  useRegex: boolean;
}

export interface TextReplacementResult {
  value: string;
  count: number;
}

export interface CompiledTextMatcher {
  valid: boolean;
  error: string | null;
  regex: RegExp | null;
  matches(value: string): boolean;
  count(value: string): number;
  replace(value: string, replacement: string): TextReplacementResult;
}

export function escapeTextForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Compile one literal or JavaScript-regex matcher for shared search/replace use. */
export function compileTextMatcher(options: TextMatcherOptions): CompiledTextMatcher {
  if (options.find.length === 0) return invalidMatcher('Find text is required.');

  const source = options.useRegex ? options.find : escapeTextForRegex(options.find);
  const flags = options.matchCase ? 'u' : 'iu';
  let regex: RegExp;
  try {
    regex = new RegExp(source, flags);
  } catch {
    return invalidMatcher('Invalid regular expression.');
  }

  const globalRegex = () => new RegExp(source, `${flags}g`);
  return {
    valid: true,
    error: null,
    regex,
    matches: (value) => regex.test(value),
    count: (value) => value.match(globalRegex())?.length ?? 0,
    replace: (value, replacement) => {
      const count = value.match(globalRegex())?.length ?? 0;
      if (count === 0) return { value, count: 0 };
      return {
        value: options.useRegex
          ? value.replace(globalRegex(), replacement)
          : value.replace(globalRegex(), () => replacement),
        count,
      };
    },
  };
}

function invalidMatcher(error: string): CompiledTextMatcher {
  return {
    valid: false,
    error,
    regex: null,
    matches: () => false,
    count: () => 0,
    replace: (value) => ({ value, count: 0 }),
  };
}
