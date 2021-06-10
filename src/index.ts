import safe from 'safe-regex';
import define from 'define-property';
import extend from 'extend-shallow';
import not from 'regex-not';

// Max regex length
const MAX_LENGTH = 1024 * 64;

/**
 * Session cache
 */
const cache = {};

interface Options {
  /**
   * Generate a regex that will match any string that contains the given pattern.
   * By default, regex is strict will only return `true` for exact matches.
   */
  contains?: boolean;
  /**
   * Create a regex that will match everything except the given pattern.
   */
  negate?: boolean;
  /**
   * Adds the `i` flag, to enable case-insensitive matching.
   * Alternatively you can pass the flags you want directly with `options.flags`.
   */
  nocase?: boolean;
  /**
   * Define the flags you want to use on the generated regex.
   */
  flags?: string;
  /**
   * Generated regex is cached based on the provided string and options.
   * As a result, runtime compilation only happens once per pattern (as long as options are also the same), which can result in dramatic speed improvements.
   * This also helps with debugging, since adding options and pattern are added to the generated regex.
   */
  cache: boolean;
  /**
   * Check the generated regular expression with safe-regex and throw an error if the regex is potentially unsafe.
   */
  safe: boolean;
}

/**
 * Memoize generated regex. This can result in dramatic speed improvements
 * and simplify debugging by adding options and pattern to the regex. It can be
 * disabled by passing setting `options.cache` to false.
 */
function memoize(regex, key: string, pattern, options: Options) {
  define(regex, 'cached', true);
  define(regex, 'pattern', pattern);
  define(regex, 'options', options);
  define(regex, 'key', key);
  cache[key] = regex;
}

/**
 * Create the key to use for memoization. The key is generated
 * by iterating over the options and concatenating key-value pairs
 * to the pattern string.
 */
function createKey(pattern, options) {
  if (!options) return pattern;
  let key = pattern;
  for (const prop in options) {
    if (options.hasOwnProperty(prop)) {
      key += ';' + prop + '=' + String(options[prop]);
    }
  }
  return key;
}

/**
 * Create a regular expression from the given `pattern`.
 */
export const toRegex = function toRegex (patterns: string | string[] | RegExp, options: Options): RegExp {
  if (!Array.isArray(patterns)) {
    return makeRe(patterns, options);
  }
  return makeRe(patterns.join('|'), options);
};

/**
 * Create a regular expression from the given `pattern` string.
 */
export function makeRe(pattern: string | string[] | RegExp, options: Options): RegExp {
  if (pattern instanceof RegExp) {
    return pattern;
  }

  if (typeof pattern !== 'string') {
    throw new TypeError('expected a string');
  }

  if (pattern.length > MAX_LENGTH) {
    throw new Error('expected pattern to be less than ' + MAX_LENGTH + ' characters');
  }

  let key = pattern;
  // do this before shallow cloning options, it's a lot faster
  if (!options || (options && options.cache !== false)) {
    key = createKey(pattern, options);

    if (cache.hasOwnProperty(key)) {
      return cache[key];
    }
  }

  const opts = extend({}, options);
  if (opts.contains === true) {
    if (opts.negate === true) {
      opts.strictNegate = false;
    } else {
      opts.strict = false;
    }
  }

  if (opts.strict === false) {
    opts.strictOpen = false;
    opts.strictClose = false;
  }

  const open = opts.strictOpen !== false ? '^' : '';
  const close = opts.strictClose !== false ? '$' : '';
  let flags = opts.flags || '';
  let regex;

  if (opts.nocase === true && !/i/.test(flags)) {
    flags += 'i';
  }

  try {
    if (opts.negate || typeof opts.strictNegate === 'boolean') {
      pattern = not.create(pattern, opts);
    }

    const str = open + '(?:' + pattern + ')' + close;
    regex = new RegExp(str, flags);

    if (opts.safe === true && safe(regex) === false) {
      throw new Error('potentially unsafe regular expression: ' + regex.source);
    }

  } catch (err) {
    if (opts.strictErrors === true || opts.safe === true) {
      err.key = key;
      err.pattern = pattern;
      err.originalOptions = options;
      err.createdOptions = opts;
      throw err;
    }

    try {
      regex = new RegExp('^' + (pattern as string).replace(/(\W)/g, '\\$1') + '$');
    } catch (err) {
      regex = /.^/; //<= match nothing
    }
  }

  if (opts.cache !== false) {
    memoize(regex, key, pattern, opts);
  }
  return regex;
}

export default toRegex;
