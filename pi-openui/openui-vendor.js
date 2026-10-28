// GENERATED vendored bundle of @byteowlz/oqto-openui 0.2.1 (+@openuidev/lang-core, zod). MIT. Do not edit; rebuild with bun run pi-openui/vendor-src/build.ts
var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
function __accessProp(key) {
  return this[key];
}
var __toESMCache_node;
var __toESMCache_esm;
var __toESM = (mod, isNodeMode, target) => {
  var canCache = mod != null && typeof mod === "object";
  if (canCache) {
    var cache = isNodeMode ? __toESMCache_node ??= new WeakMap : __toESMCache_esm ??= new WeakMap;
    var cached = cache.get(mod);
    if (cached)
      return cached;
  }
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  for (let key of __getOwnPropNames(mod))
    if (!__hasOwnProp.call(to, key))
      __defProp(to, key, {
        get: __accessProp.bind(mod, key),
        enumerable: true
      });
  if (canCache)
    cache.set(mod, to);
  return to;
};
var __commonJS = (cb, mod) => () => (mod || cb((mod = { exports: {} }).exports, mod), mod.exports);
var __returnValue = (v) => v;
function __exportSetter(name, newValue) {
  this[name] = __returnValue.bind(null, newValue);
}
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: __exportSetter.bind(all, name)
    });
};

// node_modules/ci-info/vendors.json
var require_vendors = __commonJS((exports, module) => {
  module.exports = [
    {
      name: "Agola CI",
      constant: "AGOLA",
      env: "AGOLA_GIT_REF",
      pr: "AGOLA_PULL_REQUEST_ID"
    },
    {
      name: "Alpic",
      constant: "ALPIC",
      env: "ALPIC_HOST"
    },
    {
      name: "Appcircle",
      constant: "APPCIRCLE",
      env: "AC_APPCIRCLE",
      pr: {
        env: "AC_GIT_PR",
        ne: "false"
      }
    },
    {
      name: "AppVeyor",
      constant: "APPVEYOR",
      env: "APPVEYOR",
      pr: "APPVEYOR_PULL_REQUEST_NUMBER"
    },
    {
      name: "AWS CodeBuild",
      constant: "CODEBUILD",
      env: "CODEBUILD_BUILD_ARN",
      pr: {
        env: "CODEBUILD_WEBHOOK_EVENT",
        any: [
          "PULL_REQUEST_CREATED",
          "PULL_REQUEST_UPDATED",
          "PULL_REQUEST_REOPENED"
        ]
      }
    },
    {
      name: "Azure Pipelines",
      constant: "AZURE_PIPELINES",
      env: "TF_BUILD",
      pr: {
        BUILD_REASON: "PullRequest"
      }
    },
    {
      name: "Bamboo",
      constant: "BAMBOO",
      env: "bamboo_planKey"
    },
    {
      name: "Bitbucket Pipelines",
      constant: "BITBUCKET",
      env: "BITBUCKET_COMMIT",
      pr: "BITBUCKET_PR_ID"
    },
    {
      name: "Bitrise",
      constant: "BITRISE",
      env: "BITRISE_IO",
      pr: "BITRISE_PULL_REQUEST"
    },
    {
      name: "Buddy",
      constant: "BUDDY",
      env: "BUDDY_WORKSPACE_ID",
      pr: "BUDDY_EXECUTION_PULL_REQUEST_ID"
    },
    {
      name: "Buildkite",
      constant: "BUILDKITE",
      env: "BUILDKITE",
      pr: {
        env: "BUILDKITE_PULL_REQUEST",
        ne: "false"
      }
    },
    {
      name: "CircleCI",
      constant: "CIRCLE",
      env: "CIRCLECI",
      pr: "CIRCLE_PULL_REQUEST"
    },
    {
      name: "Cirrus CI",
      constant: "CIRRUS",
      env: "CIRRUS_CI",
      pr: "CIRRUS_PR"
    },
    {
      name: "Cloudflare Pages",
      constant: "CLOUDFLARE_PAGES",
      env: "CF_PAGES"
    },
    {
      name: "Cloudflare Workers",
      constant: "CLOUDFLARE_WORKERS",
      env: "WORKERS_CI"
    },
    {
      name: "Codefresh",
      constant: "CODEFRESH",
      env: "CF_BUILD_ID",
      pr: {
        any: [
          "CF_PULL_REQUEST_NUMBER",
          "CF_PULL_REQUEST_ID"
        ]
      }
    },
    {
      name: "Codemagic",
      constant: "CODEMAGIC",
      env: "CM_BUILD_ID",
      pr: "CM_PULL_REQUEST"
    },
    {
      name: "Codeship",
      constant: "CODESHIP",
      env: {
        CI_NAME: "codeship"
      }
    },
    {
      name: "Drone",
      constant: "DRONE",
      env: "DRONE",
      pr: {
        DRONE_BUILD_EVENT: "pull_request"
      }
    },
    {
      name: "dsari",
      constant: "DSARI",
      env: "DSARI"
    },
    {
      name: "Earthly",
      constant: "EARTHLY",
      env: "EARTHLY_CI"
    },
    {
      name: "Expo Application Services",
      constant: "EAS",
      env: "EAS_BUILD"
    },
    {
      name: "Gerrit",
      constant: "GERRIT",
      env: "GERRIT_PROJECT"
    },
    {
      name: "Gitea Actions",
      constant: "GITEA_ACTIONS",
      env: "GITEA_ACTIONS"
    },
    {
      name: "GitHub Actions",
      constant: "GITHUB_ACTIONS",
      env: "GITHUB_ACTIONS",
      pr: {
        GITHUB_EVENT_NAME: "pull_request"
      }
    },
    {
      name: "GitLab CI",
      constant: "GITLAB",
      env: "GITLAB_CI",
      pr: "CI_MERGE_REQUEST_ID"
    },
    {
      name: "GoCD",
      constant: "GOCD",
      env: "GO_PIPELINE_LABEL"
    },
    {
      name: "Google Cloud Build",
      constant: "GOOGLE_CLOUD_BUILD",
      env: "BUILDER_OUTPUT"
    },
    {
      name: "Harness CI",
      constant: "HARNESS",
      env: "HARNESS_BUILD_ID"
    },
    {
      name: "Heroku",
      constant: "HEROKU",
      env: {
        env: "NODE",
        includes: "/app/.heroku/node/bin/node"
      }
    },
    {
      name: "Hudson",
      constant: "HUDSON",
      env: "HUDSON_URL"
    },
    {
      name: "Jenkins",
      constant: "JENKINS",
      env: [
        "JENKINS_URL",
        "BUILD_ID"
      ],
      pr: {
        any: [
          "ghprbPullId",
          "CHANGE_ID"
        ]
      }
    },
    {
      name: "LayerCI",
      constant: "LAYERCI",
      env: "LAYERCI",
      pr: "LAYERCI_PULL_REQUEST"
    },
    {
      name: "Magnum CI",
      constant: "MAGNUM",
      env: "MAGNUM"
    },
    {
      name: "Netlify CI",
      constant: "NETLIFY",
      env: "NETLIFY",
      pr: {
        env: "PULL_REQUEST",
        ne: "false"
      }
    },
    {
      name: "Nevercode",
      constant: "NEVERCODE",
      env: "NEVERCODE",
      pr: {
        env: "NEVERCODE_PULL_REQUEST",
        ne: "false"
      }
    },
    {
      name: "Prow",
      constant: "PROW",
      env: "PROW_JOB_ID"
    },
    {
      name: "ReleaseHub",
      constant: "RELEASEHUB",
      env: "RELEASE_BUILD_ID"
    },
    {
      name: "Render",
      constant: "RENDER",
      env: "RENDER",
      pr: {
        IS_PULL_REQUEST: "true"
      }
    },
    {
      name: "Sail CI",
      constant: "SAIL",
      env: "SAILCI",
      pr: "SAIL_PULL_REQUEST_NUMBER"
    },
    {
      name: "Screwdriver",
      constant: "SCREWDRIVER",
      env: "SCREWDRIVER",
      pr: {
        env: "SD_PULL_REQUEST",
        ne: "false"
      }
    },
    {
      name: "Semaphore",
      constant: "SEMAPHORE",
      env: "SEMAPHORE",
      pr: "PULL_REQUEST_NUMBER"
    },
    {
      name: "Sourcehut",
      constant: "SOURCEHUT",
      env: {
        CI_NAME: "sourcehut"
      }
    },
    {
      name: "Strider CD",
      constant: "STRIDER",
      env: "STRIDER"
    },
    {
      name: "TaskCluster",
      constant: "TASKCLUSTER",
      env: [
        "TASK_ID",
        "RUN_ID"
      ]
    },
    {
      name: "TeamCity",
      constant: "TEAMCITY",
      env: "TEAMCITY_VERSION"
    },
    {
      name: "Travis CI",
      constant: "TRAVIS",
      env: "TRAVIS",
      pr: {
        env: "TRAVIS_PULL_REQUEST",
        ne: "false"
      }
    },
    {
      name: "Vela",
      constant: "VELA",
      env: "VELA",
      pr: {
        VELA_PULL_REQUEST: "1"
      }
    },
    {
      name: "Vercel",
      constant: "VERCEL",
      env: {
        any: [
          "NOW_BUILDER",
          "VERCEL"
        ]
      },
      pr: "VERCEL_GIT_PULL_REQUEST_ID"
    },
    {
      name: "Visual Studio App Center",
      constant: "APPCENTER",
      env: "APPCENTER_BUILD_ID"
    },
    {
      name: "Woodpecker",
      constant: "WOODPECKER",
      env: {
        CI: "woodpecker"
      },
      pr: {
        CI_BUILD_EVENT: "pull_request"
      }
    },
    {
      name: "Xcode Cloud",
      constant: "XCODE_CLOUD",
      env: "CI_XCODE_PROJECT",
      pr: "CI_PULL_REQUEST_NUMBER"
    },
    {
      name: "Xcode Server",
      constant: "XCODE_SERVER",
      env: "XCS"
    }
  ];
});

// node_modules/ci-info/index.js
var require_ci_info = __commonJS((exports) => {
  var vendors = require_vendors();
  var env = process.env;
  Object.defineProperty(exports, "_vendors", {
    value: vendors.map(function(v) {
      return v.constant;
    })
  });
  exports.name = null;
  exports.isPR = null;
  exports.id = null;
  if (env.CI !== "false") {
    vendors.forEach(function(vendor) {
      const envs = Array.isArray(vendor.env) ? vendor.env : [vendor.env];
      const isCI = envs.every(function(obj) {
        return checkEnv(obj);
      });
      exports[vendor.constant] = isCI;
      if (!isCI) {
        return;
      }
      exports.name = vendor.name;
      exports.isPR = checkPR(vendor);
      exports.id = vendor.constant;
    });
  }
  exports.isCI = !!(env.CI !== "false" && (env.BUILD_ID || env.BUILD_NUMBER || env.CI || env.CI_APP_ID || env.CI_BUILD_ID || env.CI_BUILD_NUMBER || env.CI_NAME || env.CONTINUOUS_INTEGRATION || env.RUN_ID || exports.name || false));
  function checkEnv(obj) {
    if (typeof obj === "string")
      return !!env[obj];
    if ("env" in obj) {
      return env[obj.env] && env[obj.env].includes(obj.includes);
    }
    if ("any" in obj) {
      return obj.any.some(function(k) {
        return !!env[k];
      });
    }
    return Object.keys(obj).every(function(k) {
      return env[k] === obj[k];
    });
  }
  function checkPR(vendor) {
    switch (typeof vendor.pr) {
      case "string":
        return !!env[vendor.pr];
      case "object":
        if ("env" in vendor.pr) {
          if ("any" in vendor.pr) {
            return vendor.pr.any.some(function(key) {
              return env[vendor.pr.env] === key;
            });
          } else {
            return vendor.pr.env in env && env[vendor.pr.env] !== vendor.pr.ne;
          }
        } else if ("any" in vendor.pr) {
          return vendor.pr.any.some(function(key) {
            return !!env[key];
          });
        } else {
          return checkEnv(vendor.pr);
        }
      default:
        return null;
    }
  }
});

// node_modules/@openuidev/lang-core/dist/shared-tgSjXCMf.mjs
var TELEMETRY_REQUEST_TIMEOUT_MS = 2000;
var PROJECT_ID_SALT = "openui-project-id";
function getPostHogConfig(env) {
  const host = env?.["OPENUI_POSTHOG_HOST"] ?? "https://dgoeivjus9jfp.cloudfront.net";
  return {
    apiKey: env?.["OPENUI_POSTHOG_KEY"] ?? "phc_3OLW53x09ZTVZSV6BEpj5uycj3ooqR6KOemOjx04e3D",
    captureUrl: new URL("/capture/", host).toString()
  };
}
function isTruthyEnv(value) {
  return value === "1" || value?.toLowerCase() === "true";
}
function isTelemetryDisabled(env) {
  return isTruthyEnv(env?.["OPENUI_TELEMETRY_DISABLED"]) || isTruthyEnv(env?.["DO_NOT_TRACK"]);
}
function isRuntimeTelemetryEnabled(env) {
  return isTruthyEnv(env?.["OPENUI_RUNTIME_TELEMETRY_ENABLED"]) && !isTelemetryDisabled(env);
}
function normalizeProjectIdentity(rawValue) {
  const value = rawValue.trim();
  if (!value)
    return "";
  try {
    const url = new URL(value);
    const repositoryPath = normalizeRepositoryPath(decodeURIComponent(url.pathname));
    if (url.protocol === "file:")
      return `file:${repositoryPath}`;
    if (url.host)
      return joinHostAndPath(url.host, repositoryPath);
  } catch {}
  if (/^[A-Za-z]:[\\/]/.test(value))
    return normalizeRepositoryPath(value);
  const scpMatch = /^(?:[^@/\s]+@)?([^:/\s]+):(.+)$/.exec(value);
  if (scpMatch)
    return joinHostAndPath(scpMatch[1], scpMatch[2]);
  return normalizeRepositoryPath(value);
}
function joinHostAndPath(host, repositoryPath) {
  const normalizedHost = host.trim().toLowerCase();
  const normalizedPath = normalizeRepositoryPath(repositoryPath);
  return normalizedPath ? `${normalizedHost}/${normalizedPath}` : normalizedHost;
}
function normalizeRepositoryPath(repositoryPath) {
  return repositoryPath.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").replace(/\.git$/i, "");
}

// node_modules/zod/v4/classic/external.js
var exports_external = {};
__export(exports_external, {
  xid: () => xid2,
  void: () => _void2,
  uuidv7: () => uuidv7,
  uuidv6: () => uuidv6,
  uuidv4: () => uuidv4,
  uuid: () => uuid2,
  util: () => exports_util,
  url: () => url,
  uppercase: () => _uppercase,
  unknown: () => unknown,
  union: () => union,
  undefined: () => _undefined3,
  ulid: () => ulid2,
  uint64: () => uint64,
  uint32: () => uint32,
  tuple: () => tuple,
  trim: () => _trim,
  treeifyError: () => treeifyError,
  transform: () => transform,
  toUpperCase: () => _toUpperCase,
  toLowerCase: () => _toLowerCase,
  toJSONSchema: () => toJSONSchema,
  templateLiteral: () => templateLiteral,
  symbol: () => symbol,
  superRefine: () => superRefine,
  success: () => success,
  stringbool: () => stringbool,
  stringFormat: () => stringFormat,
  string: () => string2,
  strictObject: () => strictObject,
  startsWith: () => _startsWith,
  size: () => _size,
  setErrorMap: () => setErrorMap,
  set: () => set,
  safeParseAsync: () => safeParseAsync2,
  safeParse: () => safeParse2,
  safeEncodeAsync: () => safeEncodeAsync2,
  safeEncode: () => safeEncode2,
  safeDecodeAsync: () => safeDecodeAsync2,
  safeDecode: () => safeDecode2,
  registry: () => registry,
  regexes: () => exports_regexes,
  regex: () => _regex,
  refine: () => refine,
  record: () => record,
  readonly: () => readonly,
  property: () => _property,
  promise: () => promise,
  prettifyError: () => prettifyError,
  preprocess: () => preprocess,
  prefault: () => prefault,
  positive: () => _positive,
  pipe: () => pipe,
  partialRecord: () => partialRecord,
  parseAsync: () => parseAsync2,
  parse: () => parse3,
  overwrite: () => _overwrite,
  optional: () => optional,
  object: () => object,
  number: () => number2,
  nullish: () => nullish2,
  nullable: () => nullable,
  null: () => _null3,
  normalize: () => _normalize,
  nonpositive: () => _nonpositive,
  nonoptional: () => nonoptional,
  nonnegative: () => _nonnegative,
  never: () => never,
  negative: () => _negative,
  nativeEnum: () => nativeEnum,
  nanoid: () => nanoid2,
  nan: () => nan,
  multipleOf: () => _multipleOf,
  minSize: () => _minSize,
  minLength: () => _minLength,
  mime: () => _mime,
  maxSize: () => _maxSize,
  maxLength: () => _maxLength,
  map: () => map,
  lte: () => _lte,
  lt: () => _lt,
  lowercase: () => _lowercase,
  looseObject: () => looseObject,
  locales: () => exports_locales,
  literal: () => literal,
  length: () => _length,
  lazy: () => lazy,
  ksuid: () => ksuid2,
  keyof: () => keyof,
  jwt: () => jwt,
  json: () => json,
  iso: () => exports_iso,
  ipv6: () => ipv62,
  ipv4: () => ipv42,
  intersection: () => intersection,
  int64: () => int64,
  int32: () => int32,
  int: () => int,
  instanceof: () => _instanceof,
  includes: () => _includes,
  httpUrl: () => httpUrl,
  hostname: () => hostname2,
  hex: () => hex2,
  hash: () => hash,
  guid: () => guid2,
  gte: () => _gte,
  gt: () => _gt,
  globalRegistry: () => globalRegistry,
  getErrorMap: () => getErrorMap,
  function: () => _function,
  formatError: () => formatError,
  float64: () => float64,
  float32: () => float32,
  flattenError: () => flattenError,
  file: () => file,
  enum: () => _enum2,
  endsWith: () => _endsWith,
  encodeAsync: () => encodeAsync2,
  encode: () => encode2,
  emoji: () => emoji2,
  email: () => email2,
  e164: () => e1642,
  discriminatedUnion: () => discriminatedUnion,
  decodeAsync: () => decodeAsync2,
  decode: () => decode2,
  date: () => date3,
  custom: () => custom,
  cuid2: () => cuid22,
  cuid: () => cuid3,
  core: () => exports_core2,
  config: () => config,
  coerce: () => exports_coerce,
  codec: () => codec,
  clone: () => clone,
  cidrv6: () => cidrv62,
  cidrv4: () => cidrv42,
  check: () => check,
  catch: () => _catch2,
  boolean: () => boolean2,
  bigint: () => bigint2,
  base64url: () => base64url2,
  base64: () => base642,
  array: () => array,
  any: () => any,
  _function: () => _function,
  _default: () => _default2,
  _ZodString: () => _ZodString,
  ZodXID: () => ZodXID,
  ZodVoid: () => ZodVoid,
  ZodUnknown: () => ZodUnknown,
  ZodUnion: () => ZodUnion,
  ZodUndefined: () => ZodUndefined,
  ZodUUID: () => ZodUUID,
  ZodURL: () => ZodURL,
  ZodULID: () => ZodULID,
  ZodType: () => ZodType,
  ZodTuple: () => ZodTuple,
  ZodTransform: () => ZodTransform,
  ZodTemplateLiteral: () => ZodTemplateLiteral,
  ZodSymbol: () => ZodSymbol,
  ZodSuccess: () => ZodSuccess,
  ZodStringFormat: () => ZodStringFormat,
  ZodString: () => ZodString,
  ZodSet: () => ZodSet,
  ZodRecord: () => ZodRecord,
  ZodRealError: () => ZodRealError,
  ZodReadonly: () => ZodReadonly,
  ZodPromise: () => ZodPromise,
  ZodPrefault: () => ZodPrefault,
  ZodPipe: () => ZodPipe,
  ZodOptional: () => ZodOptional,
  ZodObject: () => ZodObject,
  ZodNumberFormat: () => ZodNumberFormat,
  ZodNumber: () => ZodNumber,
  ZodNullable: () => ZodNullable,
  ZodNull: () => ZodNull,
  ZodNonOptional: () => ZodNonOptional,
  ZodNever: () => ZodNever,
  ZodNanoID: () => ZodNanoID,
  ZodNaN: () => ZodNaN,
  ZodMap: () => ZodMap,
  ZodLiteral: () => ZodLiteral,
  ZodLazy: () => ZodLazy,
  ZodKSUID: () => ZodKSUID,
  ZodJWT: () => ZodJWT,
  ZodIssueCode: () => ZodIssueCode,
  ZodIntersection: () => ZodIntersection,
  ZodISOTime: () => ZodISOTime,
  ZodISODuration: () => ZodISODuration,
  ZodISODateTime: () => ZodISODateTime,
  ZodISODate: () => ZodISODate,
  ZodIPv6: () => ZodIPv6,
  ZodIPv4: () => ZodIPv4,
  ZodGUID: () => ZodGUID,
  ZodFunction: () => ZodFunction,
  ZodFirstPartyTypeKind: () => ZodFirstPartyTypeKind,
  ZodFile: () => ZodFile,
  ZodError: () => ZodError,
  ZodEnum: () => ZodEnum,
  ZodEmoji: () => ZodEmoji,
  ZodEmail: () => ZodEmail,
  ZodE164: () => ZodE164,
  ZodDiscriminatedUnion: () => ZodDiscriminatedUnion,
  ZodDefault: () => ZodDefault,
  ZodDate: () => ZodDate,
  ZodCustomStringFormat: () => ZodCustomStringFormat,
  ZodCustom: () => ZodCustom,
  ZodCodec: () => ZodCodec,
  ZodCatch: () => ZodCatch,
  ZodCUID2: () => ZodCUID2,
  ZodCUID: () => ZodCUID,
  ZodCIDRv6: () => ZodCIDRv6,
  ZodCIDRv4: () => ZodCIDRv4,
  ZodBoolean: () => ZodBoolean,
  ZodBigIntFormat: () => ZodBigIntFormat,
  ZodBigInt: () => ZodBigInt,
  ZodBase64URL: () => ZodBase64URL,
  ZodBase64: () => ZodBase64,
  ZodArray: () => ZodArray,
  ZodAny: () => ZodAny,
  TimePrecision: () => TimePrecision,
  NEVER: () => NEVER,
  $output: () => $output,
  $input: () => $input,
  $brand: () => $brand
});

// node_modules/zod/v4/core/index.js
var exports_core2 = {};
__export(exports_core2, {
  version: () => version,
  util: () => exports_util,
  treeifyError: () => treeifyError,
  toJSONSchema: () => toJSONSchema,
  toDotPath: () => toDotPath,
  safeParseAsync: () => safeParseAsync,
  safeParse: () => safeParse,
  safeEncodeAsync: () => safeEncodeAsync,
  safeEncode: () => safeEncode,
  safeDecodeAsync: () => safeDecodeAsync,
  safeDecode: () => safeDecode,
  registry: () => registry,
  regexes: () => exports_regexes,
  prettifyError: () => prettifyError,
  parseAsync: () => parseAsync,
  parse: () => parse,
  locales: () => exports_locales,
  isValidJWT: () => isValidJWT,
  isValidBase64URL: () => isValidBase64URL,
  isValidBase64: () => isValidBase64,
  globalRegistry: () => globalRegistry,
  globalConfig: () => globalConfig,
  formatError: () => formatError,
  flattenError: () => flattenError,
  encodeAsync: () => encodeAsync,
  encode: () => encode,
  decodeAsync: () => decodeAsync,
  decode: () => decode,
  config: () => config,
  clone: () => clone,
  _xid: () => _xid,
  _void: () => _void,
  _uuidv7: () => _uuidv7,
  _uuidv6: () => _uuidv6,
  _uuidv4: () => _uuidv4,
  _uuid: () => _uuid,
  _url: () => _url,
  _uppercase: () => _uppercase,
  _unknown: () => _unknown,
  _union: () => _union,
  _undefined: () => _undefined2,
  _ulid: () => _ulid,
  _uint64: () => _uint64,
  _uint32: () => _uint32,
  _tuple: () => _tuple,
  _trim: () => _trim,
  _transform: () => _transform,
  _toUpperCase: () => _toUpperCase,
  _toLowerCase: () => _toLowerCase,
  _templateLiteral: () => _templateLiteral,
  _symbol: () => _symbol,
  _superRefine: () => _superRefine,
  _success: () => _success,
  _stringbool: () => _stringbool,
  _stringFormat: () => _stringFormat,
  _string: () => _string,
  _startsWith: () => _startsWith,
  _size: () => _size,
  _set: () => _set,
  _safeParseAsync: () => _safeParseAsync,
  _safeParse: () => _safeParse,
  _safeEncodeAsync: () => _safeEncodeAsync,
  _safeEncode: () => _safeEncode,
  _safeDecodeAsync: () => _safeDecodeAsync,
  _safeDecode: () => _safeDecode,
  _regex: () => _regex,
  _refine: () => _refine,
  _record: () => _record,
  _readonly: () => _readonly,
  _property: () => _property,
  _promise: () => _promise,
  _positive: () => _positive,
  _pipe: () => _pipe,
  _parseAsync: () => _parseAsync,
  _parse: () => _parse,
  _overwrite: () => _overwrite,
  _optional: () => _optional,
  _number: () => _number,
  _nullable: () => _nullable,
  _null: () => _null2,
  _normalize: () => _normalize,
  _nonpositive: () => _nonpositive,
  _nonoptional: () => _nonoptional,
  _nonnegative: () => _nonnegative,
  _never: () => _never,
  _negative: () => _negative,
  _nativeEnum: () => _nativeEnum,
  _nanoid: () => _nanoid,
  _nan: () => _nan,
  _multipleOf: () => _multipleOf,
  _minSize: () => _minSize,
  _minLength: () => _minLength,
  _min: () => _gte,
  _mime: () => _mime,
  _maxSize: () => _maxSize,
  _maxLength: () => _maxLength,
  _max: () => _lte,
  _map: () => _map,
  _lte: () => _lte,
  _lt: () => _lt,
  _lowercase: () => _lowercase,
  _literal: () => _literal,
  _length: () => _length,
  _lazy: () => _lazy,
  _ksuid: () => _ksuid,
  _jwt: () => _jwt,
  _isoTime: () => _isoTime,
  _isoDuration: () => _isoDuration,
  _isoDateTime: () => _isoDateTime,
  _isoDate: () => _isoDate,
  _ipv6: () => _ipv6,
  _ipv4: () => _ipv4,
  _intersection: () => _intersection,
  _int64: () => _int64,
  _int32: () => _int32,
  _int: () => _int,
  _includes: () => _includes,
  _guid: () => _guid,
  _gte: () => _gte,
  _gt: () => _gt,
  _float64: () => _float64,
  _float32: () => _float32,
  _file: () => _file,
  _enum: () => _enum,
  _endsWith: () => _endsWith,
  _encodeAsync: () => _encodeAsync,
  _encode: () => _encode,
  _emoji: () => _emoji2,
  _email: () => _email,
  _e164: () => _e164,
  _discriminatedUnion: () => _discriminatedUnion,
  _default: () => _default,
  _decodeAsync: () => _decodeAsync,
  _decode: () => _decode,
  _date: () => _date,
  _custom: () => _custom,
  _cuid2: () => _cuid2,
  _cuid: () => _cuid,
  _coercedString: () => _coercedString,
  _coercedNumber: () => _coercedNumber,
  _coercedDate: () => _coercedDate,
  _coercedBoolean: () => _coercedBoolean,
  _coercedBigint: () => _coercedBigint,
  _cidrv6: () => _cidrv6,
  _cidrv4: () => _cidrv4,
  _check: () => _check,
  _catch: () => _catch,
  _boolean: () => _boolean,
  _bigint: () => _bigint,
  _base64url: () => _base64url,
  _base64: () => _base64,
  _array: () => _array,
  _any: () => _any,
  TimePrecision: () => TimePrecision,
  NEVER: () => NEVER,
  JSONSchemaGenerator: () => JSONSchemaGenerator,
  JSONSchema: () => exports_json_schema,
  Doc: () => Doc,
  $output: () => $output,
  $input: () => $input,
  $constructor: () => $constructor,
  $brand: () => $brand,
  $ZodXID: () => $ZodXID,
  $ZodVoid: () => $ZodVoid,
  $ZodUnknown: () => $ZodUnknown,
  $ZodUnion: () => $ZodUnion,
  $ZodUndefined: () => $ZodUndefined,
  $ZodUUID: () => $ZodUUID,
  $ZodURL: () => $ZodURL,
  $ZodULID: () => $ZodULID,
  $ZodType: () => $ZodType,
  $ZodTuple: () => $ZodTuple,
  $ZodTransform: () => $ZodTransform,
  $ZodTemplateLiteral: () => $ZodTemplateLiteral,
  $ZodSymbol: () => $ZodSymbol,
  $ZodSuccess: () => $ZodSuccess,
  $ZodStringFormat: () => $ZodStringFormat,
  $ZodString: () => $ZodString,
  $ZodSet: () => $ZodSet,
  $ZodRegistry: () => $ZodRegistry,
  $ZodRecord: () => $ZodRecord,
  $ZodRealError: () => $ZodRealError,
  $ZodReadonly: () => $ZodReadonly,
  $ZodPromise: () => $ZodPromise,
  $ZodPrefault: () => $ZodPrefault,
  $ZodPipe: () => $ZodPipe,
  $ZodOptional: () => $ZodOptional,
  $ZodObjectJIT: () => $ZodObjectJIT,
  $ZodObject: () => $ZodObject,
  $ZodNumberFormat: () => $ZodNumberFormat,
  $ZodNumber: () => $ZodNumber,
  $ZodNullable: () => $ZodNullable,
  $ZodNull: () => $ZodNull,
  $ZodNonOptional: () => $ZodNonOptional,
  $ZodNever: () => $ZodNever,
  $ZodNanoID: () => $ZodNanoID,
  $ZodNaN: () => $ZodNaN,
  $ZodMap: () => $ZodMap,
  $ZodLiteral: () => $ZodLiteral,
  $ZodLazy: () => $ZodLazy,
  $ZodKSUID: () => $ZodKSUID,
  $ZodJWT: () => $ZodJWT,
  $ZodIntersection: () => $ZodIntersection,
  $ZodISOTime: () => $ZodISOTime,
  $ZodISODuration: () => $ZodISODuration,
  $ZodISODateTime: () => $ZodISODateTime,
  $ZodISODate: () => $ZodISODate,
  $ZodIPv6: () => $ZodIPv6,
  $ZodIPv4: () => $ZodIPv4,
  $ZodGUID: () => $ZodGUID,
  $ZodFunction: () => $ZodFunction,
  $ZodFile: () => $ZodFile,
  $ZodError: () => $ZodError,
  $ZodEnum: () => $ZodEnum,
  $ZodEncodeError: () => $ZodEncodeError,
  $ZodEmoji: () => $ZodEmoji,
  $ZodEmail: () => $ZodEmail,
  $ZodE164: () => $ZodE164,
  $ZodDiscriminatedUnion: () => $ZodDiscriminatedUnion,
  $ZodDefault: () => $ZodDefault,
  $ZodDate: () => $ZodDate,
  $ZodCustomStringFormat: () => $ZodCustomStringFormat,
  $ZodCustom: () => $ZodCustom,
  $ZodCodec: () => $ZodCodec,
  $ZodCheckUpperCase: () => $ZodCheckUpperCase,
  $ZodCheckStringFormat: () => $ZodCheckStringFormat,
  $ZodCheckStartsWith: () => $ZodCheckStartsWith,
  $ZodCheckSizeEquals: () => $ZodCheckSizeEquals,
  $ZodCheckRegex: () => $ZodCheckRegex,
  $ZodCheckProperty: () => $ZodCheckProperty,
  $ZodCheckOverwrite: () => $ZodCheckOverwrite,
  $ZodCheckNumberFormat: () => $ZodCheckNumberFormat,
  $ZodCheckMultipleOf: () => $ZodCheckMultipleOf,
  $ZodCheckMinSize: () => $ZodCheckMinSize,
  $ZodCheckMinLength: () => $ZodCheckMinLength,
  $ZodCheckMimeType: () => $ZodCheckMimeType,
  $ZodCheckMaxSize: () => $ZodCheckMaxSize,
  $ZodCheckMaxLength: () => $ZodCheckMaxLength,
  $ZodCheckLowerCase: () => $ZodCheckLowerCase,
  $ZodCheckLessThan: () => $ZodCheckLessThan,
  $ZodCheckLengthEquals: () => $ZodCheckLengthEquals,
  $ZodCheckIncludes: () => $ZodCheckIncludes,
  $ZodCheckGreaterThan: () => $ZodCheckGreaterThan,
  $ZodCheckEndsWith: () => $ZodCheckEndsWith,
  $ZodCheckBigIntFormat: () => $ZodCheckBigIntFormat,
  $ZodCheck: () => $ZodCheck,
  $ZodCatch: () => $ZodCatch,
  $ZodCUID2: () => $ZodCUID2,
  $ZodCUID: () => $ZodCUID,
  $ZodCIDRv6: () => $ZodCIDRv6,
  $ZodCIDRv4: () => $ZodCIDRv4,
  $ZodBoolean: () => $ZodBoolean,
  $ZodBigIntFormat: () => $ZodBigIntFormat,
  $ZodBigInt: () => $ZodBigInt,
  $ZodBase64URL: () => $ZodBase64URL,
  $ZodBase64: () => $ZodBase64,
  $ZodAsyncError: () => $ZodAsyncError,
  $ZodArray: () => $ZodArray,
  $ZodAny: () => $ZodAny
});

// node_modules/zod/v4/core/core.js
var NEVER = Object.freeze({
  status: "aborted"
});
function $constructor(name, initializer, params) {
  function init(inst, def) {
    var _a;
    Object.defineProperty(inst, "_zod", {
      value: inst._zod ?? {},
      enumerable: false
    });
    (_a = inst._zod).traits ?? (_a.traits = new Set);
    inst._zod.traits.add(name);
    initializer(inst, def);
    for (const k in _.prototype) {
      if (!(k in inst))
        Object.defineProperty(inst, k, { value: _.prototype[k].bind(inst) });
    }
    inst._zod.constr = _;
    inst._zod.def = def;
  }
  const Parent = params?.Parent ?? Object;

  class Definition extends Parent {
  }
  Object.defineProperty(Definition, "name", { value: name });
  function _(def) {
    var _a;
    const inst = params?.Parent ? new Definition : this;
    init(inst, def);
    (_a = inst._zod).deferred ?? (_a.deferred = []);
    for (const fn of inst._zod.deferred) {
      fn();
    }
    return inst;
  }
  Object.defineProperty(_, "init", { value: init });
  Object.defineProperty(_, Symbol.hasInstance, {
    value: (inst) => {
      if (params?.Parent && inst instanceof params.Parent)
        return true;
      return inst?._zod?.traits?.has(name);
    }
  });
  Object.defineProperty(_, "name", { value: name });
  return _;
}
var $brand = Symbol("zod_brand");

class $ZodAsyncError extends Error {
  constructor() {
    super(`Encountered Promise during synchronous parse. Use .parseAsync() instead.`);
  }
}

class $ZodEncodeError extends Error {
  constructor(name) {
    super(`Encountered unidirectional transform during encode: ${name}`);
    this.name = "ZodEncodeError";
  }
}
var globalConfig = {};
function config(newConfig) {
  if (newConfig)
    Object.assign(globalConfig, newConfig);
  return globalConfig;
}
// node_modules/zod/v4/core/util.js
var exports_util = {};
__export(exports_util, {
  unwrapMessage: () => unwrapMessage,
  uint8ArrayToHex: () => uint8ArrayToHex,
  uint8ArrayToBase64url: () => uint8ArrayToBase64url,
  uint8ArrayToBase64: () => uint8ArrayToBase64,
  stringifyPrimitive: () => stringifyPrimitive,
  shallowClone: () => shallowClone,
  safeExtend: () => safeExtend,
  required: () => required,
  randomString: () => randomString,
  propertyKeyTypes: () => propertyKeyTypes,
  promiseAllObject: () => promiseAllObject,
  primitiveTypes: () => primitiveTypes,
  prefixIssues: () => prefixIssues,
  pick: () => pick,
  partial: () => partial,
  optionalKeys: () => optionalKeys,
  omit: () => omit,
  objectClone: () => objectClone,
  numKeys: () => numKeys,
  nullish: () => nullish,
  normalizeParams: () => normalizeParams,
  mergeDefs: () => mergeDefs,
  merge: () => merge,
  jsonStringifyReplacer: () => jsonStringifyReplacer,
  joinValues: () => joinValues,
  issue: () => issue,
  isPlainObject: () => isPlainObject,
  isObject: () => isObject,
  hexToUint8Array: () => hexToUint8Array,
  getSizableOrigin: () => getSizableOrigin,
  getParsedType: () => getParsedType,
  getLengthableOrigin: () => getLengthableOrigin,
  getEnumValues: () => getEnumValues,
  getElementAtPath: () => getElementAtPath,
  floatSafeRemainder: () => floatSafeRemainder,
  finalizeIssue: () => finalizeIssue,
  extend: () => extend,
  escapeRegex: () => escapeRegex,
  esc: () => esc,
  defineLazy: () => defineLazy,
  createTransparentProxy: () => createTransparentProxy,
  cloneDef: () => cloneDef,
  clone: () => clone,
  cleanRegex: () => cleanRegex,
  cleanEnum: () => cleanEnum,
  captureStackTrace: () => captureStackTrace,
  cached: () => cached,
  base64urlToUint8Array: () => base64urlToUint8Array,
  base64ToUint8Array: () => base64ToUint8Array,
  assignProp: () => assignProp,
  assertNotEqual: () => assertNotEqual,
  assertNever: () => assertNever,
  assertIs: () => assertIs,
  assertEqual: () => assertEqual,
  assert: () => assert,
  allowsEval: () => allowsEval,
  aborted: () => aborted,
  NUMBER_FORMAT_RANGES: () => NUMBER_FORMAT_RANGES,
  Class: () => Class,
  BIGINT_FORMAT_RANGES: () => BIGINT_FORMAT_RANGES
});
function assertEqual(val) {
  return val;
}
function assertNotEqual(val) {
  return val;
}
function assertIs(_arg) {}
function assertNever(_x) {
  throw new Error;
}
function assert(_) {}
function getEnumValues(entries) {
  const numericValues = Object.values(entries).filter((v) => typeof v === "number");
  const values = Object.entries(entries).filter(([k, _]) => numericValues.indexOf(+k) === -1).map(([_, v]) => v);
  return values;
}
function joinValues(array, separator = "|") {
  return array.map((val) => stringifyPrimitive(val)).join(separator);
}
function jsonStringifyReplacer(_, value) {
  if (typeof value === "bigint")
    return value.toString();
  return value;
}
function cached(getter) {
  const set = false;
  return {
    get value() {
      if (!set) {
        const value = getter();
        Object.defineProperty(this, "value", { value });
        return value;
      }
      throw new Error("cached value already set");
    }
  };
}
function nullish(input) {
  return input === null || input === undefined;
}
function cleanRegex(source) {
  const start = source.startsWith("^") ? 1 : 0;
  const end = source.endsWith("$") ? source.length - 1 : source.length;
  return source.slice(start, end);
}
function floatSafeRemainder(val, step) {
  const valDecCount = (val.toString().split(".")[1] || "").length;
  const stepString = step.toString();
  let stepDecCount = (stepString.split(".")[1] || "").length;
  if (stepDecCount === 0 && /\d?e-\d?/.test(stepString)) {
    const match = stepString.match(/\d?e-(\d?)/);
    if (match?.[1]) {
      stepDecCount = Number.parseInt(match[1]);
    }
  }
  const decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount;
  const valInt = Number.parseInt(val.toFixed(decCount).replace(".", ""));
  const stepInt = Number.parseInt(step.toFixed(decCount).replace(".", ""));
  return valInt % stepInt / 10 ** decCount;
}
var EVALUATING = Symbol("evaluating");
function defineLazy(object, key, getter) {
  let value = undefined;
  Object.defineProperty(object, key, {
    get() {
      if (value === EVALUATING) {
        return;
      }
      if (value === undefined) {
        value = EVALUATING;
        value = getter();
      }
      return value;
    },
    set(v) {
      Object.defineProperty(object, key, {
        value: v
      });
    },
    configurable: true
  });
}
function objectClone(obj) {
  return Object.create(Object.getPrototypeOf(obj), Object.getOwnPropertyDescriptors(obj));
}
function assignProp(target, prop, value) {
  Object.defineProperty(target, prop, {
    value,
    writable: true,
    enumerable: true,
    configurable: true
  });
}
function mergeDefs(...defs) {
  const mergedDescriptors = {};
  for (const def of defs) {
    const descriptors = Object.getOwnPropertyDescriptors(def);
    Object.assign(mergedDescriptors, descriptors);
  }
  return Object.defineProperties({}, mergedDescriptors);
}
function cloneDef(schema) {
  return mergeDefs(schema._zod.def);
}
function getElementAtPath(obj, path) {
  if (!path)
    return obj;
  return path.reduce((acc, key) => acc?.[key], obj);
}
function promiseAllObject(promisesObj) {
  const keys = Object.keys(promisesObj);
  const promises = keys.map((key) => promisesObj[key]);
  return Promise.all(promises).then((results) => {
    const resolvedObj = {};
    for (let i = 0;i < keys.length; i++) {
      resolvedObj[keys[i]] = results[i];
    }
    return resolvedObj;
  });
}
function randomString(length = 10) {
  const chars = "abcdefghijklmnopqrstuvwxyz";
  let str = "";
  for (let i = 0;i < length; i++) {
    str += chars[Math.floor(Math.random() * chars.length)];
  }
  return str;
}
function esc(str) {
  return JSON.stringify(str);
}
var captureStackTrace = "captureStackTrace" in Error ? Error.captureStackTrace : (..._args) => {};
function isObject(data) {
  return typeof data === "object" && data !== null && !Array.isArray(data);
}
var allowsEval = cached(() => {
  if (typeof navigator !== "undefined" && navigator?.userAgent?.includes("Cloudflare")) {
    return false;
  }
  try {
    const F = Function;
    new F("");
    return true;
  } catch (_) {
    return false;
  }
});
function isPlainObject(o) {
  if (isObject(o) === false)
    return false;
  const ctor = o.constructor;
  if (ctor === undefined)
    return true;
  const prot = ctor.prototype;
  if (isObject(prot) === false)
    return false;
  if (Object.prototype.hasOwnProperty.call(prot, "isPrototypeOf") === false) {
    return false;
  }
  return true;
}
function shallowClone(o) {
  if (isPlainObject(o))
    return { ...o };
  if (Array.isArray(o))
    return [...o];
  return o;
}
function numKeys(data) {
  let keyCount = 0;
  for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      keyCount++;
    }
  }
  return keyCount;
}
var getParsedType = (data) => {
  const t = typeof data;
  switch (t) {
    case "undefined":
      return "undefined";
    case "string":
      return "string";
    case "number":
      return Number.isNaN(data) ? "nan" : "number";
    case "boolean":
      return "boolean";
    case "function":
      return "function";
    case "bigint":
      return "bigint";
    case "symbol":
      return "symbol";
    case "object":
      if (Array.isArray(data)) {
        return "array";
      }
      if (data === null) {
        return "null";
      }
      if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") {
        return "promise";
      }
      if (typeof Map !== "undefined" && data instanceof Map) {
        return "map";
      }
      if (typeof Set !== "undefined" && data instanceof Set) {
        return "set";
      }
      if (typeof Date !== "undefined" && data instanceof Date) {
        return "date";
      }
      if (typeof File !== "undefined" && data instanceof File) {
        return "file";
      }
      return "object";
    default:
      throw new Error(`Unknown data type: ${t}`);
  }
};
var propertyKeyTypes = new Set(["string", "number", "symbol"]);
var primitiveTypes = new Set(["string", "number", "bigint", "boolean", "symbol", "undefined"]);
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function clone(inst, def, params) {
  const cl = new inst._zod.constr(def ?? inst._zod.def);
  if (!def || params?.parent)
    cl._zod.parent = inst;
  return cl;
}
function normalizeParams(_params) {
  const params = _params;
  if (!params)
    return {};
  if (typeof params === "string")
    return { error: () => params };
  if (params?.message !== undefined) {
    if (params?.error !== undefined)
      throw new Error("Cannot specify both `message` and `error` params");
    params.error = params.message;
  }
  delete params.message;
  if (typeof params.error === "string")
    return { ...params, error: () => params.error };
  return params;
}
function createTransparentProxy(getter) {
  let target;
  return new Proxy({}, {
    get(_, prop, receiver) {
      target ?? (target = getter());
      return Reflect.get(target, prop, receiver);
    },
    set(_, prop, value, receiver) {
      target ?? (target = getter());
      return Reflect.set(target, prop, value, receiver);
    },
    has(_, prop) {
      target ?? (target = getter());
      return Reflect.has(target, prop);
    },
    deleteProperty(_, prop) {
      target ?? (target = getter());
      return Reflect.deleteProperty(target, prop);
    },
    ownKeys(_) {
      target ?? (target = getter());
      return Reflect.ownKeys(target);
    },
    getOwnPropertyDescriptor(_, prop) {
      target ?? (target = getter());
      return Reflect.getOwnPropertyDescriptor(target, prop);
    },
    defineProperty(_, prop, descriptor) {
      target ?? (target = getter());
      return Reflect.defineProperty(target, prop, descriptor);
    }
  });
}
function stringifyPrimitive(value) {
  if (typeof value === "bigint")
    return value.toString() + "n";
  if (typeof value === "string")
    return `"${value}"`;
  return `${value}`;
}
function optionalKeys(shape) {
  return Object.keys(shape).filter((k) => {
    return shape[k]._zod.optin === "optional" && shape[k]._zod.optout === "optional";
  });
}
var NUMBER_FORMAT_RANGES = {
  safeint: [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
  int32: [-2147483648, 2147483647],
  uint32: [0, 4294967295],
  float32: [-340282346638528860000000000000000000000, 340282346638528860000000000000000000000],
  float64: [-Number.MAX_VALUE, Number.MAX_VALUE]
};
var BIGINT_FORMAT_RANGES = {
  int64: [/* @__PURE__ */ BigInt("-9223372036854775808"), /* @__PURE__ */ BigInt("9223372036854775807")],
  uint64: [/* @__PURE__ */ BigInt(0), /* @__PURE__ */ BigInt("18446744073709551615")]
};
function pick(schema, mask) {
  const currDef = schema._zod.def;
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const newShape = {};
      for (const key in mask) {
        if (!(key in currDef.shape)) {
          throw new Error(`Unrecognized key: "${key}"`);
        }
        if (!mask[key])
          continue;
        newShape[key] = currDef.shape[key];
      }
      assignProp(this, "shape", newShape);
      return newShape;
    },
    checks: []
  });
  return clone(schema, def);
}
function omit(schema, mask) {
  const currDef = schema._zod.def;
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const newShape = { ...schema._zod.def.shape };
      for (const key in mask) {
        if (!(key in currDef.shape)) {
          throw new Error(`Unrecognized key: "${key}"`);
        }
        if (!mask[key])
          continue;
        delete newShape[key];
      }
      assignProp(this, "shape", newShape);
      return newShape;
    },
    checks: []
  });
  return clone(schema, def);
}
function extend(schema, shape) {
  if (!isPlainObject(shape)) {
    throw new Error("Invalid input to extend: expected a plain object");
  }
  const checks = schema._zod.def.checks;
  const hasChecks = checks && checks.length > 0;
  if (hasChecks) {
    throw new Error("Object schemas containing refinements cannot be extended. Use `.safeExtend()` instead.");
  }
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const _shape = { ...schema._zod.def.shape, ...shape };
      assignProp(this, "shape", _shape);
      return _shape;
    },
    checks: []
  });
  return clone(schema, def);
}
function safeExtend(schema, shape) {
  if (!isPlainObject(shape)) {
    throw new Error("Invalid input to safeExtend: expected a plain object");
  }
  const def = {
    ...schema._zod.def,
    get shape() {
      const _shape = { ...schema._zod.def.shape, ...shape };
      assignProp(this, "shape", _shape);
      return _shape;
    },
    checks: schema._zod.def.checks
  };
  return clone(schema, def);
}
function merge(a, b) {
  const def = mergeDefs(a._zod.def, {
    get shape() {
      const _shape = { ...a._zod.def.shape, ...b._zod.def.shape };
      assignProp(this, "shape", _shape);
      return _shape;
    },
    get catchall() {
      return b._zod.def.catchall;
    },
    checks: []
  });
  return clone(a, def);
}
function partial(Class, schema, mask) {
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const oldShape = schema._zod.def.shape;
      const shape = { ...oldShape };
      if (mask) {
        for (const key in mask) {
          if (!(key in oldShape)) {
            throw new Error(`Unrecognized key: "${key}"`);
          }
          if (!mask[key])
            continue;
          shape[key] = Class ? new Class({
            type: "optional",
            innerType: oldShape[key]
          }) : oldShape[key];
        }
      } else {
        for (const key in oldShape) {
          shape[key] = Class ? new Class({
            type: "optional",
            innerType: oldShape[key]
          }) : oldShape[key];
        }
      }
      assignProp(this, "shape", shape);
      return shape;
    },
    checks: []
  });
  return clone(schema, def);
}
function required(Class, schema, mask) {
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const oldShape = schema._zod.def.shape;
      const shape = { ...oldShape };
      if (mask) {
        for (const key in mask) {
          if (!(key in shape)) {
            throw new Error(`Unrecognized key: "${key}"`);
          }
          if (!mask[key])
            continue;
          shape[key] = new Class({
            type: "nonoptional",
            innerType: oldShape[key]
          });
        }
      } else {
        for (const key in oldShape) {
          shape[key] = new Class({
            type: "nonoptional",
            innerType: oldShape[key]
          });
        }
      }
      assignProp(this, "shape", shape);
      return shape;
    },
    checks: []
  });
  return clone(schema, def);
}
function aborted(x, startIndex = 0) {
  if (x.aborted === true)
    return true;
  for (let i = startIndex;i < x.issues.length; i++) {
    if (x.issues[i]?.continue !== true) {
      return true;
    }
  }
  return false;
}
function prefixIssues(path, issues) {
  return issues.map((iss) => {
    var _a;
    (_a = iss).path ?? (_a.path = []);
    iss.path.unshift(path);
    return iss;
  });
}
function unwrapMessage(message) {
  return typeof message === "string" ? message : message?.message;
}
function finalizeIssue(iss, ctx, config2) {
  const full = { ...iss, path: iss.path ?? [] };
  if (!iss.message) {
    const message = unwrapMessage(iss.inst?._zod.def?.error?.(iss)) ?? unwrapMessage(ctx?.error?.(iss)) ?? unwrapMessage(config2.customError?.(iss)) ?? unwrapMessage(config2.localeError?.(iss)) ?? "Invalid input";
    full.message = message;
  }
  delete full.inst;
  delete full.continue;
  if (!ctx?.reportInput) {
    delete full.input;
  }
  return full;
}
function getSizableOrigin(input) {
  if (input instanceof Set)
    return "set";
  if (input instanceof Map)
    return "map";
  if (input instanceof File)
    return "file";
  return "unknown";
}
function getLengthableOrigin(input) {
  if (Array.isArray(input))
    return "array";
  if (typeof input === "string")
    return "string";
  return "unknown";
}
function issue(...args) {
  const [iss, input, inst] = args;
  if (typeof iss === "string") {
    return {
      message: iss,
      code: "custom",
      input,
      inst
    };
  }
  return { ...iss };
}
function cleanEnum(obj) {
  return Object.entries(obj).filter(([k, _]) => {
    return Number.isNaN(Number.parseInt(k, 10));
  }).map((el) => el[1]);
}
function base64ToUint8Array(base64) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0;i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
function uint8ArrayToBase64(bytes) {
  let binaryString = "";
  for (let i = 0;i < bytes.length; i++) {
    binaryString += String.fromCharCode(bytes[i]);
  }
  return btoa(binaryString);
}
function base64urlToUint8Array(base64url) {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - base64.length % 4) % 4);
  return base64ToUint8Array(base64 + padding);
}
function uint8ArrayToBase64url(bytes) {
  return uint8ArrayToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
function hexToUint8Array(hex) {
  const cleanHex = hex.replace(/^0x/, "");
  if (cleanHex.length % 2 !== 0) {
    throw new Error("Invalid hex string length");
  }
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0;i < cleanHex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(cleanHex.slice(i, i + 2), 16);
  }
  return bytes;
}
function uint8ArrayToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

class Class {
  constructor(..._args) {}
}

// node_modules/zod/v4/core/errors.js
var initializer = (inst, def) => {
  inst.name = "$ZodError";
  Object.defineProperty(inst, "_zod", {
    value: inst._zod,
    enumerable: false
  });
  Object.defineProperty(inst, "issues", {
    value: def,
    enumerable: false
  });
  inst.message = JSON.stringify(def, jsonStringifyReplacer, 2);
  Object.defineProperty(inst, "toString", {
    value: () => inst.message,
    enumerable: false
  });
};
var $ZodError = $constructor("$ZodError", initializer);
var $ZodRealError = $constructor("$ZodError", initializer, { Parent: Error });
function flattenError(error, mapper = (issue2) => issue2.message) {
  const fieldErrors = {};
  const formErrors = [];
  for (const sub of error.issues) {
    if (sub.path.length > 0) {
      fieldErrors[sub.path[0]] = fieldErrors[sub.path[0]] || [];
      fieldErrors[sub.path[0]].push(mapper(sub));
    } else {
      formErrors.push(mapper(sub));
    }
  }
  return { formErrors, fieldErrors };
}
function formatError(error, mapper = (issue2) => issue2.message) {
  const fieldErrors = { _errors: [] };
  const processError = (error2) => {
    for (const issue2 of error2.issues) {
      if (issue2.code === "invalid_union" && issue2.errors.length) {
        issue2.errors.map((issues) => processError({ issues }));
      } else if (issue2.code === "invalid_key") {
        processError({ issues: issue2.issues });
      } else if (issue2.code === "invalid_element") {
        processError({ issues: issue2.issues });
      } else if (issue2.path.length === 0) {
        fieldErrors._errors.push(mapper(issue2));
      } else {
        let curr = fieldErrors;
        let i = 0;
        while (i < issue2.path.length) {
          const el = issue2.path[i];
          const terminal = i === issue2.path.length - 1;
          if (!terminal) {
            curr[el] = curr[el] || { _errors: [] };
          } else {
            curr[el] = curr[el] || { _errors: [] };
            curr[el]._errors.push(mapper(issue2));
          }
          curr = curr[el];
          i++;
        }
      }
    }
  };
  processError(error);
  return fieldErrors;
}
function treeifyError(error, mapper = (issue2) => issue2.message) {
  const result = { errors: [] };
  const processError = (error2, path = []) => {
    var _a, _b;
    for (const issue2 of error2.issues) {
      if (issue2.code === "invalid_union" && issue2.errors.length) {
        issue2.errors.map((issues) => processError({ issues }, issue2.path));
      } else if (issue2.code === "invalid_key") {
        processError({ issues: issue2.issues }, issue2.path);
      } else if (issue2.code === "invalid_element") {
        processError({ issues: issue2.issues }, issue2.path);
      } else {
        const fullpath = [...path, ...issue2.path];
        if (fullpath.length === 0) {
          result.errors.push(mapper(issue2));
          continue;
        }
        let curr = result;
        let i = 0;
        while (i < fullpath.length) {
          const el = fullpath[i];
          const terminal = i === fullpath.length - 1;
          if (typeof el === "string") {
            curr.properties ?? (curr.properties = {});
            (_a = curr.properties)[el] ?? (_a[el] = { errors: [] });
            curr = curr.properties[el];
          } else {
            curr.items ?? (curr.items = []);
            (_b = curr.items)[el] ?? (_b[el] = { errors: [] });
            curr = curr.items[el];
          }
          if (terminal) {
            curr.errors.push(mapper(issue2));
          }
          i++;
        }
      }
    }
  };
  processError(error);
  return result;
}
function toDotPath(_path) {
  const segs = [];
  const path = _path.map((seg) => typeof seg === "object" ? seg.key : seg);
  for (const seg of path) {
    if (typeof seg === "number")
      segs.push(`[${seg}]`);
    else if (typeof seg === "symbol")
      segs.push(`[${JSON.stringify(String(seg))}]`);
    else if (/[^\w$]/.test(seg))
      segs.push(`[${JSON.stringify(seg)}]`);
    else {
      if (segs.length)
        segs.push(".");
      segs.push(seg);
    }
  }
  return segs.join("");
}
function prettifyError(error) {
  const lines = [];
  const issues = [...error.issues].sort((a, b) => (a.path ?? []).length - (b.path ?? []).length);
  for (const issue2 of issues) {
    lines.push(`✖ ${issue2.message}`);
    if (issue2.path?.length)
      lines.push(`  → at ${toDotPath(issue2.path)}`);
  }
  return lines.join(`
`);
}

// node_modules/zod/v4/core/parse.js
var _parse = (_Err) => (schema, value, _ctx, _params) => {
  const ctx = _ctx ? Object.assign(_ctx, { async: false }) : { async: false };
  const result = schema._zod.run({ value, issues: [] }, ctx);
  if (result instanceof Promise) {
    throw new $ZodAsyncError;
  }
  if (result.issues.length) {
    const e = new (_params?.Err ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
    captureStackTrace(e, _params?.callee);
    throw e;
  }
  return result.value;
};
var parse = /* @__PURE__ */ _parse($ZodRealError);
var _parseAsync = (_Err) => async (schema, value, _ctx, params) => {
  const ctx = _ctx ? Object.assign(_ctx, { async: true }) : { async: true };
  let result = schema._zod.run({ value, issues: [] }, ctx);
  if (result instanceof Promise)
    result = await result;
  if (result.issues.length) {
    const e = new (params?.Err ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
    captureStackTrace(e, params?.callee);
    throw e;
  }
  return result.value;
};
var parseAsync = /* @__PURE__ */ _parseAsync($ZodRealError);
var _safeParse = (_Err) => (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, async: false } : { async: false };
  const result = schema._zod.run({ value, issues: [] }, ctx);
  if (result instanceof Promise) {
    throw new $ZodAsyncError;
  }
  return result.issues.length ? {
    success: false,
    error: new (_Err ?? $ZodError)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
  } : { success: true, data: result.value };
};
var safeParse = /* @__PURE__ */ _safeParse($ZodRealError);
var _safeParseAsync = (_Err) => async (schema, value, _ctx) => {
  const ctx = _ctx ? Object.assign(_ctx, { async: true }) : { async: true };
  let result = schema._zod.run({ value, issues: [] }, ctx);
  if (result instanceof Promise)
    result = await result;
  return result.issues.length ? {
    success: false,
    error: new _Err(result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
  } : { success: true, data: result.value };
};
var safeParseAsync = /* @__PURE__ */ _safeParseAsync($ZodRealError);
var _encode = (_Err) => (schema, value, _ctx) => {
  const ctx = _ctx ? Object.assign(_ctx, { direction: "backward" }) : { direction: "backward" };
  return _parse(_Err)(schema, value, ctx);
};
var encode = /* @__PURE__ */ _encode($ZodRealError);
var _decode = (_Err) => (schema, value, _ctx) => {
  return _parse(_Err)(schema, value, _ctx);
};
var decode = /* @__PURE__ */ _decode($ZodRealError);
var _encodeAsync = (_Err) => async (schema, value, _ctx) => {
  const ctx = _ctx ? Object.assign(_ctx, { direction: "backward" }) : { direction: "backward" };
  return _parseAsync(_Err)(schema, value, ctx);
};
var encodeAsync = /* @__PURE__ */ _encodeAsync($ZodRealError);
var _decodeAsync = (_Err) => async (schema, value, _ctx) => {
  return _parseAsync(_Err)(schema, value, _ctx);
};
var decodeAsync = /* @__PURE__ */ _decodeAsync($ZodRealError);
var _safeEncode = (_Err) => (schema, value, _ctx) => {
  const ctx = _ctx ? Object.assign(_ctx, { direction: "backward" }) : { direction: "backward" };
  return _safeParse(_Err)(schema, value, ctx);
};
var safeEncode = /* @__PURE__ */ _safeEncode($ZodRealError);
var _safeDecode = (_Err) => (schema, value, _ctx) => {
  return _safeParse(_Err)(schema, value, _ctx);
};
var safeDecode = /* @__PURE__ */ _safeDecode($ZodRealError);
var _safeEncodeAsync = (_Err) => async (schema, value, _ctx) => {
  const ctx = _ctx ? Object.assign(_ctx, { direction: "backward" }) : { direction: "backward" };
  return _safeParseAsync(_Err)(schema, value, ctx);
};
var safeEncodeAsync = /* @__PURE__ */ _safeEncodeAsync($ZodRealError);
var _safeDecodeAsync = (_Err) => async (schema, value, _ctx) => {
  return _safeParseAsync(_Err)(schema, value, _ctx);
};
var safeDecodeAsync = /* @__PURE__ */ _safeDecodeAsync($ZodRealError);
// node_modules/zod/v4/core/regexes.js
var exports_regexes = {};
__export(exports_regexes, {
  xid: () => xid,
  uuid7: () => uuid7,
  uuid6: () => uuid6,
  uuid4: () => uuid4,
  uuid: () => uuid,
  uppercase: () => uppercase,
  unicodeEmail: () => unicodeEmail,
  undefined: () => _undefined,
  ulid: () => ulid,
  time: () => time,
  string: () => string,
  sha512_hex: () => sha512_hex,
  sha512_base64url: () => sha512_base64url,
  sha512_base64: () => sha512_base64,
  sha384_hex: () => sha384_hex,
  sha384_base64url: () => sha384_base64url,
  sha384_base64: () => sha384_base64,
  sha256_hex: () => sha256_hex,
  sha256_base64url: () => sha256_base64url,
  sha256_base64: () => sha256_base64,
  sha1_hex: () => sha1_hex,
  sha1_base64url: () => sha1_base64url,
  sha1_base64: () => sha1_base64,
  rfc5322Email: () => rfc5322Email,
  number: () => number,
  null: () => _null,
  nanoid: () => nanoid,
  md5_hex: () => md5_hex,
  md5_base64url: () => md5_base64url,
  md5_base64: () => md5_base64,
  lowercase: () => lowercase,
  ksuid: () => ksuid,
  ipv6: () => ipv6,
  ipv4: () => ipv4,
  integer: () => integer,
  idnEmail: () => idnEmail,
  html5Email: () => html5Email,
  hostname: () => hostname,
  hex: () => hex,
  guid: () => guid,
  extendedDuration: () => extendedDuration,
  emoji: () => emoji,
  email: () => email,
  e164: () => e164,
  duration: () => duration,
  domain: () => domain,
  datetime: () => datetime,
  date: () => date,
  cuid2: () => cuid2,
  cuid: () => cuid,
  cidrv6: () => cidrv6,
  cidrv4: () => cidrv4,
  browserEmail: () => browserEmail,
  boolean: () => boolean,
  bigint: () => bigint,
  base64url: () => base64url,
  base64: () => base64
});
var cuid = /^[cC][^\s-]{8,}$/;
var cuid2 = /^[0-9a-z]+$/;
var ulid = /^[0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{26}$/;
var xid = /^[0-9a-vA-V]{20}$/;
var ksuid = /^[A-Za-z0-9]{27}$/;
var nanoid = /^[a-zA-Z0-9_-]{21}$/;
var duration = /^P(?:(\d+W)|(?!.*W)(?=\d|T\d)(\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+([.,]\d+)?S)?)?)$/;
var extendedDuration = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
var guid = /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;
var uuid = (version) => {
  if (!version)
    return /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/;
  return new RegExp(`^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-${version}[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$`);
};
var uuid4 = /* @__PURE__ */ uuid(4);
var uuid6 = /* @__PURE__ */ uuid(6);
var uuid7 = /* @__PURE__ */ uuid(7);
var email = /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;
var html5Email = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
var rfc5322Email = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
var unicodeEmail = /^[^\s@"]{1,64}@[^\s@]{1,255}$/u;
var idnEmail = unicodeEmail;
var browserEmail = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
var _emoji = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
function emoji() {
  return new RegExp(_emoji, "u");
}
var ipv4 = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
var ipv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))$/;
var cidrv4 = /^((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/([0-9]|[1-2][0-9]|3[0-2])$/;
var cidrv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|::|([0-9a-fA-F]{1,4})?::([0-9a-fA-F]{1,4}:?){0,6})\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
var base64 = /^$|^(?:[0-9a-zA-Z+/]{4})*(?:(?:[0-9a-zA-Z+/]{2}==)|(?:[0-9a-zA-Z+/]{3}=))?$/;
var base64url = /^[A-Za-z0-9_-]*$/;
var hostname = /^(?=.{1,253}\.?$)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[-0-9a-zA-Z]{0,61}[0-9a-zA-Z])?)*\.?$/;
var domain = /^([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
var e164 = /^\+(?:[0-9]){6,14}[0-9]$/;
var dateSource = `(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))`;
var date = /* @__PURE__ */ new RegExp(`^${dateSource}$`);
function timeSource(args) {
  const hhmm = `(?:[01]\\d|2[0-3]):[0-5]\\d`;
  const regex = typeof args.precision === "number" ? args.precision === -1 ? `${hhmm}` : args.precision === 0 ? `${hhmm}:[0-5]\\d` : `${hhmm}:[0-5]\\d\\.\\d{${args.precision}}` : `${hhmm}(?::[0-5]\\d(?:\\.\\d+)?)?`;
  return regex;
}
function time(args) {
  return new RegExp(`^${timeSource(args)}$`);
}
function datetime(args) {
  const time2 = timeSource({ precision: args.precision });
  const opts = ["Z"];
  if (args.local)
    opts.push("");
  if (args.offset)
    opts.push(`([+-](?:[01]\\d|2[0-3]):[0-5]\\d)`);
  const timeRegex = `${time2}(?:${opts.join("|")})`;
  return new RegExp(`^${dateSource}T(?:${timeRegex})$`);
}
var string = (params) => {
  const regex = params ? `[\\s\\S]{${params?.minimum ?? 0},${params?.maximum ?? ""}}` : `[\\s\\S]*`;
  return new RegExp(`^${regex}$`);
};
var bigint = /^-?\d+n?$/;
var integer = /^-?\d+$/;
var number = /^-?\d+(?:\.\d+)?/;
var boolean = /^(?:true|false)$/i;
var _null = /^null$/i;
var _undefined = /^undefined$/i;
var lowercase = /^[^A-Z]*$/;
var uppercase = /^[^a-z]*$/;
var hex = /^[0-9a-fA-F]*$/;
function fixedBase64(bodyLength, padding) {
  return new RegExp(`^[A-Za-z0-9+/]{${bodyLength}}${padding}$`);
}
function fixedBase64url(length) {
  return new RegExp(`^[A-Za-z0-9_-]{${length}}$`);
}
var md5_hex = /^[0-9a-fA-F]{32}$/;
var md5_base64 = /* @__PURE__ */ fixedBase64(22, "==");
var md5_base64url = /* @__PURE__ */ fixedBase64url(22);
var sha1_hex = /^[0-9a-fA-F]{40}$/;
var sha1_base64 = /* @__PURE__ */ fixedBase64(27, "=");
var sha1_base64url = /* @__PURE__ */ fixedBase64url(27);
var sha256_hex = /^[0-9a-fA-F]{64}$/;
var sha256_base64 = /* @__PURE__ */ fixedBase64(43, "=");
var sha256_base64url = /* @__PURE__ */ fixedBase64url(43);
var sha384_hex = /^[0-9a-fA-F]{96}$/;
var sha384_base64 = /* @__PURE__ */ fixedBase64(64, "");
var sha384_base64url = /* @__PURE__ */ fixedBase64url(64);
var sha512_hex = /^[0-9a-fA-F]{128}$/;
var sha512_base64 = /* @__PURE__ */ fixedBase64(86, "==");
var sha512_base64url = /* @__PURE__ */ fixedBase64url(86);

// node_modules/zod/v4/core/checks.js
var $ZodCheck = /* @__PURE__ */ $constructor("$ZodCheck", (inst, def) => {
  var _a;
  inst._zod ?? (inst._zod = {});
  inst._zod.def = def;
  (_a = inst._zod).onattach ?? (_a.onattach = []);
});
var numericOriginMap = {
  number: "number",
  bigint: "bigint",
  object: "date"
};
var $ZodCheckLessThan = /* @__PURE__ */ $constructor("$ZodCheckLessThan", (inst, def) => {
  $ZodCheck.init(inst, def);
  const origin = numericOriginMap[typeof def.value];
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    const curr = (def.inclusive ? bag.maximum : bag.exclusiveMaximum) ?? Number.POSITIVE_INFINITY;
    if (def.value < curr) {
      if (def.inclusive)
        bag.maximum = def.value;
      else
        bag.exclusiveMaximum = def.value;
    }
  });
  inst._zod.check = (payload) => {
    if (def.inclusive ? payload.value <= def.value : payload.value < def.value) {
      return;
    }
    payload.issues.push({
      origin,
      code: "too_big",
      maximum: def.value,
      input: payload.value,
      inclusive: def.inclusive,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckGreaterThan = /* @__PURE__ */ $constructor("$ZodCheckGreaterThan", (inst, def) => {
  $ZodCheck.init(inst, def);
  const origin = numericOriginMap[typeof def.value];
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    const curr = (def.inclusive ? bag.minimum : bag.exclusiveMinimum) ?? Number.NEGATIVE_INFINITY;
    if (def.value > curr) {
      if (def.inclusive)
        bag.minimum = def.value;
      else
        bag.exclusiveMinimum = def.value;
    }
  });
  inst._zod.check = (payload) => {
    if (def.inclusive ? payload.value >= def.value : payload.value > def.value) {
      return;
    }
    payload.issues.push({
      origin,
      code: "too_small",
      minimum: def.value,
      input: payload.value,
      inclusive: def.inclusive,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckMultipleOf = /* @__PURE__ */ $constructor("$ZodCheckMultipleOf", (inst, def) => {
  $ZodCheck.init(inst, def);
  inst._zod.onattach.push((inst2) => {
    var _a;
    (_a = inst2._zod.bag).multipleOf ?? (_a.multipleOf = def.value);
  });
  inst._zod.check = (payload) => {
    if (typeof payload.value !== typeof def.value)
      throw new Error("Cannot mix number and bigint in multiple_of check.");
    const isMultiple = typeof payload.value === "bigint" ? payload.value % def.value === BigInt(0) : floatSafeRemainder(payload.value, def.value) === 0;
    if (isMultiple)
      return;
    payload.issues.push({
      origin: typeof payload.value,
      code: "not_multiple_of",
      divisor: def.value,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckNumberFormat = /* @__PURE__ */ $constructor("$ZodCheckNumberFormat", (inst, def) => {
  $ZodCheck.init(inst, def);
  def.format = def.format || "float64";
  const isInt = def.format?.includes("int");
  const origin = isInt ? "int" : "number";
  const [minimum, maximum] = NUMBER_FORMAT_RANGES[def.format];
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    bag.format = def.format;
    bag.minimum = minimum;
    bag.maximum = maximum;
    if (isInt)
      bag.pattern = integer;
  });
  inst._zod.check = (payload) => {
    const input = payload.value;
    if (isInt) {
      if (!Number.isInteger(input)) {
        payload.issues.push({
          expected: origin,
          format: def.format,
          code: "invalid_type",
          continue: false,
          input,
          inst
        });
        return;
      }
      if (!Number.isSafeInteger(input)) {
        if (input > 0) {
          payload.issues.push({
            input,
            code: "too_big",
            maximum: Number.MAX_SAFE_INTEGER,
            note: "Integers must be within the safe integer range.",
            inst,
            origin,
            continue: !def.abort
          });
        } else {
          payload.issues.push({
            input,
            code: "too_small",
            minimum: Number.MIN_SAFE_INTEGER,
            note: "Integers must be within the safe integer range.",
            inst,
            origin,
            continue: !def.abort
          });
        }
        return;
      }
    }
    if (input < minimum) {
      payload.issues.push({
        origin: "number",
        input,
        code: "too_small",
        minimum,
        inclusive: true,
        inst,
        continue: !def.abort
      });
    }
    if (input > maximum) {
      payload.issues.push({
        origin: "number",
        input,
        code: "too_big",
        maximum,
        inst
      });
    }
  };
});
var $ZodCheckBigIntFormat = /* @__PURE__ */ $constructor("$ZodCheckBigIntFormat", (inst, def) => {
  $ZodCheck.init(inst, def);
  const [minimum, maximum] = BIGINT_FORMAT_RANGES[def.format];
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    bag.format = def.format;
    bag.minimum = minimum;
    bag.maximum = maximum;
  });
  inst._zod.check = (payload) => {
    const input = payload.value;
    if (input < minimum) {
      payload.issues.push({
        origin: "bigint",
        input,
        code: "too_small",
        minimum,
        inclusive: true,
        inst,
        continue: !def.abort
      });
    }
    if (input > maximum) {
      payload.issues.push({
        origin: "bigint",
        input,
        code: "too_big",
        maximum,
        inst
      });
    }
  };
});
var $ZodCheckMaxSize = /* @__PURE__ */ $constructor("$ZodCheckMaxSize", (inst, def) => {
  var _a;
  $ZodCheck.init(inst, def);
  (_a = inst._zod.def).when ?? (_a.when = (payload) => {
    const val = payload.value;
    return !nullish(val) && val.size !== undefined;
  });
  inst._zod.onattach.push((inst2) => {
    const curr = inst2._zod.bag.maximum ?? Number.POSITIVE_INFINITY;
    if (def.maximum < curr)
      inst2._zod.bag.maximum = def.maximum;
  });
  inst._zod.check = (payload) => {
    const input = payload.value;
    const size = input.size;
    if (size <= def.maximum)
      return;
    payload.issues.push({
      origin: getSizableOrigin(input),
      code: "too_big",
      maximum: def.maximum,
      inclusive: true,
      input,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckMinSize = /* @__PURE__ */ $constructor("$ZodCheckMinSize", (inst, def) => {
  var _a;
  $ZodCheck.init(inst, def);
  (_a = inst._zod.def).when ?? (_a.when = (payload) => {
    const val = payload.value;
    return !nullish(val) && val.size !== undefined;
  });
  inst._zod.onattach.push((inst2) => {
    const curr = inst2._zod.bag.minimum ?? Number.NEGATIVE_INFINITY;
    if (def.minimum > curr)
      inst2._zod.bag.minimum = def.minimum;
  });
  inst._zod.check = (payload) => {
    const input = payload.value;
    const size = input.size;
    if (size >= def.minimum)
      return;
    payload.issues.push({
      origin: getSizableOrigin(input),
      code: "too_small",
      minimum: def.minimum,
      inclusive: true,
      input,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckSizeEquals = /* @__PURE__ */ $constructor("$ZodCheckSizeEquals", (inst, def) => {
  var _a;
  $ZodCheck.init(inst, def);
  (_a = inst._zod.def).when ?? (_a.when = (payload) => {
    const val = payload.value;
    return !nullish(val) && val.size !== undefined;
  });
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    bag.minimum = def.size;
    bag.maximum = def.size;
    bag.size = def.size;
  });
  inst._zod.check = (payload) => {
    const input = payload.value;
    const size = input.size;
    if (size === def.size)
      return;
    const tooBig = size > def.size;
    payload.issues.push({
      origin: getSizableOrigin(input),
      ...tooBig ? { code: "too_big", maximum: def.size } : { code: "too_small", minimum: def.size },
      inclusive: true,
      exact: true,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckMaxLength = /* @__PURE__ */ $constructor("$ZodCheckMaxLength", (inst, def) => {
  var _a;
  $ZodCheck.init(inst, def);
  (_a = inst._zod.def).when ?? (_a.when = (payload) => {
    const val = payload.value;
    return !nullish(val) && val.length !== undefined;
  });
  inst._zod.onattach.push((inst2) => {
    const curr = inst2._zod.bag.maximum ?? Number.POSITIVE_INFINITY;
    if (def.maximum < curr)
      inst2._zod.bag.maximum = def.maximum;
  });
  inst._zod.check = (payload) => {
    const input = payload.value;
    const length = input.length;
    if (length <= def.maximum)
      return;
    const origin = getLengthableOrigin(input);
    payload.issues.push({
      origin,
      code: "too_big",
      maximum: def.maximum,
      inclusive: true,
      input,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckMinLength = /* @__PURE__ */ $constructor("$ZodCheckMinLength", (inst, def) => {
  var _a;
  $ZodCheck.init(inst, def);
  (_a = inst._zod.def).when ?? (_a.when = (payload) => {
    const val = payload.value;
    return !nullish(val) && val.length !== undefined;
  });
  inst._zod.onattach.push((inst2) => {
    const curr = inst2._zod.bag.minimum ?? Number.NEGATIVE_INFINITY;
    if (def.minimum > curr)
      inst2._zod.bag.minimum = def.minimum;
  });
  inst._zod.check = (payload) => {
    const input = payload.value;
    const length = input.length;
    if (length >= def.minimum)
      return;
    const origin = getLengthableOrigin(input);
    payload.issues.push({
      origin,
      code: "too_small",
      minimum: def.minimum,
      inclusive: true,
      input,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckLengthEquals = /* @__PURE__ */ $constructor("$ZodCheckLengthEquals", (inst, def) => {
  var _a;
  $ZodCheck.init(inst, def);
  (_a = inst._zod.def).when ?? (_a.when = (payload) => {
    const val = payload.value;
    return !nullish(val) && val.length !== undefined;
  });
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    bag.minimum = def.length;
    bag.maximum = def.length;
    bag.length = def.length;
  });
  inst._zod.check = (payload) => {
    const input = payload.value;
    const length = input.length;
    if (length === def.length)
      return;
    const origin = getLengthableOrigin(input);
    const tooBig = length > def.length;
    payload.issues.push({
      origin,
      ...tooBig ? { code: "too_big", maximum: def.length } : { code: "too_small", minimum: def.length },
      inclusive: true,
      exact: true,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckStringFormat = /* @__PURE__ */ $constructor("$ZodCheckStringFormat", (inst, def) => {
  var _a, _b;
  $ZodCheck.init(inst, def);
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    bag.format = def.format;
    if (def.pattern) {
      bag.patterns ?? (bag.patterns = new Set);
      bag.patterns.add(def.pattern);
    }
  });
  if (def.pattern)
    (_a = inst._zod).check ?? (_a.check = (payload) => {
      def.pattern.lastIndex = 0;
      if (def.pattern.test(payload.value))
        return;
      payload.issues.push({
        origin: "string",
        code: "invalid_format",
        format: def.format,
        input: payload.value,
        ...def.pattern ? { pattern: def.pattern.toString() } : {},
        inst,
        continue: !def.abort
      });
    });
  else
    (_b = inst._zod).check ?? (_b.check = () => {});
});
var $ZodCheckRegex = /* @__PURE__ */ $constructor("$ZodCheckRegex", (inst, def) => {
  $ZodCheckStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    def.pattern.lastIndex = 0;
    if (def.pattern.test(payload.value))
      return;
    payload.issues.push({
      origin: "string",
      code: "invalid_format",
      format: "regex",
      input: payload.value,
      pattern: def.pattern.toString(),
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckLowerCase = /* @__PURE__ */ $constructor("$ZodCheckLowerCase", (inst, def) => {
  def.pattern ?? (def.pattern = lowercase);
  $ZodCheckStringFormat.init(inst, def);
});
var $ZodCheckUpperCase = /* @__PURE__ */ $constructor("$ZodCheckUpperCase", (inst, def) => {
  def.pattern ?? (def.pattern = uppercase);
  $ZodCheckStringFormat.init(inst, def);
});
var $ZodCheckIncludes = /* @__PURE__ */ $constructor("$ZodCheckIncludes", (inst, def) => {
  $ZodCheck.init(inst, def);
  const escapedRegex = escapeRegex(def.includes);
  const pattern = new RegExp(typeof def.position === "number" ? `^.{${def.position}}${escapedRegex}` : escapedRegex);
  def.pattern = pattern;
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    bag.patterns ?? (bag.patterns = new Set);
    bag.patterns.add(pattern);
  });
  inst._zod.check = (payload) => {
    if (payload.value.includes(def.includes, def.position))
      return;
    payload.issues.push({
      origin: "string",
      code: "invalid_format",
      format: "includes",
      includes: def.includes,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckStartsWith = /* @__PURE__ */ $constructor("$ZodCheckStartsWith", (inst, def) => {
  $ZodCheck.init(inst, def);
  const pattern = new RegExp(`^${escapeRegex(def.prefix)}.*`);
  def.pattern ?? (def.pattern = pattern);
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    bag.patterns ?? (bag.patterns = new Set);
    bag.patterns.add(pattern);
  });
  inst._zod.check = (payload) => {
    if (payload.value.startsWith(def.prefix))
      return;
    payload.issues.push({
      origin: "string",
      code: "invalid_format",
      format: "starts_with",
      prefix: def.prefix,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckEndsWith = /* @__PURE__ */ $constructor("$ZodCheckEndsWith", (inst, def) => {
  $ZodCheck.init(inst, def);
  const pattern = new RegExp(`.*${escapeRegex(def.suffix)}$`);
  def.pattern ?? (def.pattern = pattern);
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    bag.patterns ?? (bag.patterns = new Set);
    bag.patterns.add(pattern);
  });
  inst._zod.check = (payload) => {
    if (payload.value.endsWith(def.suffix))
      return;
    payload.issues.push({
      origin: "string",
      code: "invalid_format",
      format: "ends_with",
      suffix: def.suffix,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
function handleCheckPropertyResult(result, payload, property) {
  if (result.issues.length) {
    payload.issues.push(...prefixIssues(property, result.issues));
  }
}
var $ZodCheckProperty = /* @__PURE__ */ $constructor("$ZodCheckProperty", (inst, def) => {
  $ZodCheck.init(inst, def);
  inst._zod.check = (payload) => {
    const result = def.schema._zod.run({
      value: payload.value[def.property],
      issues: []
    }, {});
    if (result instanceof Promise) {
      return result.then((result2) => handleCheckPropertyResult(result2, payload, def.property));
    }
    handleCheckPropertyResult(result, payload, def.property);
    return;
  };
});
var $ZodCheckMimeType = /* @__PURE__ */ $constructor("$ZodCheckMimeType", (inst, def) => {
  $ZodCheck.init(inst, def);
  const mimeSet = new Set(def.mime);
  inst._zod.onattach.push((inst2) => {
    inst2._zod.bag.mime = def.mime;
  });
  inst._zod.check = (payload) => {
    if (mimeSet.has(payload.value.type))
      return;
    payload.issues.push({
      code: "invalid_value",
      values: def.mime,
      input: payload.value.type,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckOverwrite = /* @__PURE__ */ $constructor("$ZodCheckOverwrite", (inst, def) => {
  $ZodCheck.init(inst, def);
  inst._zod.check = (payload) => {
    payload.value = def.tx(payload.value);
  };
});

// node_modules/zod/v4/core/doc.js
class Doc {
  constructor(args = []) {
    this.content = [];
    this.indent = 0;
    if (this)
      this.args = args;
  }
  indented(fn) {
    this.indent += 1;
    fn(this);
    this.indent -= 1;
  }
  write(arg) {
    if (typeof arg === "function") {
      arg(this, { execution: "sync" });
      arg(this, { execution: "async" });
      return;
    }
    const content = arg;
    const lines = content.split(`
`).filter((x) => x);
    const minIndent = Math.min(...lines.map((x) => x.length - x.trimStart().length));
    const dedented = lines.map((x) => x.slice(minIndent)).map((x) => " ".repeat(this.indent * 2) + x);
    for (const line of dedented) {
      this.content.push(line);
    }
  }
  compile() {
    const F = Function;
    const args = this?.args;
    const content = this?.content ?? [``];
    const lines = [...content.map((x) => `  ${x}`)];
    return new F(...args, lines.join(`
`));
  }
}

// node_modules/zod/v4/core/versions.js
var version = {
  major: 4,
  minor: 1,
  patch: 12
};

// node_modules/zod/v4/core/schemas.js
var $ZodType = /* @__PURE__ */ $constructor("$ZodType", (inst, def) => {
  var _a;
  inst ?? (inst = {});
  inst._zod.def = def;
  inst._zod.bag = inst._zod.bag || {};
  inst._zod.version = version;
  const checks = [...inst._zod.def.checks ?? []];
  if (inst._zod.traits.has("$ZodCheck")) {
    checks.unshift(inst);
  }
  for (const ch of checks) {
    for (const fn of ch._zod.onattach) {
      fn(inst);
    }
  }
  if (checks.length === 0) {
    (_a = inst._zod).deferred ?? (_a.deferred = []);
    inst._zod.deferred?.push(() => {
      inst._zod.run = inst._zod.parse;
    });
  } else {
    const runChecks = (payload, checks2, ctx) => {
      let isAborted = aborted(payload);
      let asyncResult;
      for (const ch of checks2) {
        if (ch._zod.def.when) {
          const shouldRun = ch._zod.def.when(payload);
          if (!shouldRun)
            continue;
        } else if (isAborted) {
          continue;
        }
        const currLen = payload.issues.length;
        const _ = ch._zod.check(payload);
        if (_ instanceof Promise && ctx?.async === false) {
          throw new $ZodAsyncError;
        }
        if (asyncResult || _ instanceof Promise) {
          asyncResult = (asyncResult ?? Promise.resolve()).then(async () => {
            await _;
            const nextLen = payload.issues.length;
            if (nextLen === currLen)
              return;
            if (!isAborted)
              isAborted = aborted(payload, currLen);
          });
        } else {
          const nextLen = payload.issues.length;
          if (nextLen === currLen)
            continue;
          if (!isAborted)
            isAborted = aborted(payload, currLen);
        }
      }
      if (asyncResult) {
        return asyncResult.then(() => {
          return payload;
        });
      }
      return payload;
    };
    const handleCanaryResult = (canary, payload, ctx) => {
      if (aborted(canary)) {
        canary.aborted = true;
        return canary;
      }
      const checkResult = runChecks(payload, checks, ctx);
      if (checkResult instanceof Promise) {
        if (ctx.async === false)
          throw new $ZodAsyncError;
        return checkResult.then((checkResult2) => inst._zod.parse(checkResult2, ctx));
      }
      return inst._zod.parse(checkResult, ctx);
    };
    inst._zod.run = (payload, ctx) => {
      if (ctx.skipChecks) {
        return inst._zod.parse(payload, ctx);
      }
      if (ctx.direction === "backward") {
        const canary = inst._zod.parse({ value: payload.value, issues: [] }, { ...ctx, skipChecks: true });
        if (canary instanceof Promise) {
          return canary.then((canary2) => {
            return handleCanaryResult(canary2, payload, ctx);
          });
        }
        return handleCanaryResult(canary, payload, ctx);
      }
      const result = inst._zod.parse(payload, ctx);
      if (result instanceof Promise) {
        if (ctx.async === false)
          throw new $ZodAsyncError;
        return result.then((result2) => runChecks(result2, checks, ctx));
      }
      return runChecks(result, checks, ctx);
    };
  }
  inst["~standard"] = {
    validate: (value) => {
      try {
        const r = safeParse(inst, value);
        return r.success ? { value: r.data } : { issues: r.error?.issues };
      } catch (_) {
        return safeParseAsync(inst, value).then((r) => r.success ? { value: r.data } : { issues: r.error?.issues });
      }
    },
    vendor: "zod",
    version: 1
  };
});
var $ZodString = /* @__PURE__ */ $constructor("$ZodString", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = [...inst?._zod.bag?.patterns ?? []].pop() ?? string(inst._zod.bag);
  inst._zod.parse = (payload, _) => {
    if (def.coerce)
      try {
        payload.value = String(payload.value);
      } catch (_2) {}
    if (typeof payload.value === "string")
      return payload;
    payload.issues.push({
      expected: "string",
      code: "invalid_type",
      input: payload.value,
      inst
    });
    return payload;
  };
});
var $ZodStringFormat = /* @__PURE__ */ $constructor("$ZodStringFormat", (inst, def) => {
  $ZodCheckStringFormat.init(inst, def);
  $ZodString.init(inst, def);
});
var $ZodGUID = /* @__PURE__ */ $constructor("$ZodGUID", (inst, def) => {
  def.pattern ?? (def.pattern = guid);
  $ZodStringFormat.init(inst, def);
});
var $ZodUUID = /* @__PURE__ */ $constructor("$ZodUUID", (inst, def) => {
  if (def.version) {
    const versionMap = {
      v1: 1,
      v2: 2,
      v3: 3,
      v4: 4,
      v5: 5,
      v6: 6,
      v7: 7,
      v8: 8
    };
    const v = versionMap[def.version];
    if (v === undefined)
      throw new Error(`Invalid UUID version: "${def.version}"`);
    def.pattern ?? (def.pattern = uuid(v));
  } else
    def.pattern ?? (def.pattern = uuid());
  $ZodStringFormat.init(inst, def);
});
var $ZodEmail = /* @__PURE__ */ $constructor("$ZodEmail", (inst, def) => {
  def.pattern ?? (def.pattern = email);
  $ZodStringFormat.init(inst, def);
});
var $ZodURL = /* @__PURE__ */ $constructor("$ZodURL", (inst, def) => {
  $ZodStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    try {
      const trimmed = payload.value.trim();
      const url = new URL(trimmed);
      if (def.hostname) {
        def.hostname.lastIndex = 0;
        if (!def.hostname.test(url.hostname)) {
          payload.issues.push({
            code: "invalid_format",
            format: "url",
            note: "Invalid hostname",
            pattern: hostname.source,
            input: payload.value,
            inst,
            continue: !def.abort
          });
        }
      }
      if (def.protocol) {
        def.protocol.lastIndex = 0;
        if (!def.protocol.test(url.protocol.endsWith(":") ? url.protocol.slice(0, -1) : url.protocol)) {
          payload.issues.push({
            code: "invalid_format",
            format: "url",
            note: "Invalid protocol",
            pattern: def.protocol.source,
            input: payload.value,
            inst,
            continue: !def.abort
          });
        }
      }
      if (def.normalize) {
        payload.value = url.href;
      } else {
        payload.value = trimmed;
      }
      return;
    } catch (_) {
      payload.issues.push({
        code: "invalid_format",
        format: "url",
        input: payload.value,
        inst,
        continue: !def.abort
      });
    }
  };
});
var $ZodEmoji = /* @__PURE__ */ $constructor("$ZodEmoji", (inst, def) => {
  def.pattern ?? (def.pattern = emoji());
  $ZodStringFormat.init(inst, def);
});
var $ZodNanoID = /* @__PURE__ */ $constructor("$ZodNanoID", (inst, def) => {
  def.pattern ?? (def.pattern = nanoid);
  $ZodStringFormat.init(inst, def);
});
var $ZodCUID = /* @__PURE__ */ $constructor("$ZodCUID", (inst, def) => {
  def.pattern ?? (def.pattern = cuid);
  $ZodStringFormat.init(inst, def);
});
var $ZodCUID2 = /* @__PURE__ */ $constructor("$ZodCUID2", (inst, def) => {
  def.pattern ?? (def.pattern = cuid2);
  $ZodStringFormat.init(inst, def);
});
var $ZodULID = /* @__PURE__ */ $constructor("$ZodULID", (inst, def) => {
  def.pattern ?? (def.pattern = ulid);
  $ZodStringFormat.init(inst, def);
});
var $ZodXID = /* @__PURE__ */ $constructor("$ZodXID", (inst, def) => {
  def.pattern ?? (def.pattern = xid);
  $ZodStringFormat.init(inst, def);
});
var $ZodKSUID = /* @__PURE__ */ $constructor("$ZodKSUID", (inst, def) => {
  def.pattern ?? (def.pattern = ksuid);
  $ZodStringFormat.init(inst, def);
});
var $ZodISODateTime = /* @__PURE__ */ $constructor("$ZodISODateTime", (inst, def) => {
  def.pattern ?? (def.pattern = datetime(def));
  $ZodStringFormat.init(inst, def);
});
var $ZodISODate = /* @__PURE__ */ $constructor("$ZodISODate", (inst, def) => {
  def.pattern ?? (def.pattern = date);
  $ZodStringFormat.init(inst, def);
});
var $ZodISOTime = /* @__PURE__ */ $constructor("$ZodISOTime", (inst, def) => {
  def.pattern ?? (def.pattern = time(def));
  $ZodStringFormat.init(inst, def);
});
var $ZodISODuration = /* @__PURE__ */ $constructor("$ZodISODuration", (inst, def) => {
  def.pattern ?? (def.pattern = duration);
  $ZodStringFormat.init(inst, def);
});
var $ZodIPv4 = /* @__PURE__ */ $constructor("$ZodIPv4", (inst, def) => {
  def.pattern ?? (def.pattern = ipv4);
  $ZodStringFormat.init(inst, def);
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    bag.format = `ipv4`;
  });
});
var $ZodIPv6 = /* @__PURE__ */ $constructor("$ZodIPv6", (inst, def) => {
  def.pattern ?? (def.pattern = ipv6);
  $ZodStringFormat.init(inst, def);
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    bag.format = `ipv6`;
  });
  inst._zod.check = (payload) => {
    try {
      new URL(`http://[${payload.value}]`);
    } catch {
      payload.issues.push({
        code: "invalid_format",
        format: "ipv6",
        input: payload.value,
        inst,
        continue: !def.abort
      });
    }
  };
});
var $ZodCIDRv4 = /* @__PURE__ */ $constructor("$ZodCIDRv4", (inst, def) => {
  def.pattern ?? (def.pattern = cidrv4);
  $ZodStringFormat.init(inst, def);
});
var $ZodCIDRv6 = /* @__PURE__ */ $constructor("$ZodCIDRv6", (inst, def) => {
  def.pattern ?? (def.pattern = cidrv6);
  $ZodStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    const parts = payload.value.split("/");
    try {
      if (parts.length !== 2)
        throw new Error;
      const [address, prefix] = parts;
      if (!prefix)
        throw new Error;
      const prefixNum = Number(prefix);
      if (`${prefixNum}` !== prefix)
        throw new Error;
      if (prefixNum < 0 || prefixNum > 128)
        throw new Error;
      new URL(`http://[${address}]`);
    } catch {
      payload.issues.push({
        code: "invalid_format",
        format: "cidrv6",
        input: payload.value,
        inst,
        continue: !def.abort
      });
    }
  };
});
function isValidBase64(data) {
  if (data === "")
    return true;
  if (data.length % 4 !== 0)
    return false;
  try {
    atob(data);
    return true;
  } catch {
    return false;
  }
}
var $ZodBase64 = /* @__PURE__ */ $constructor("$ZodBase64", (inst, def) => {
  def.pattern ?? (def.pattern = base64);
  $ZodStringFormat.init(inst, def);
  inst._zod.onattach.push((inst2) => {
    inst2._zod.bag.contentEncoding = "base64";
  });
  inst._zod.check = (payload) => {
    if (isValidBase64(payload.value))
      return;
    payload.issues.push({
      code: "invalid_format",
      format: "base64",
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
function isValidBase64URL(data) {
  if (!base64url.test(data))
    return false;
  const base642 = data.replace(/[-_]/g, (c) => c === "-" ? "+" : "/");
  const padded = base642.padEnd(Math.ceil(base642.length / 4) * 4, "=");
  return isValidBase64(padded);
}
var $ZodBase64URL = /* @__PURE__ */ $constructor("$ZodBase64URL", (inst, def) => {
  def.pattern ?? (def.pattern = base64url);
  $ZodStringFormat.init(inst, def);
  inst._zod.onattach.push((inst2) => {
    inst2._zod.bag.contentEncoding = "base64url";
  });
  inst._zod.check = (payload) => {
    if (isValidBase64URL(payload.value))
      return;
    payload.issues.push({
      code: "invalid_format",
      format: "base64url",
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodE164 = /* @__PURE__ */ $constructor("$ZodE164", (inst, def) => {
  def.pattern ?? (def.pattern = e164);
  $ZodStringFormat.init(inst, def);
});
function isValidJWT(token, algorithm = null) {
  try {
    const tokensParts = token.split(".");
    if (tokensParts.length !== 3)
      return false;
    const [header] = tokensParts;
    if (!header)
      return false;
    const parsedHeader = JSON.parse(atob(header));
    if ("typ" in parsedHeader && parsedHeader?.typ !== "JWT")
      return false;
    if (!parsedHeader.alg)
      return false;
    if (algorithm && (!("alg" in parsedHeader) || parsedHeader.alg !== algorithm))
      return false;
    return true;
  } catch {
    return false;
  }
}
var $ZodJWT = /* @__PURE__ */ $constructor("$ZodJWT", (inst, def) => {
  $ZodStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    if (isValidJWT(payload.value, def.alg))
      return;
    payload.issues.push({
      code: "invalid_format",
      format: "jwt",
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCustomStringFormat = /* @__PURE__ */ $constructor("$ZodCustomStringFormat", (inst, def) => {
  $ZodStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    if (def.fn(payload.value))
      return;
    payload.issues.push({
      code: "invalid_format",
      format: def.format,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodNumber = /* @__PURE__ */ $constructor("$ZodNumber", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = inst._zod.bag.pattern ?? number;
  inst._zod.parse = (payload, _ctx) => {
    if (def.coerce)
      try {
        payload.value = Number(payload.value);
      } catch (_) {}
    const input = payload.value;
    if (typeof input === "number" && !Number.isNaN(input) && Number.isFinite(input)) {
      return payload;
    }
    const received = typeof input === "number" ? Number.isNaN(input) ? "NaN" : !Number.isFinite(input) ? "Infinity" : undefined : undefined;
    payload.issues.push({
      expected: "number",
      code: "invalid_type",
      input,
      inst,
      ...received ? { received } : {}
    });
    return payload;
  };
});
var $ZodNumberFormat = /* @__PURE__ */ $constructor("$ZodNumber", (inst, def) => {
  $ZodCheckNumberFormat.init(inst, def);
  $ZodNumber.init(inst, def);
});
var $ZodBoolean = /* @__PURE__ */ $constructor("$ZodBoolean", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = boolean;
  inst._zod.parse = (payload, _ctx) => {
    if (def.coerce)
      try {
        payload.value = Boolean(payload.value);
      } catch (_) {}
    const input = payload.value;
    if (typeof input === "boolean")
      return payload;
    payload.issues.push({
      expected: "boolean",
      code: "invalid_type",
      input,
      inst
    });
    return payload;
  };
});
var $ZodBigInt = /* @__PURE__ */ $constructor("$ZodBigInt", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = bigint;
  inst._zod.parse = (payload, _ctx) => {
    if (def.coerce)
      try {
        payload.value = BigInt(payload.value);
      } catch (_) {}
    if (typeof payload.value === "bigint")
      return payload;
    payload.issues.push({
      expected: "bigint",
      code: "invalid_type",
      input: payload.value,
      inst
    });
    return payload;
  };
});
var $ZodBigIntFormat = /* @__PURE__ */ $constructor("$ZodBigInt", (inst, def) => {
  $ZodCheckBigIntFormat.init(inst, def);
  $ZodBigInt.init(inst, def);
});
var $ZodSymbol = /* @__PURE__ */ $constructor("$ZodSymbol", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, _ctx) => {
    const input = payload.value;
    if (typeof input === "symbol")
      return payload;
    payload.issues.push({
      expected: "symbol",
      code: "invalid_type",
      input,
      inst
    });
    return payload;
  };
});
var $ZodUndefined = /* @__PURE__ */ $constructor("$ZodUndefined", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = _undefined;
  inst._zod.values = new Set([undefined]);
  inst._zod.optin = "optional";
  inst._zod.optout = "optional";
  inst._zod.parse = (payload, _ctx) => {
    const input = payload.value;
    if (typeof input === "undefined")
      return payload;
    payload.issues.push({
      expected: "undefined",
      code: "invalid_type",
      input,
      inst
    });
    return payload;
  };
});
var $ZodNull = /* @__PURE__ */ $constructor("$ZodNull", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = _null;
  inst._zod.values = new Set([null]);
  inst._zod.parse = (payload, _ctx) => {
    const input = payload.value;
    if (input === null)
      return payload;
    payload.issues.push({
      expected: "null",
      code: "invalid_type",
      input,
      inst
    });
    return payload;
  };
});
var $ZodAny = /* @__PURE__ */ $constructor("$ZodAny", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload) => payload;
});
var $ZodUnknown = /* @__PURE__ */ $constructor("$ZodUnknown", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload) => payload;
});
var $ZodNever = /* @__PURE__ */ $constructor("$ZodNever", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, _ctx) => {
    payload.issues.push({
      expected: "never",
      code: "invalid_type",
      input: payload.value,
      inst
    });
    return payload;
  };
});
var $ZodVoid = /* @__PURE__ */ $constructor("$ZodVoid", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, _ctx) => {
    const input = payload.value;
    if (typeof input === "undefined")
      return payload;
    payload.issues.push({
      expected: "void",
      code: "invalid_type",
      input,
      inst
    });
    return payload;
  };
});
var $ZodDate = /* @__PURE__ */ $constructor("$ZodDate", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, _ctx) => {
    if (def.coerce) {
      try {
        payload.value = new Date(payload.value);
      } catch (_err) {}
    }
    const input = payload.value;
    const isDate = input instanceof Date;
    const isValidDate = isDate && !Number.isNaN(input.getTime());
    if (isValidDate)
      return payload;
    payload.issues.push({
      expected: "date",
      code: "invalid_type",
      input,
      ...isDate ? { received: "Invalid Date" } : {},
      inst
    });
    return payload;
  };
});
function handleArrayResult(result, final, index) {
  if (result.issues.length) {
    final.issues.push(...prefixIssues(index, result.issues));
  }
  final.value[index] = result.value;
}
var $ZodArray = /* @__PURE__ */ $constructor("$ZodArray", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    if (!Array.isArray(input)) {
      payload.issues.push({
        expected: "array",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    }
    payload.value = Array(input.length);
    const proms = [];
    for (let i = 0;i < input.length; i++) {
      const item = input[i];
      const result = def.element._zod.run({
        value: item,
        issues: []
      }, ctx);
      if (result instanceof Promise) {
        proms.push(result.then((result2) => handleArrayResult(result2, payload, i)));
      } else {
        handleArrayResult(result, payload, i);
      }
    }
    if (proms.length) {
      return Promise.all(proms).then(() => payload);
    }
    return payload;
  };
});
function handlePropertyResult(result, final, key, input) {
  if (result.issues.length) {
    final.issues.push(...prefixIssues(key, result.issues));
  }
  if (result.value === undefined) {
    if (key in input) {
      final.value[key] = undefined;
    }
  } else {
    final.value[key] = result.value;
  }
}
function normalizeDef(def) {
  const keys = Object.keys(def.shape);
  for (const k of keys) {
    if (!def.shape?.[k]?._zod?.traits?.has("$ZodType")) {
      throw new Error(`Invalid element at key "${k}": expected a Zod schema`);
    }
  }
  const okeys = optionalKeys(def.shape);
  return {
    ...def,
    keys,
    keySet: new Set(keys),
    numKeys: keys.length,
    optionalKeys: new Set(okeys)
  };
}
function handleCatchall(proms, input, payload, ctx, def, inst) {
  const unrecognized = [];
  const keySet = def.keySet;
  const _catchall = def.catchall._zod;
  const t = _catchall.def.type;
  for (const key of Object.keys(input)) {
    if (keySet.has(key))
      continue;
    if (t === "never") {
      unrecognized.push(key);
      continue;
    }
    const r = _catchall.run({ value: input[key], issues: [] }, ctx);
    if (r instanceof Promise) {
      proms.push(r.then((r2) => handlePropertyResult(r2, payload, key, input)));
    } else {
      handlePropertyResult(r, payload, key, input);
    }
  }
  if (unrecognized.length) {
    payload.issues.push({
      code: "unrecognized_keys",
      keys: unrecognized,
      input,
      inst
    });
  }
  if (!proms.length)
    return payload;
  return Promise.all(proms).then(() => {
    return payload;
  });
}
var $ZodObject = /* @__PURE__ */ $constructor("$ZodObject", (inst, def) => {
  $ZodType.init(inst, def);
  const desc = Object.getOwnPropertyDescriptor(def, "shape");
  if (!desc?.get) {
    const sh = def.shape;
    Object.defineProperty(def, "shape", {
      get: () => {
        const newSh = { ...sh };
        Object.defineProperty(def, "shape", {
          value: newSh
        });
        return newSh;
      }
    });
  }
  const _normalized = cached(() => normalizeDef(def));
  defineLazy(inst._zod, "propValues", () => {
    const shape = def.shape;
    const propValues = {};
    for (const key in shape) {
      const field = shape[key]._zod;
      if (field.values) {
        propValues[key] ?? (propValues[key] = new Set);
        for (const v of field.values)
          propValues[key].add(v);
      }
    }
    return propValues;
  });
  const isObject2 = isObject;
  const catchall = def.catchall;
  let value;
  inst._zod.parse = (payload, ctx) => {
    value ?? (value = _normalized.value);
    const input = payload.value;
    if (!isObject2(input)) {
      payload.issues.push({
        expected: "object",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    }
    payload.value = {};
    const proms = [];
    const shape = value.shape;
    for (const key of value.keys) {
      const el = shape[key];
      const r = el._zod.run({ value: input[key], issues: [] }, ctx);
      if (r instanceof Promise) {
        proms.push(r.then((r2) => handlePropertyResult(r2, payload, key, input)));
      } else {
        handlePropertyResult(r, payload, key, input);
      }
    }
    if (!catchall) {
      return proms.length ? Promise.all(proms).then(() => payload) : payload;
    }
    return handleCatchall(proms, input, payload, ctx, _normalized.value, inst);
  };
});
var $ZodObjectJIT = /* @__PURE__ */ $constructor("$ZodObjectJIT", (inst, def) => {
  $ZodObject.init(inst, def);
  const superParse = inst._zod.parse;
  const _normalized = cached(() => normalizeDef(def));
  const generateFastpass = (shape) => {
    const doc = new Doc(["shape", "payload", "ctx"]);
    const normalized = _normalized.value;
    const parseStr = (key) => {
      const k = esc(key);
      return `shape[${k}]._zod.run({ value: input[${k}], issues: [] }, ctx)`;
    };
    doc.write(`const input = payload.value;`);
    const ids = Object.create(null);
    let counter = 0;
    for (const key of normalized.keys) {
      ids[key] = `key_${counter++}`;
    }
    doc.write(`const newResult = {};`);
    for (const key of normalized.keys) {
      const id = ids[key];
      const k = esc(key);
      doc.write(`const ${id} = ${parseStr(key)};`);
      doc.write(`
        if (${id}.issues.length) {
          payload.issues = payload.issues.concat(${id}.issues.map(iss => ({
            ...iss,
            path: iss.path ? [${k}, ...iss.path] : [${k}]
          })));
        }
        
        
        if (${id}.value === undefined) {
          if (${k} in input) {
            newResult[${k}] = undefined;
          }
        } else {
          newResult[${k}] = ${id}.value;
        }
        
      `);
    }
    doc.write(`payload.value = newResult;`);
    doc.write(`return payload;`);
    const fn = doc.compile();
    return (payload, ctx) => fn(shape, payload, ctx);
  };
  let fastpass;
  const isObject2 = isObject;
  const jit = !globalConfig.jitless;
  const allowsEval2 = allowsEval;
  const fastEnabled = jit && allowsEval2.value;
  const catchall = def.catchall;
  let value;
  inst._zod.parse = (payload, ctx) => {
    value ?? (value = _normalized.value);
    const input = payload.value;
    if (!isObject2(input)) {
      payload.issues.push({
        expected: "object",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    }
    if (jit && fastEnabled && ctx?.async === false && ctx.jitless !== true) {
      if (!fastpass)
        fastpass = generateFastpass(def.shape);
      payload = fastpass(payload, ctx);
      if (!catchall)
        return payload;
      return handleCatchall([], input, payload, ctx, value, inst);
    }
    return superParse(payload, ctx);
  };
});
function handleUnionResults(results, final, inst, ctx) {
  for (const result of results) {
    if (result.issues.length === 0) {
      final.value = result.value;
      return final;
    }
  }
  const nonaborted = results.filter((r) => !aborted(r));
  if (nonaborted.length === 1) {
    final.value = nonaborted[0].value;
    return nonaborted[0];
  }
  final.issues.push({
    code: "invalid_union",
    input: final.value,
    inst,
    errors: results.map((result) => result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
  });
  return final;
}
var $ZodUnion = /* @__PURE__ */ $constructor("$ZodUnion", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "optin", () => def.options.some((o) => o._zod.optin === "optional") ? "optional" : undefined);
  defineLazy(inst._zod, "optout", () => def.options.some((o) => o._zod.optout === "optional") ? "optional" : undefined);
  defineLazy(inst._zod, "values", () => {
    if (def.options.every((o) => o._zod.values)) {
      return new Set(def.options.flatMap((option) => Array.from(option._zod.values)));
    }
    return;
  });
  defineLazy(inst._zod, "pattern", () => {
    if (def.options.every((o) => o._zod.pattern)) {
      const patterns = def.options.map((o) => o._zod.pattern);
      return new RegExp(`^(${patterns.map((p) => cleanRegex(p.source)).join("|")})$`);
    }
    return;
  });
  const single = def.options.length === 1;
  const first = def.options[0]._zod.run;
  inst._zod.parse = (payload, ctx) => {
    if (single) {
      return first(payload, ctx);
    }
    let async = false;
    const results = [];
    for (const option of def.options) {
      const result = option._zod.run({
        value: payload.value,
        issues: []
      }, ctx);
      if (result instanceof Promise) {
        results.push(result);
        async = true;
      } else {
        if (result.issues.length === 0)
          return result;
        results.push(result);
      }
    }
    if (!async)
      return handleUnionResults(results, payload, inst, ctx);
    return Promise.all(results).then((results2) => {
      return handleUnionResults(results2, payload, inst, ctx);
    });
  };
});
var $ZodDiscriminatedUnion = /* @__PURE__ */ $constructor("$ZodDiscriminatedUnion", (inst, def) => {
  $ZodUnion.init(inst, def);
  const _super = inst._zod.parse;
  defineLazy(inst._zod, "propValues", () => {
    const propValues = {};
    for (const option of def.options) {
      const pv = option._zod.propValues;
      if (!pv || Object.keys(pv).length === 0)
        throw new Error(`Invalid discriminated union option at index "${def.options.indexOf(option)}"`);
      for (const [k, v] of Object.entries(pv)) {
        if (!propValues[k])
          propValues[k] = new Set;
        for (const val of v) {
          propValues[k].add(val);
        }
      }
    }
    return propValues;
  });
  const disc = cached(() => {
    const opts = def.options;
    const map = new Map;
    for (const o of opts) {
      const values = o._zod.propValues?.[def.discriminator];
      if (!values || values.size === 0)
        throw new Error(`Invalid discriminated union option at index "${def.options.indexOf(o)}"`);
      for (const v of values) {
        if (map.has(v)) {
          throw new Error(`Duplicate discriminator value "${String(v)}"`);
        }
        map.set(v, o);
      }
    }
    return map;
  });
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    if (!isObject(input)) {
      payload.issues.push({
        code: "invalid_type",
        expected: "object",
        input,
        inst
      });
      return payload;
    }
    const opt = disc.value.get(input?.[def.discriminator]);
    if (opt) {
      return opt._zod.run(payload, ctx);
    }
    if (def.unionFallback) {
      return _super(payload, ctx);
    }
    payload.issues.push({
      code: "invalid_union",
      errors: [],
      note: "No matching discriminator",
      discriminator: def.discriminator,
      input,
      path: [def.discriminator],
      inst
    });
    return payload;
  };
});
var $ZodIntersection = /* @__PURE__ */ $constructor("$ZodIntersection", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    const left = def.left._zod.run({ value: input, issues: [] }, ctx);
    const right = def.right._zod.run({ value: input, issues: [] }, ctx);
    const async = left instanceof Promise || right instanceof Promise;
    if (async) {
      return Promise.all([left, right]).then(([left2, right2]) => {
        return handleIntersectionResults(payload, left2, right2);
      });
    }
    return handleIntersectionResults(payload, left, right);
  };
});
function mergeValues(a, b) {
  if (a === b) {
    return { valid: true, data: a };
  }
  if (a instanceof Date && b instanceof Date && +a === +b) {
    return { valid: true, data: a };
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const bKeys = Object.keys(b);
    const sharedKeys = Object.keys(a).filter((key) => bKeys.indexOf(key) !== -1);
    const newObj = { ...a, ...b };
    for (const key of sharedKeys) {
      const sharedValue = mergeValues(a[key], b[key]);
      if (!sharedValue.valid) {
        return {
          valid: false,
          mergeErrorPath: [key, ...sharedValue.mergeErrorPath]
        };
      }
      newObj[key] = sharedValue.data;
    }
    return { valid: true, data: newObj };
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return { valid: false, mergeErrorPath: [] };
    }
    const newArray = [];
    for (let index = 0;index < a.length; index++) {
      const itemA = a[index];
      const itemB = b[index];
      const sharedValue = mergeValues(itemA, itemB);
      if (!sharedValue.valid) {
        return {
          valid: false,
          mergeErrorPath: [index, ...sharedValue.mergeErrorPath]
        };
      }
      newArray.push(sharedValue.data);
    }
    return { valid: true, data: newArray };
  }
  return { valid: false, mergeErrorPath: [] };
}
function handleIntersectionResults(result, left, right) {
  if (left.issues.length) {
    result.issues.push(...left.issues);
  }
  if (right.issues.length) {
    result.issues.push(...right.issues);
  }
  if (aborted(result))
    return result;
  const merged = mergeValues(left.value, right.value);
  if (!merged.valid) {
    throw new Error(`Unmergable intersection. Error path: ` + `${JSON.stringify(merged.mergeErrorPath)}`);
  }
  result.value = merged.data;
  return result;
}
var $ZodTuple = /* @__PURE__ */ $constructor("$ZodTuple", (inst, def) => {
  $ZodType.init(inst, def);
  const items = def.items;
  const optStart = items.length - [...items].reverse().findIndex((item) => item._zod.optin !== "optional");
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    if (!Array.isArray(input)) {
      payload.issues.push({
        input,
        inst,
        expected: "tuple",
        code: "invalid_type"
      });
      return payload;
    }
    payload.value = [];
    const proms = [];
    if (!def.rest) {
      const tooBig = input.length > items.length;
      const tooSmall = input.length < optStart - 1;
      if (tooBig || tooSmall) {
        payload.issues.push({
          ...tooBig ? { code: "too_big", maximum: items.length } : { code: "too_small", minimum: items.length },
          input,
          inst,
          origin: "array"
        });
        return payload;
      }
    }
    let i = -1;
    for (const item of items) {
      i++;
      if (i >= input.length) {
        if (i >= optStart)
          continue;
      }
      const result = item._zod.run({
        value: input[i],
        issues: []
      }, ctx);
      if (result instanceof Promise) {
        proms.push(result.then((result2) => handleTupleResult(result2, payload, i)));
      } else {
        handleTupleResult(result, payload, i);
      }
    }
    if (def.rest) {
      const rest = input.slice(items.length);
      for (const el of rest) {
        i++;
        const result = def.rest._zod.run({
          value: el,
          issues: []
        }, ctx);
        if (result instanceof Promise) {
          proms.push(result.then((result2) => handleTupleResult(result2, payload, i)));
        } else {
          handleTupleResult(result, payload, i);
        }
      }
    }
    if (proms.length)
      return Promise.all(proms).then(() => payload);
    return payload;
  };
});
function handleTupleResult(result, final, index) {
  if (result.issues.length) {
    final.issues.push(...prefixIssues(index, result.issues));
  }
  final.value[index] = result.value;
}
var $ZodRecord = /* @__PURE__ */ $constructor("$ZodRecord", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    if (!isPlainObject(input)) {
      payload.issues.push({
        expected: "record",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    }
    const proms = [];
    if (def.keyType._zod.values) {
      const values = def.keyType._zod.values;
      payload.value = {};
      for (const key of values) {
        if (typeof key === "string" || typeof key === "number" || typeof key === "symbol") {
          const result = def.valueType._zod.run({ value: input[key], issues: [] }, ctx);
          if (result instanceof Promise) {
            proms.push(result.then((result2) => {
              if (result2.issues.length) {
                payload.issues.push(...prefixIssues(key, result2.issues));
              }
              payload.value[key] = result2.value;
            }));
          } else {
            if (result.issues.length) {
              payload.issues.push(...prefixIssues(key, result.issues));
            }
            payload.value[key] = result.value;
          }
        }
      }
      let unrecognized;
      for (const key in input) {
        if (!values.has(key)) {
          unrecognized = unrecognized ?? [];
          unrecognized.push(key);
        }
      }
      if (unrecognized && unrecognized.length > 0) {
        payload.issues.push({
          code: "unrecognized_keys",
          input,
          inst,
          keys: unrecognized
        });
      }
    } else {
      payload.value = {};
      for (const key of Reflect.ownKeys(input)) {
        if (key === "__proto__")
          continue;
        const keyResult = def.keyType._zod.run({ value: key, issues: [] }, ctx);
        if (keyResult instanceof Promise) {
          throw new Error("Async schemas not supported in object keys currently");
        }
        if (keyResult.issues.length) {
          payload.issues.push({
            code: "invalid_key",
            origin: "record",
            issues: keyResult.issues.map((iss) => finalizeIssue(iss, ctx, config())),
            input: key,
            path: [key],
            inst
          });
          payload.value[keyResult.value] = keyResult.value;
          continue;
        }
        const result = def.valueType._zod.run({ value: input[key], issues: [] }, ctx);
        if (result instanceof Promise) {
          proms.push(result.then((result2) => {
            if (result2.issues.length) {
              payload.issues.push(...prefixIssues(key, result2.issues));
            }
            payload.value[keyResult.value] = result2.value;
          }));
        } else {
          if (result.issues.length) {
            payload.issues.push(...prefixIssues(key, result.issues));
          }
          payload.value[keyResult.value] = result.value;
        }
      }
    }
    if (proms.length) {
      return Promise.all(proms).then(() => payload);
    }
    return payload;
  };
});
var $ZodMap = /* @__PURE__ */ $constructor("$ZodMap", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    if (!(input instanceof Map)) {
      payload.issues.push({
        expected: "map",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    }
    const proms = [];
    payload.value = new Map;
    for (const [key, value] of input) {
      const keyResult = def.keyType._zod.run({ value: key, issues: [] }, ctx);
      const valueResult = def.valueType._zod.run({ value, issues: [] }, ctx);
      if (keyResult instanceof Promise || valueResult instanceof Promise) {
        proms.push(Promise.all([keyResult, valueResult]).then(([keyResult2, valueResult2]) => {
          handleMapResult(keyResult2, valueResult2, payload, key, input, inst, ctx);
        }));
      } else {
        handleMapResult(keyResult, valueResult, payload, key, input, inst, ctx);
      }
    }
    if (proms.length)
      return Promise.all(proms).then(() => payload);
    return payload;
  };
});
function handleMapResult(keyResult, valueResult, final, key, input, inst, ctx) {
  if (keyResult.issues.length) {
    if (propertyKeyTypes.has(typeof key)) {
      final.issues.push(...prefixIssues(key, keyResult.issues));
    } else {
      final.issues.push({
        code: "invalid_key",
        origin: "map",
        input,
        inst,
        issues: keyResult.issues.map((iss) => finalizeIssue(iss, ctx, config()))
      });
    }
  }
  if (valueResult.issues.length) {
    if (propertyKeyTypes.has(typeof key)) {
      final.issues.push(...prefixIssues(key, valueResult.issues));
    } else {
      final.issues.push({
        origin: "map",
        code: "invalid_element",
        input,
        inst,
        key,
        issues: valueResult.issues.map((iss) => finalizeIssue(iss, ctx, config()))
      });
    }
  }
  final.value.set(keyResult.value, valueResult.value);
}
var $ZodSet = /* @__PURE__ */ $constructor("$ZodSet", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    if (!(input instanceof Set)) {
      payload.issues.push({
        input,
        inst,
        expected: "set",
        code: "invalid_type"
      });
      return payload;
    }
    const proms = [];
    payload.value = new Set;
    for (const item of input) {
      const result = def.valueType._zod.run({ value: item, issues: [] }, ctx);
      if (result instanceof Promise) {
        proms.push(result.then((result2) => handleSetResult(result2, payload)));
      } else
        handleSetResult(result, payload);
    }
    if (proms.length)
      return Promise.all(proms).then(() => payload);
    return payload;
  };
});
function handleSetResult(result, final) {
  if (result.issues.length) {
    final.issues.push(...result.issues);
  }
  final.value.add(result.value);
}
var $ZodEnum = /* @__PURE__ */ $constructor("$ZodEnum", (inst, def) => {
  $ZodType.init(inst, def);
  const values = getEnumValues(def.entries);
  const valuesSet = new Set(values);
  inst._zod.values = valuesSet;
  inst._zod.pattern = new RegExp(`^(${values.filter((k) => propertyKeyTypes.has(typeof k)).map((o) => typeof o === "string" ? escapeRegex(o) : o.toString()).join("|")})$`);
  inst._zod.parse = (payload, _ctx) => {
    const input = payload.value;
    if (valuesSet.has(input)) {
      return payload;
    }
    payload.issues.push({
      code: "invalid_value",
      values,
      input,
      inst
    });
    return payload;
  };
});
var $ZodLiteral = /* @__PURE__ */ $constructor("$ZodLiteral", (inst, def) => {
  $ZodType.init(inst, def);
  if (def.values.length === 0) {
    throw new Error("Cannot create literal schema with no valid values");
  }
  inst._zod.values = new Set(def.values);
  inst._zod.pattern = new RegExp(`^(${def.values.map((o) => typeof o === "string" ? escapeRegex(o) : o ? escapeRegex(o.toString()) : String(o)).join("|")})$`);
  inst._zod.parse = (payload, _ctx) => {
    const input = payload.value;
    if (inst._zod.values.has(input)) {
      return payload;
    }
    payload.issues.push({
      code: "invalid_value",
      values: def.values,
      input,
      inst
    });
    return payload;
  };
});
var $ZodFile = /* @__PURE__ */ $constructor("$ZodFile", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, _ctx) => {
    const input = payload.value;
    if (input instanceof File)
      return payload;
    payload.issues.push({
      expected: "file",
      code: "invalid_type",
      input,
      inst
    });
    return payload;
  };
});
var $ZodTransform = /* @__PURE__ */ $constructor("$ZodTransform", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      throw new $ZodEncodeError(inst.constructor.name);
    }
    const _out = def.transform(payload.value, payload);
    if (ctx.async) {
      const output = _out instanceof Promise ? _out : Promise.resolve(_out);
      return output.then((output2) => {
        payload.value = output2;
        return payload;
      });
    }
    if (_out instanceof Promise) {
      throw new $ZodAsyncError;
    }
    payload.value = _out;
    return payload;
  };
});
function handleOptionalResult(result, input) {
  if (result.issues.length && input === undefined) {
    return { issues: [], value: undefined };
  }
  return result;
}
var $ZodOptional = /* @__PURE__ */ $constructor("$ZodOptional", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.optin = "optional";
  inst._zod.optout = "optional";
  defineLazy(inst._zod, "values", () => {
    return def.innerType._zod.values ? new Set([...def.innerType._zod.values, undefined]) : undefined;
  });
  defineLazy(inst._zod, "pattern", () => {
    const pattern = def.innerType._zod.pattern;
    return pattern ? new RegExp(`^(${cleanRegex(pattern.source)})?$`) : undefined;
  });
  inst._zod.parse = (payload, ctx) => {
    if (def.innerType._zod.optin === "optional") {
      const result = def.innerType._zod.run(payload, ctx);
      if (result instanceof Promise)
        return result.then((r) => handleOptionalResult(r, payload.value));
      return handleOptionalResult(result, payload.value);
    }
    if (payload.value === undefined) {
      return payload;
    }
    return def.innerType._zod.run(payload, ctx);
  };
});
var $ZodNullable = /* @__PURE__ */ $constructor("$ZodNullable", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "optin", () => def.innerType._zod.optin);
  defineLazy(inst._zod, "optout", () => def.innerType._zod.optout);
  defineLazy(inst._zod, "pattern", () => {
    const pattern = def.innerType._zod.pattern;
    return pattern ? new RegExp(`^(${cleanRegex(pattern.source)}|null)$`) : undefined;
  });
  defineLazy(inst._zod, "values", () => {
    return def.innerType._zod.values ? new Set([...def.innerType._zod.values, null]) : undefined;
  });
  inst._zod.parse = (payload, ctx) => {
    if (payload.value === null)
      return payload;
    return def.innerType._zod.run(payload, ctx);
  };
});
var $ZodDefault = /* @__PURE__ */ $constructor("$ZodDefault", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.optin = "optional";
  defineLazy(inst._zod, "values", () => def.innerType._zod.values);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      return def.innerType._zod.run(payload, ctx);
    }
    if (payload.value === undefined) {
      payload.value = def.defaultValue;
      return payload;
    }
    const result = def.innerType._zod.run(payload, ctx);
    if (result instanceof Promise) {
      return result.then((result2) => handleDefaultResult(result2, def));
    }
    return handleDefaultResult(result, def);
  };
});
function handleDefaultResult(payload, def) {
  if (payload.value === undefined) {
    payload.value = def.defaultValue;
  }
  return payload;
}
var $ZodPrefault = /* @__PURE__ */ $constructor("$ZodPrefault", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.optin = "optional";
  defineLazy(inst._zod, "values", () => def.innerType._zod.values);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      return def.innerType._zod.run(payload, ctx);
    }
    if (payload.value === undefined) {
      payload.value = def.defaultValue;
    }
    return def.innerType._zod.run(payload, ctx);
  };
});
var $ZodNonOptional = /* @__PURE__ */ $constructor("$ZodNonOptional", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "values", () => {
    const v = def.innerType._zod.values;
    return v ? new Set([...v].filter((x) => x !== undefined)) : undefined;
  });
  inst._zod.parse = (payload, ctx) => {
    const result = def.innerType._zod.run(payload, ctx);
    if (result instanceof Promise) {
      return result.then((result2) => handleNonOptionalResult(result2, inst));
    }
    return handleNonOptionalResult(result, inst);
  };
});
function handleNonOptionalResult(payload, inst) {
  if (!payload.issues.length && payload.value === undefined) {
    payload.issues.push({
      code: "invalid_type",
      expected: "nonoptional",
      input: payload.value,
      inst
    });
  }
  return payload;
}
var $ZodSuccess = /* @__PURE__ */ $constructor("$ZodSuccess", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      throw new $ZodEncodeError("ZodSuccess");
    }
    const result = def.innerType._zod.run(payload, ctx);
    if (result instanceof Promise) {
      return result.then((result2) => {
        payload.value = result2.issues.length === 0;
        return payload;
      });
    }
    payload.value = result.issues.length === 0;
    return payload;
  };
});
var $ZodCatch = /* @__PURE__ */ $constructor("$ZodCatch", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "optin", () => def.innerType._zod.optin);
  defineLazy(inst._zod, "optout", () => def.innerType._zod.optout);
  defineLazy(inst._zod, "values", () => def.innerType._zod.values);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      return def.innerType._zod.run(payload, ctx);
    }
    const result = def.innerType._zod.run(payload, ctx);
    if (result instanceof Promise) {
      return result.then((result2) => {
        payload.value = result2.value;
        if (result2.issues.length) {
          payload.value = def.catchValue({
            ...payload,
            error: {
              issues: result2.issues.map((iss) => finalizeIssue(iss, ctx, config()))
            },
            input: payload.value
          });
          payload.issues = [];
        }
        return payload;
      });
    }
    payload.value = result.value;
    if (result.issues.length) {
      payload.value = def.catchValue({
        ...payload,
        error: {
          issues: result.issues.map((iss) => finalizeIssue(iss, ctx, config()))
        },
        input: payload.value
      });
      payload.issues = [];
    }
    return payload;
  };
});
var $ZodNaN = /* @__PURE__ */ $constructor("$ZodNaN", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, _ctx) => {
    if (typeof payload.value !== "number" || !Number.isNaN(payload.value)) {
      payload.issues.push({
        input: payload.value,
        inst,
        expected: "nan",
        code: "invalid_type"
      });
      return payload;
    }
    return payload;
  };
});
var $ZodPipe = /* @__PURE__ */ $constructor("$ZodPipe", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "values", () => def.in._zod.values);
  defineLazy(inst._zod, "optin", () => def.in._zod.optin);
  defineLazy(inst._zod, "optout", () => def.out._zod.optout);
  defineLazy(inst._zod, "propValues", () => def.in._zod.propValues);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      const right = def.out._zod.run(payload, ctx);
      if (right instanceof Promise) {
        return right.then((right2) => handlePipeResult(right2, def.in, ctx));
      }
      return handlePipeResult(right, def.in, ctx);
    }
    const left = def.in._zod.run(payload, ctx);
    if (left instanceof Promise) {
      return left.then((left2) => handlePipeResult(left2, def.out, ctx));
    }
    return handlePipeResult(left, def.out, ctx);
  };
});
function handlePipeResult(left, next, ctx) {
  if (left.issues.length) {
    left.aborted = true;
    return left;
  }
  return next._zod.run({ value: left.value, issues: left.issues }, ctx);
}
var $ZodCodec = /* @__PURE__ */ $constructor("$ZodCodec", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "values", () => def.in._zod.values);
  defineLazy(inst._zod, "optin", () => def.in._zod.optin);
  defineLazy(inst._zod, "optout", () => def.out._zod.optout);
  defineLazy(inst._zod, "propValues", () => def.in._zod.propValues);
  inst._zod.parse = (payload, ctx) => {
    const direction = ctx.direction || "forward";
    if (direction === "forward") {
      const left = def.in._zod.run(payload, ctx);
      if (left instanceof Promise) {
        return left.then((left2) => handleCodecAResult(left2, def, ctx));
      }
      return handleCodecAResult(left, def, ctx);
    } else {
      const right = def.out._zod.run(payload, ctx);
      if (right instanceof Promise) {
        return right.then((right2) => handleCodecAResult(right2, def, ctx));
      }
      return handleCodecAResult(right, def, ctx);
    }
  };
});
function handleCodecAResult(result, def, ctx) {
  if (result.issues.length) {
    result.aborted = true;
    return result;
  }
  const direction = ctx.direction || "forward";
  if (direction === "forward") {
    const transformed = def.transform(result.value, result);
    if (transformed instanceof Promise) {
      return transformed.then((value) => handleCodecTxResult(result, value, def.out, ctx));
    }
    return handleCodecTxResult(result, transformed, def.out, ctx);
  } else {
    const transformed = def.reverseTransform(result.value, result);
    if (transformed instanceof Promise) {
      return transformed.then((value) => handleCodecTxResult(result, value, def.in, ctx));
    }
    return handleCodecTxResult(result, transformed, def.in, ctx);
  }
}
function handleCodecTxResult(left, value, nextSchema, ctx) {
  if (left.issues.length) {
    left.aborted = true;
    return left;
  }
  return nextSchema._zod.run({ value, issues: left.issues }, ctx);
}
var $ZodReadonly = /* @__PURE__ */ $constructor("$ZodReadonly", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "propValues", () => def.innerType._zod.propValues);
  defineLazy(inst._zod, "values", () => def.innerType._zod.values);
  defineLazy(inst._zod, "optin", () => def.innerType._zod.optin);
  defineLazy(inst._zod, "optout", () => def.innerType._zod.optout);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      return def.innerType._zod.run(payload, ctx);
    }
    const result = def.innerType._zod.run(payload, ctx);
    if (result instanceof Promise) {
      return result.then(handleReadonlyResult);
    }
    return handleReadonlyResult(result);
  };
});
function handleReadonlyResult(payload) {
  payload.value = Object.freeze(payload.value);
  return payload;
}
var $ZodTemplateLiteral = /* @__PURE__ */ $constructor("$ZodTemplateLiteral", (inst, def) => {
  $ZodType.init(inst, def);
  const regexParts = [];
  for (const part of def.parts) {
    if (typeof part === "object" && part !== null) {
      if (!part._zod.pattern) {
        throw new Error(`Invalid template literal part, no pattern found: ${[...part._zod.traits].shift()}`);
      }
      const source = part._zod.pattern instanceof RegExp ? part._zod.pattern.source : part._zod.pattern;
      if (!source)
        throw new Error(`Invalid template literal part: ${part._zod.traits}`);
      const start = source.startsWith("^") ? 1 : 0;
      const end = source.endsWith("$") ? source.length - 1 : source.length;
      regexParts.push(source.slice(start, end));
    } else if (part === null || primitiveTypes.has(typeof part)) {
      regexParts.push(escapeRegex(`${part}`));
    } else {
      throw new Error(`Invalid template literal part: ${part}`);
    }
  }
  inst._zod.pattern = new RegExp(`^${regexParts.join("")}$`);
  inst._zod.parse = (payload, _ctx) => {
    if (typeof payload.value !== "string") {
      payload.issues.push({
        input: payload.value,
        inst,
        expected: "template_literal",
        code: "invalid_type"
      });
      return payload;
    }
    inst._zod.pattern.lastIndex = 0;
    if (!inst._zod.pattern.test(payload.value)) {
      payload.issues.push({
        input: payload.value,
        inst,
        code: "invalid_format",
        format: def.format ?? "template_literal",
        pattern: inst._zod.pattern.source
      });
      return payload;
    }
    return payload;
  };
});
var $ZodFunction = /* @__PURE__ */ $constructor("$ZodFunction", (inst, def) => {
  $ZodType.init(inst, def);
  inst._def = def;
  inst._zod.def = def;
  inst.implement = (func) => {
    if (typeof func !== "function") {
      throw new Error("implement() must be called with a function");
    }
    return function(...args) {
      const parsedArgs = inst._def.input ? parse(inst._def.input, args) : args;
      const result = Reflect.apply(func, this, parsedArgs);
      if (inst._def.output) {
        return parse(inst._def.output, result);
      }
      return result;
    };
  };
  inst.implementAsync = (func) => {
    if (typeof func !== "function") {
      throw new Error("implementAsync() must be called with a function");
    }
    return async function(...args) {
      const parsedArgs = inst._def.input ? await parseAsync(inst._def.input, args) : args;
      const result = await Reflect.apply(func, this, parsedArgs);
      if (inst._def.output) {
        return await parseAsync(inst._def.output, result);
      }
      return result;
    };
  };
  inst._zod.parse = (payload, _ctx) => {
    if (typeof payload.value !== "function") {
      payload.issues.push({
        code: "invalid_type",
        expected: "function",
        input: payload.value,
        inst
      });
      return payload;
    }
    const hasPromiseOutput = inst._def.output && inst._def.output._zod.def.type === "promise";
    if (hasPromiseOutput) {
      payload.value = inst.implementAsync(payload.value);
    } else {
      payload.value = inst.implement(payload.value);
    }
    return payload;
  };
  inst.input = (...args) => {
    const F = inst.constructor;
    if (Array.isArray(args[0])) {
      return new F({
        type: "function",
        input: new $ZodTuple({
          type: "tuple",
          items: args[0],
          rest: args[1]
        }),
        output: inst._def.output
      });
    }
    return new F({
      type: "function",
      input: args[0],
      output: inst._def.output
    });
  };
  inst.output = (output) => {
    const F = inst.constructor;
    return new F({
      type: "function",
      input: inst._def.input,
      output
    });
  };
  return inst;
});
var $ZodPromise = /* @__PURE__ */ $constructor("$ZodPromise", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, ctx) => {
    return Promise.resolve(payload.value).then((inner) => def.innerType._zod.run({ value: inner, issues: [] }, ctx));
  };
});
var $ZodLazy = /* @__PURE__ */ $constructor("$ZodLazy", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "innerType", () => def.getter());
  defineLazy(inst._zod, "pattern", () => inst._zod.innerType._zod.pattern);
  defineLazy(inst._zod, "propValues", () => inst._zod.innerType._zod.propValues);
  defineLazy(inst._zod, "optin", () => inst._zod.innerType._zod.optin ?? undefined);
  defineLazy(inst._zod, "optout", () => inst._zod.innerType._zod.optout ?? undefined);
  inst._zod.parse = (payload, ctx) => {
    const inner = inst._zod.innerType;
    return inner._zod.run(payload, ctx);
  };
});
var $ZodCustom = /* @__PURE__ */ $constructor("$ZodCustom", (inst, def) => {
  $ZodCheck.init(inst, def);
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, _) => {
    return payload;
  };
  inst._zod.check = (payload) => {
    const input = payload.value;
    const r = def.fn(input);
    if (r instanceof Promise) {
      return r.then((r2) => handleRefineResult(r2, payload, input, inst));
    }
    handleRefineResult(r, payload, input, inst);
    return;
  };
});
function handleRefineResult(result, payload, input, inst) {
  if (!result) {
    const _iss = {
      code: "custom",
      input,
      inst,
      path: [...inst._zod.def.path ?? []],
      continue: !inst._zod.def.abort
    };
    if (inst._zod.def.params)
      _iss.params = inst._zod.def.params;
    payload.issues.push(issue(_iss));
  }
}
// node_modules/zod/v4/locales/index.js
var exports_locales = {};
__export(exports_locales, {
  zhTW: () => zh_TW_default,
  zhCN: () => zh_CN_default,
  yo: () => yo_default,
  vi: () => vi_default,
  ur: () => ur_default,
  uk: () => uk_default,
  ua: () => ua_default,
  tr: () => tr_default,
  th: () => th_default,
  ta: () => ta_default,
  sv: () => sv_default,
  sl: () => sl_default,
  ru: () => ru_default,
  pt: () => pt_default,
  ps: () => ps_default,
  pl: () => pl_default,
  ota: () => ota_default,
  no: () => no_default,
  nl: () => nl_default,
  ms: () => ms_default,
  mk: () => mk_default,
  lt: () => lt_default,
  ko: () => ko_default,
  km: () => km_default,
  kh: () => kh_default,
  ka: () => ka_default,
  ja: () => ja_default,
  it: () => it_default,
  is: () => is_default,
  id: () => id_default,
  hu: () => hu_default,
  he: () => he_default,
  frCA: () => fr_CA_default,
  fr: () => fr_default,
  fi: () => fi_default,
  fa: () => fa_default,
  es: () => es_default,
  eo: () => eo_default,
  en: () => en_default,
  de: () => de_default,
  da: () => da_default,
  cs: () => cs_default,
  ca: () => ca_default,
  bg: () => bg_default,
  be: () => be_default,
  az: () => az_default,
  ar: () => ar_default
});

// node_modules/zod/v4/locales/ar.js
var error = () => {
  const Sizable = {
    string: { unit: "حرف", verb: "أن يحوي" },
    file: { unit: "بايت", verb: "أن يحوي" },
    array: { unit: "عنصر", verb: "أن يحوي" },
    set: { unit: "عنصر", verb: "أن يحوي" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "number";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "array";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "مدخل",
    email: "بريد إلكتروني",
    url: "رابط",
    emoji: "إيموجي",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "تاريخ ووقت بمعيار ISO",
    date: "تاريخ بمعيار ISO",
    time: "وقت بمعيار ISO",
    duration: "مدة بمعيار ISO",
    ipv4: "عنوان IPv4",
    ipv6: "عنوان IPv6",
    cidrv4: "مدى عناوين بصيغة IPv4",
    cidrv6: "مدى عناوين بصيغة IPv6",
    base64: "نَص بترميز base64-encoded",
    base64url: "نَص بترميز base64url-encoded",
    json_string: "نَص على هيئة JSON",
    e164: "رقم هاتف بمعيار E.164",
    jwt: "JWT",
    template_literal: "مدخل"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `مدخلات غير مقبولة: يفترض إدخال ${issue2.expected}، ولكن تم إدخال ${parsedType(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `مدخلات غير مقبولة: يفترض إدخال ${stringifyPrimitive(issue2.values[0])}`;
        return `اختيار غير مقبول: يتوقع انتقاء أحد هذه الخيارات: ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return ` أكبر من اللازم: يفترض أن تكون ${issue2.origin ?? "القيمة"} ${adj} ${issue2.maximum.toString()} ${sizing.unit ?? "عنصر"}`;
        return `أكبر من اللازم: يفترض أن تكون ${issue2.origin ?? "القيمة"} ${adj} ${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `أصغر من اللازم: يفترض لـ ${issue2.origin} أن يكون ${adj} ${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `أصغر من اللازم: يفترض لـ ${issue2.origin} أن يكون ${adj} ${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `نَص غير مقبول: يجب أن يبدأ بـ "${issue2.prefix}"`;
        if (_issue.format === "ends_with")
          return `نَص غير مقبول: يجب أن ينتهي بـ "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `نَص غير مقبول: يجب أن يتضمَّن "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `نَص غير مقبول: يجب أن يطابق النمط ${_issue.pattern}`;
        return `${Nouns[_issue.format] ?? issue2.format} غير مقبول`;
      }
      case "not_multiple_of":
        return `رقم غير مقبول: يجب أن يكون من مضاعفات ${issue2.divisor}`;
      case "unrecognized_keys":
        return `معرف${issue2.keys.length > 1 ? "ات" : ""} غريب${issue2.keys.length > 1 ? "ة" : ""}: ${joinValues(issue2.keys, "، ")}`;
      case "invalid_key":
        return `معرف غير مقبول في ${issue2.origin}`;
      case "invalid_union":
        return "مدخل غير مقبول";
      case "invalid_element":
        return `مدخل غير مقبول في ${issue2.origin}`;
      default:
        return "مدخل غير مقبول";
    }
  };
};
function ar_default() {
  return {
    localeError: error()
  };
}
// node_modules/zod/v4/locales/az.js
var error2 = () => {
  const Sizable = {
    string: { unit: "simvol", verb: "olmalıdır" },
    file: { unit: "bayt", verb: "olmalıdır" },
    array: { unit: "element", verb: "olmalıdır" },
    set: { unit: "element", verb: "olmalıdır" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "number";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "array";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "input",
    email: "email address",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO datetime",
    date: "ISO date",
    time: "ISO time",
    duration: "ISO duration",
    ipv4: "IPv4 address",
    ipv6: "IPv6 address",
    cidrv4: "IPv4 range",
    cidrv6: "IPv6 range",
    base64: "base64-encoded string",
    base64url: "base64url-encoded string",
    json_string: "JSON string",
    e164: "E.164 number",
    jwt: "JWT",
    template_literal: "input"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `Yanlış dəyər: gözlənilən ${issue2.expected}, daxil olan ${parsedType(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Yanlış dəyər: gözlənilən ${stringifyPrimitive(issue2.values[0])}`;
        return `Yanlış seçim: aşağıdakılardan biri olmalıdır: ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Çox böyük: gözlənilən ${issue2.origin ?? "dəyər"} ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "element"}`;
        return `Çox böyük: gözlənilən ${issue2.origin ?? "dəyər"} ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Çox kiçik: gözlənilən ${issue2.origin} ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        return `Çox kiçik: gözlənilən ${issue2.origin} ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Yanlış mətn: "${_issue.prefix}" ilə başlamalıdır`;
        if (_issue.format === "ends_with")
          return `Yanlış mətn: "${_issue.suffix}" ilə bitməlidir`;
        if (_issue.format === "includes")
          return `Yanlış mətn: "${_issue.includes}" daxil olmalıdır`;
        if (_issue.format === "regex")
          return `Yanlış mətn: ${_issue.pattern} şablonuna uyğun olmalıdır`;
        return `Yanlış ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Yanlış ədəd: ${issue2.divisor} ilə bölünə bilən olmalıdır`;
      case "unrecognized_keys":
        return `Tanınmayan açar${issue2.keys.length > 1 ? "lar" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `${issue2.origin} daxilində yanlış açar`;
      case "invalid_union":
        return "Yanlış dəyər";
      case "invalid_element":
        return `${issue2.origin} daxilində yanlış dəyər`;
      default:
        return `Yanlış dəyər`;
    }
  };
};
function az_default() {
  return {
    localeError: error2()
  };
}
// node_modules/zod/v4/locales/be.js
function getBelarusianPlural(count, one, few, many) {
  const absCount = Math.abs(count);
  const lastDigit = absCount % 10;
  const lastTwoDigits = absCount % 100;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
    return many;
  }
  if (lastDigit === 1) {
    return one;
  }
  if (lastDigit >= 2 && lastDigit <= 4) {
    return few;
  }
  return many;
}
var error3 = () => {
  const Sizable = {
    string: {
      unit: {
        one: "сімвал",
        few: "сімвалы",
        many: "сімвалаў"
      },
      verb: "мець"
    },
    array: {
      unit: {
        one: "элемент",
        few: "элементы",
        many: "элементаў"
      },
      verb: "мець"
    },
    set: {
      unit: {
        one: "элемент",
        few: "элементы",
        many: "элементаў"
      },
      verb: "мець"
    },
    file: {
      unit: {
        one: "байт",
        few: "байты",
        many: "байтаў"
      },
      verb: "мець"
    }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "лік";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "масіў";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "увод",
    email: "email адрас",
    url: "URL",
    emoji: "эмодзі",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO дата і час",
    date: "ISO дата",
    time: "ISO час",
    duration: "ISO працягласць",
    ipv4: "IPv4 адрас",
    ipv6: "IPv6 адрас",
    cidrv4: "IPv4 дыяпазон",
    cidrv6: "IPv6 дыяпазон",
    base64: "радок у фармаце base64",
    base64url: "радок у фармаце base64url",
    json_string: "JSON радок",
    e164: "нумар E.164",
    jwt: "JWT",
    template_literal: "увод"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `Няправільны ўвод: чакаўся ${issue2.expected}, атрымана ${parsedType(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Няправільны ўвод: чакалася ${stringifyPrimitive(issue2.values[0])}`;
        return `Няправільны варыянт: чакаўся адзін з ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          const maxValue = Number(issue2.maximum);
          const unit = getBelarusianPlural(maxValue, sizing.unit.one, sizing.unit.few, sizing.unit.many);
          return `Занадта вялікі: чакалася, што ${issue2.origin ?? "значэнне"} павінна ${sizing.verb} ${adj}${issue2.maximum.toString()} ${unit}`;
        }
        return `Занадта вялікі: чакалася, што ${issue2.origin ?? "значэнне"} павінна быць ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          const minValue = Number(issue2.minimum);
          const unit = getBelarusianPlural(minValue, sizing.unit.one, sizing.unit.few, sizing.unit.many);
          return `Занадта малы: чакалася, што ${issue2.origin} павінна ${sizing.verb} ${adj}${issue2.minimum.toString()} ${unit}`;
        }
        return `Занадта малы: чакалася, што ${issue2.origin} павінна быць ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Няправільны радок: павінен пачынацца з "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `Няправільны радок: павінен заканчвацца на "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Няправільны радок: павінен змяшчаць "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Няправільны радок: павінен адпавядаць шаблону ${_issue.pattern}`;
        return `Няправільны ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Няправільны лік: павінен быць кратным ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Нераспазнаны ${issue2.keys.length > 1 ? "ключы" : "ключ"}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Няправільны ключ у ${issue2.origin}`;
      case "invalid_union":
        return "Няправільны ўвод";
      case "invalid_element":
        return `Няправільнае значэнне ў ${issue2.origin}`;
      default:
        return `Няправільны ўвод`;
    }
  };
};
function be_default() {
  return {
    localeError: error3()
  };
}
// node_modules/zod/v4/locales/bg.js
var parsedType = (data) => {
  const t = typeof data;
  switch (t) {
    case "number": {
      return Number.isNaN(data) ? "NaN" : "число";
    }
    case "object": {
      if (Array.isArray(data)) {
        return "масив";
      }
      if (data === null) {
        return "null";
      }
      if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
        return data.constructor.name;
      }
    }
  }
  return t;
};
var error4 = () => {
  const Sizable = {
    string: { unit: "символа", verb: "да съдържа" },
    file: { unit: "байта", verb: "да съдържа" },
    array: { unit: "елемента", verb: "да съдържа" },
    set: { unit: "елемента", verb: "да съдържа" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const Nouns = {
    regex: "вход",
    email: "имейл адрес",
    url: "URL",
    emoji: "емоджи",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO време",
    date: "ISO дата",
    time: "ISO време",
    duration: "ISO продължителност",
    ipv4: "IPv4 адрес",
    ipv6: "IPv6 адрес",
    cidrv4: "IPv4 диапазон",
    cidrv6: "IPv6 диапазон",
    base64: "base64-кодиран низ",
    base64url: "base64url-кодиран низ",
    json_string: "JSON низ",
    e164: "E.164 номер",
    jwt: "JWT",
    template_literal: "вход"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `Невалиден вход: очакван ${issue2.expected}, получен ${parsedType(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Невалиден вход: очакван ${stringifyPrimitive(issue2.values[0])}`;
        return `Невалидна опция: очаквано едно от ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Твърде голямо: очаква се ${issue2.origin ?? "стойност"} да съдържа ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "елемента"}`;
        return `Твърде голямо: очаква се ${issue2.origin ?? "стойност"} да бъде ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Твърде малко: очаква се ${issue2.origin} да съдържа ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Твърде малко: очаква се ${issue2.origin} да бъде ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `Невалиден низ: трябва да започва с "${_issue.prefix}"`;
        }
        if (_issue.format === "ends_with")
          return `Невалиден низ: трябва да завършва с "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Невалиден низ: трябва да включва "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Невалиден низ: трябва да съвпада с ${_issue.pattern}`;
        let invalid_adj = "Невалиден";
        if (_issue.format === "emoji")
          invalid_adj = "Невалидно";
        if (_issue.format === "datetime")
          invalid_adj = "Невалидно";
        if (_issue.format === "date")
          invalid_adj = "Невалидна";
        if (_issue.format === "time")
          invalid_adj = "Невалидно";
        if (_issue.format === "duration")
          invalid_adj = "Невалидна";
        return `${invalid_adj} ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Невалидно число: трябва да бъде кратно на ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Неразпознат${issue2.keys.length > 1 ? "и" : ""} ключ${issue2.keys.length > 1 ? "ове" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Невалиден ключ в ${issue2.origin}`;
      case "invalid_union":
        return "Невалиден вход";
      case "invalid_element":
        return `Невалидна стойност в ${issue2.origin}`;
      default:
        return `Невалиден вход`;
    }
  };
};
function bg_default() {
  return {
    localeError: error4()
  };
}
// node_modules/zod/v4/locales/ca.js
var error5 = () => {
  const Sizable = {
    string: { unit: "caràcters", verb: "contenir" },
    file: { unit: "bytes", verb: "contenir" },
    array: { unit: "elements", verb: "contenir" },
    set: { unit: "elements", verb: "contenir" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType2 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "number";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "array";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "entrada",
    email: "adreça electrònica",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "data i hora ISO",
    date: "data ISO",
    time: "hora ISO",
    duration: "durada ISO",
    ipv4: "adreça IPv4",
    ipv6: "adreça IPv6",
    cidrv4: "rang IPv4",
    cidrv6: "rang IPv6",
    base64: "cadena codificada en base64",
    base64url: "cadena codificada en base64url",
    json_string: "cadena JSON",
    e164: "número E.164",
    jwt: "JWT",
    template_literal: "entrada"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `Tipus invàlid: s'esperava ${issue2.expected}, s'ha rebut ${parsedType2(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Valor invàlid: s'esperava ${stringifyPrimitive(issue2.values[0])}`;
        return `Opció invàlida: s'esperava una de ${joinValues(issue2.values, " o ")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "com a màxim" : "menys de";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Massa gran: s'esperava que ${issue2.origin ?? "el valor"} contingués ${adj} ${issue2.maximum.toString()} ${sizing.unit ?? "elements"}`;
        return `Massa gran: s'esperava que ${issue2.origin ?? "el valor"} fos ${adj} ${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? "com a mínim" : "més de";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Massa petit: s'esperava que ${issue2.origin} contingués ${adj} ${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Massa petit: s'esperava que ${issue2.origin} fos ${adj} ${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `Format invàlid: ha de començar amb "${_issue.prefix}"`;
        }
        if (_issue.format === "ends_with")
          return `Format invàlid: ha d'acabar amb "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Format invàlid: ha d'incloure "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Format invàlid: ha de coincidir amb el patró ${_issue.pattern}`;
        return `Format invàlid per a ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Número invàlid: ha de ser múltiple de ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Clau${issue2.keys.length > 1 ? "s" : ""} no reconeguda${issue2.keys.length > 1 ? "s" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Clau invàlida a ${issue2.origin}`;
      case "invalid_union":
        return "Entrada invàlida";
      case "invalid_element":
        return `Element invàlid a ${issue2.origin}`;
      default:
        return `Entrada invàlida`;
    }
  };
};
function ca_default() {
  return {
    localeError: error5()
  };
}
// node_modules/zod/v4/locales/cs.js
var error6 = () => {
  const Sizable = {
    string: { unit: "znaků", verb: "mít" },
    file: { unit: "bajtů", verb: "mít" },
    array: { unit: "prvků", verb: "mít" },
    set: { unit: "prvků", verb: "mít" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType2 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "číslo";
      }
      case "string": {
        return "řetězec";
      }
      case "boolean": {
        return "boolean";
      }
      case "bigint": {
        return "bigint";
      }
      case "function": {
        return "funkce";
      }
      case "symbol": {
        return "symbol";
      }
      case "undefined": {
        return "undefined";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "pole";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "regulární výraz",
    email: "e-mailová adresa",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "datum a čas ve formátu ISO",
    date: "datum ve formátu ISO",
    time: "čas ve formátu ISO",
    duration: "doba trvání ISO",
    ipv4: "IPv4 adresa",
    ipv6: "IPv6 adresa",
    cidrv4: "rozsah IPv4",
    cidrv6: "rozsah IPv6",
    base64: "řetězec zakódovaný ve formátu base64",
    base64url: "řetězec zakódovaný ve formátu base64url",
    json_string: "řetězec ve formátu JSON",
    e164: "číslo E.164",
    jwt: "JWT",
    template_literal: "vstup"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `Neplatný vstup: očekáváno ${issue2.expected}, obdrženo ${parsedType2(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Neplatný vstup: očekáváno ${stringifyPrimitive(issue2.values[0])}`;
        return `Neplatná možnost: očekávána jedna z hodnot ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Hodnota je příliš velká: ${issue2.origin ?? "hodnota"} musí mít ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "prvků"}`;
        }
        return `Hodnota je příliš velká: ${issue2.origin ?? "hodnota"} musí být ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Hodnota je příliš malá: ${issue2.origin ?? "hodnota"} musí mít ${adj}${issue2.minimum.toString()} ${sizing.unit ?? "prvků"}`;
        }
        return `Hodnota je příliš malá: ${issue2.origin ?? "hodnota"} musí být ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Neplatný řetězec: musí začínat na "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `Neplatný řetězec: musí končit na "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Neplatný řetězec: musí obsahovat "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Neplatný řetězec: musí odpovídat vzoru ${_issue.pattern}`;
        return `Neplatný formát ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Neplatné číslo: musí být násobkem ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Neznámé klíče: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Neplatný klíč v ${issue2.origin}`;
      case "invalid_union":
        return "Neplatný vstup";
      case "invalid_element":
        return `Neplatná hodnota v ${issue2.origin}`;
      default:
        return `Neplatný vstup`;
    }
  };
};
function cs_default() {
  return {
    localeError: error6()
  };
}
// node_modules/zod/v4/locales/da.js
var error7 = () => {
  const Sizable = {
    string: { unit: "tegn", verb: "havde" },
    file: { unit: "bytes", verb: "havde" },
    array: { unit: "elementer", verb: "indeholdt" },
    set: { unit: "elementer", verb: "indeholdt" }
  };
  const TypeNames = {
    string: "streng",
    number: "tal",
    boolean: "boolean",
    array: "liste",
    object: "objekt",
    set: "sæt",
    file: "fil"
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  function getTypeName(type) {
    return TypeNames[type] ?? type;
  }
  const parsedType2 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "tal";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "liste";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
        return "objekt";
      }
    }
    return t;
  };
  const Nouns = {
    regex: "input",
    email: "e-mailadresse",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO dato- og klokkeslæt",
    date: "ISO-dato",
    time: "ISO-klokkeslæt",
    duration: "ISO-varighed",
    ipv4: "IPv4-område",
    ipv6: "IPv6-område",
    cidrv4: "IPv4-spektrum",
    cidrv6: "IPv6-spektrum",
    base64: "base64-kodet streng",
    base64url: "base64url-kodet streng",
    json_string: "JSON-streng",
    e164: "E.164-nummer",
    jwt: "JWT",
    template_literal: "input"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `Ugyldigt input: forventede ${getTypeName(issue2.expected)}, fik ${getTypeName(parsedType2(issue2.input))}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Ugyldig værdi: forventede ${stringifyPrimitive(issue2.values[0])}`;
        return `Ugyldigt valg: forventede en af følgende ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        const origin = getTypeName(issue2.origin);
        if (sizing)
          return `For stor: forventede ${origin ?? "value"} ${sizing.verb} ${adj} ${issue2.maximum.toString()} ${sizing.unit ?? "elementer"}`;
        return `For stor: forventede ${origin ?? "value"} havde ${adj} ${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        const origin = getTypeName(issue2.origin);
        if (sizing) {
          return `For lille: forventede ${origin} ${sizing.verb} ${adj} ${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `For lille: forventede ${origin} havde ${adj} ${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Ugyldig streng: skal starte med "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `Ugyldig streng: skal ende med "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Ugyldig streng: skal indeholde "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Ugyldig streng: skal matche mønsteret ${_issue.pattern}`;
        return `Ugyldig ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Ugyldigt tal: skal være deleligt med ${issue2.divisor}`;
      case "unrecognized_keys":
        return `${issue2.keys.length > 1 ? "Ukendte nøgler" : "Ukendt nøgle"}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Ugyldig nøgle i ${issue2.origin}`;
      case "invalid_union":
        return "Ugyldigt input: matcher ingen af de tilladte typer";
      case "invalid_element":
        return `Ugyldig værdi i ${issue2.origin}`;
      default:
        return `Ugyldigt input`;
    }
  };
};
function da_default() {
  return {
    localeError: error7()
  };
}
// node_modules/zod/v4/locales/de.js
var error8 = () => {
  const Sizable = {
    string: { unit: "Zeichen", verb: "zu haben" },
    file: { unit: "Bytes", verb: "zu haben" },
    array: { unit: "Elemente", verb: "zu haben" },
    set: { unit: "Elemente", verb: "zu haben" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType2 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "Zahl";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "Array";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "Eingabe",
    email: "E-Mail-Adresse",
    url: "URL",
    emoji: "Emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO-Datum und -Uhrzeit",
    date: "ISO-Datum",
    time: "ISO-Uhrzeit",
    duration: "ISO-Dauer",
    ipv4: "IPv4-Adresse",
    ipv6: "IPv6-Adresse",
    cidrv4: "IPv4-Bereich",
    cidrv6: "IPv6-Bereich",
    base64: "Base64-codierter String",
    base64url: "Base64-URL-codierter String",
    json_string: "JSON-String",
    e164: "E.164-Nummer",
    jwt: "JWT",
    template_literal: "Eingabe"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `Ungültige Eingabe: erwartet ${issue2.expected}, erhalten ${parsedType2(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Ungültige Eingabe: erwartet ${stringifyPrimitive(issue2.values[0])}`;
        return `Ungültige Option: erwartet eine von ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Zu groß: erwartet, dass ${issue2.origin ?? "Wert"} ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "Elemente"} hat`;
        return `Zu groß: erwartet, dass ${issue2.origin ?? "Wert"} ${adj}${issue2.maximum.toString()} ist`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Zu klein: erwartet, dass ${issue2.origin} ${adj}${issue2.minimum.toString()} ${sizing.unit} hat`;
        }
        return `Zu klein: erwartet, dass ${issue2.origin} ${adj}${issue2.minimum.toString()} ist`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Ungültiger String: muss mit "${_issue.prefix}" beginnen`;
        if (_issue.format === "ends_with")
          return `Ungültiger String: muss mit "${_issue.suffix}" enden`;
        if (_issue.format === "includes")
          return `Ungültiger String: muss "${_issue.includes}" enthalten`;
        if (_issue.format === "regex")
          return `Ungültiger String: muss dem Muster ${_issue.pattern} entsprechen`;
        return `Ungültig: ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Ungültige Zahl: muss ein Vielfaches von ${issue2.divisor} sein`;
      case "unrecognized_keys":
        return `${issue2.keys.length > 1 ? "Unbekannte Schlüssel" : "Unbekannter Schlüssel"}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Ungültiger Schlüssel in ${issue2.origin}`;
      case "invalid_union":
        return "Ungültige Eingabe";
      case "invalid_element":
        return `Ungültiger Wert in ${issue2.origin}`;
      default:
        return `Ungültige Eingabe`;
    }
  };
};
function de_default() {
  return {
    localeError: error8()
  };
}
// node_modules/zod/v4/locales/en.js
var parsedType2 = (data) => {
  const t = typeof data;
  switch (t) {
    case "number": {
      return Number.isNaN(data) ? "NaN" : "number";
    }
    case "object": {
      if (Array.isArray(data)) {
        return "array";
      }
      if (data === null) {
        return "null";
      }
      if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
        return data.constructor.name;
      }
    }
  }
  return t;
};
var error9 = () => {
  const Sizable = {
    string: { unit: "characters", verb: "to have" },
    file: { unit: "bytes", verb: "to have" },
    array: { unit: "items", verb: "to have" },
    set: { unit: "items", verb: "to have" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const Nouns = {
    regex: "input",
    email: "email address",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO datetime",
    date: "ISO date",
    time: "ISO time",
    duration: "ISO duration",
    ipv4: "IPv4 address",
    ipv6: "IPv6 address",
    cidrv4: "IPv4 range",
    cidrv6: "IPv6 range",
    base64: "base64-encoded string",
    base64url: "base64url-encoded string",
    json_string: "JSON string",
    e164: "E.164 number",
    jwt: "JWT",
    template_literal: "input"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `Invalid input: expected ${issue2.expected}, received ${parsedType2(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Invalid input: expected ${stringifyPrimitive(issue2.values[0])}`;
        return `Invalid option: expected one of ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Too big: expected ${issue2.origin ?? "value"} to have ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elements"}`;
        return `Too big: expected ${issue2.origin ?? "value"} to be ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Too small: expected ${issue2.origin} to have ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Too small: expected ${issue2.origin} to be ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `Invalid string: must start with "${_issue.prefix}"`;
        }
        if (_issue.format === "ends_with")
          return `Invalid string: must end with "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Invalid string: must include "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Invalid string: must match pattern ${_issue.pattern}`;
        return `Invalid ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Invalid number: must be a multiple of ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Unrecognized key${issue2.keys.length > 1 ? "s" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Invalid key in ${issue2.origin}`;
      case "invalid_union":
        return "Invalid input";
      case "invalid_element":
        return `Invalid value in ${issue2.origin}`;
      default:
        return `Invalid input`;
    }
  };
};
function en_default() {
  return {
    localeError: error9()
  };
}
// node_modules/zod/v4/locales/eo.js
var parsedType3 = (data) => {
  const t = typeof data;
  switch (t) {
    case "number": {
      return Number.isNaN(data) ? "NaN" : "nombro";
    }
    case "object": {
      if (Array.isArray(data)) {
        return "tabelo";
      }
      if (data === null) {
        return "senvalora";
      }
      if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
        return data.constructor.name;
      }
    }
  }
  return t;
};
var error10 = () => {
  const Sizable = {
    string: { unit: "karaktrojn", verb: "havi" },
    file: { unit: "bajtojn", verb: "havi" },
    array: { unit: "elementojn", verb: "havi" },
    set: { unit: "elementojn", verb: "havi" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const Nouns = {
    regex: "enigo",
    email: "retadreso",
    url: "URL",
    emoji: "emoĝio",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO-datotempo",
    date: "ISO-dato",
    time: "ISO-tempo",
    duration: "ISO-daŭro",
    ipv4: "IPv4-adreso",
    ipv6: "IPv6-adreso",
    cidrv4: "IPv4-rango",
    cidrv6: "IPv6-rango",
    base64: "64-ume kodita karaktraro",
    base64url: "URL-64-ume kodita karaktraro",
    json_string: "JSON-karaktraro",
    e164: "E.164-nombro",
    jwt: "JWT",
    template_literal: "enigo"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `Nevalida enigo: atendiĝis ${issue2.expected}, riceviĝis ${parsedType3(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Nevalida enigo: atendiĝis ${stringifyPrimitive(issue2.values[0])}`;
        return `Nevalida opcio: atendiĝis unu el ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Tro granda: atendiĝis ke ${issue2.origin ?? "valoro"} havu ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elementojn"}`;
        return `Tro granda: atendiĝis ke ${issue2.origin ?? "valoro"} havu ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Tro malgranda: atendiĝis ke ${issue2.origin} havu ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Tro malgranda: atendiĝis ke ${issue2.origin} estu ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Nevalida karaktraro: devas komenciĝi per "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `Nevalida karaktraro: devas finiĝi per "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Nevalida karaktraro: devas inkluzivi "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Nevalida karaktraro: devas kongrui kun la modelo ${_issue.pattern}`;
        return `Nevalida ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Nevalida nombro: devas esti oblo de ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Nekonata${issue2.keys.length > 1 ? "j" : ""} ŝlosilo${issue2.keys.length > 1 ? "j" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Nevalida ŝlosilo en ${issue2.origin}`;
      case "invalid_union":
        return "Nevalida enigo";
      case "invalid_element":
        return `Nevalida valoro en ${issue2.origin}`;
      default:
        return `Nevalida enigo`;
    }
  };
};
function eo_default() {
  return {
    localeError: error10()
  };
}
// node_modules/zod/v4/locales/es.js
var error11 = () => {
  const Sizable = {
    string: { unit: "caracteres", verb: "tener" },
    file: { unit: "bytes", verb: "tener" },
    array: { unit: "elementos", verb: "tener" },
    set: { unit: "elementos", verb: "tener" }
  };
  const TypeNames = {
    string: "texto",
    number: "número",
    boolean: "booleano",
    array: "arreglo",
    object: "objeto",
    set: "conjunto",
    file: "archivo",
    date: "fecha",
    bigint: "número grande",
    symbol: "símbolo",
    undefined: "indefinido",
    null: "nulo",
    function: "función",
    map: "mapa",
    record: "registro",
    tuple: "tupla",
    enum: "enumeración",
    union: "unión",
    literal: "literal",
    promise: "promesa",
    void: "vacío",
    never: "nunca",
    unknown: "desconocido",
    any: "cualquiera"
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  function getTypeName(type) {
    return TypeNames[type] ?? type;
  }
  const parsedType4 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "number";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "array";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype) {
          return data.constructor.name;
        }
        return "object";
      }
    }
    return t;
  };
  const Nouns = {
    regex: "entrada",
    email: "dirección de correo electrónico",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "fecha y hora ISO",
    date: "fecha ISO",
    time: "hora ISO",
    duration: "duración ISO",
    ipv4: "dirección IPv4",
    ipv6: "dirección IPv6",
    cidrv4: "rango IPv4",
    cidrv6: "rango IPv6",
    base64: "cadena codificada en base64",
    base64url: "URL codificada en base64",
    json_string: "cadena JSON",
    e164: "número E.164",
    jwt: "JWT",
    template_literal: "entrada"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `Entrada inválida: se esperaba ${getTypeName(issue2.expected)}, recibido ${getTypeName(parsedType4(issue2.input))}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Entrada inválida: se esperaba ${stringifyPrimitive(issue2.values[0])}`;
        return `Opción inválida: se esperaba una de ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        const origin = getTypeName(issue2.origin);
        if (sizing)
          return `Demasiado grande: se esperaba que ${origin ?? "valor"} tuviera ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elementos"}`;
        return `Demasiado grande: se esperaba que ${origin ?? "valor"} fuera ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        const origin = getTypeName(issue2.origin);
        if (sizing) {
          return `Demasiado pequeño: se esperaba que ${origin} tuviera ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Demasiado pequeño: se esperaba que ${origin} fuera ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Cadena inválida: debe comenzar con "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `Cadena inválida: debe terminar en "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Cadena inválida: debe incluir "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Cadena inválida: debe coincidir con el patrón ${_issue.pattern}`;
        return `Inválido ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Número inválido: debe ser múltiplo de ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Llave${issue2.keys.length > 1 ? "s" : ""} desconocida${issue2.keys.length > 1 ? "s" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Llave inválida en ${getTypeName(issue2.origin)}`;
      case "invalid_union":
        return "Entrada inválida";
      case "invalid_element":
        return `Valor inválido en ${getTypeName(issue2.origin)}`;
      default:
        return `Entrada inválida`;
    }
  };
};
function es_default() {
  return {
    localeError: error11()
  };
}
// node_modules/zod/v4/locales/fa.js
var error12 = () => {
  const Sizable = {
    string: { unit: "کاراکتر", verb: "داشته باشد" },
    file: { unit: "بایت", verb: "داشته باشد" },
    array: { unit: "آیتم", verb: "داشته باشد" },
    set: { unit: "آیتم", verb: "داشته باشد" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType4 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "عدد";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "آرایه";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "ورودی",
    email: "آدرس ایمیل",
    url: "URL",
    emoji: "ایموجی",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "تاریخ و زمان ایزو",
    date: "تاریخ ایزو",
    time: "زمان ایزو",
    duration: "مدت زمان ایزو",
    ipv4: "IPv4 آدرس",
    ipv6: "IPv6 آدرس",
    cidrv4: "IPv4 دامنه",
    cidrv6: "IPv6 دامنه",
    base64: "base64-encoded رشته",
    base64url: "base64url-encoded رشته",
    json_string: "JSON رشته",
    e164: "E.164 عدد",
    jwt: "JWT",
    template_literal: "ورودی"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `ورودی نامعتبر: می‌بایست ${issue2.expected} می‌بود، ${parsedType4(issue2.input)} دریافت شد`;
      case "invalid_value":
        if (issue2.values.length === 1) {
          return `ورودی نامعتبر: می‌بایست ${stringifyPrimitive(issue2.values[0])} می‌بود`;
        }
        return `گزینه نامعتبر: می‌بایست یکی از ${joinValues(issue2.values, "|")} می‌بود`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `خیلی بزرگ: ${issue2.origin ?? "مقدار"} باید ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "عنصر"} باشد`;
        }
        return `خیلی بزرگ: ${issue2.origin ?? "مقدار"} باید ${adj}${issue2.maximum.toString()} باشد`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `خیلی کوچک: ${issue2.origin} باید ${adj}${issue2.minimum.toString()} ${sizing.unit} باشد`;
        }
        return `خیلی کوچک: ${issue2.origin} باید ${adj}${issue2.minimum.toString()} باشد`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `رشته نامعتبر: باید با "${_issue.prefix}" شروع شود`;
        }
        if (_issue.format === "ends_with") {
          return `رشته نامعتبر: باید با "${_issue.suffix}" تمام شود`;
        }
        if (_issue.format === "includes") {
          return `رشته نامعتبر: باید شامل "${_issue.includes}" باشد`;
        }
        if (_issue.format === "regex") {
          return `رشته نامعتبر: باید با الگوی ${_issue.pattern} مطابقت داشته باشد`;
        }
        return `${Nouns[_issue.format] ?? issue2.format} نامعتبر`;
      }
      case "not_multiple_of":
        return `عدد نامعتبر: باید مضرب ${issue2.divisor} باشد`;
      case "unrecognized_keys":
        return `کلید${issue2.keys.length > 1 ? "های" : ""} ناشناس: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `کلید ناشناس در ${issue2.origin}`;
      case "invalid_union":
        return `ورودی نامعتبر`;
      case "invalid_element":
        return `مقدار نامعتبر در ${issue2.origin}`;
      default:
        return `ورودی نامعتبر`;
    }
  };
};
function fa_default() {
  return {
    localeError: error12()
  };
}
// node_modules/zod/v4/locales/fi.js
var error13 = () => {
  const Sizable = {
    string: { unit: "merkkiä", subject: "merkkijonon" },
    file: { unit: "tavua", subject: "tiedoston" },
    array: { unit: "alkiota", subject: "listan" },
    set: { unit: "alkiota", subject: "joukon" },
    number: { unit: "", subject: "luvun" },
    bigint: { unit: "", subject: "suuren kokonaisluvun" },
    int: { unit: "", subject: "kokonaisluvun" },
    date: { unit: "", subject: "päivämäärän" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType4 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "number";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "array";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "säännöllinen lauseke",
    email: "sähköpostiosoite",
    url: "URL-osoite",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO-aikaleima",
    date: "ISO-päivämäärä",
    time: "ISO-aika",
    duration: "ISO-kesto",
    ipv4: "IPv4-osoite",
    ipv6: "IPv6-osoite",
    cidrv4: "IPv4-alue",
    cidrv6: "IPv6-alue",
    base64: "base64-koodattu merkkijono",
    base64url: "base64url-koodattu merkkijono",
    json_string: "JSON-merkkijono",
    e164: "E.164-luku",
    jwt: "JWT",
    template_literal: "templaattimerkkijono"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `Virheellinen tyyppi: odotettiin ${issue2.expected}, oli ${parsedType4(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Virheellinen syöte: täytyy olla ${stringifyPrimitive(issue2.values[0])}`;
        return `Virheellinen valinta: täytyy olla yksi seuraavista: ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Liian suuri: ${sizing.subject} täytyy olla ${adj}${issue2.maximum.toString()} ${sizing.unit}`.trim();
        }
        return `Liian suuri: arvon täytyy olla ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Liian pieni: ${sizing.subject} täytyy olla ${adj}${issue2.minimum.toString()} ${sizing.unit}`.trim();
        }
        return `Liian pieni: arvon täytyy olla ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Virheellinen syöte: täytyy alkaa "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `Virheellinen syöte: täytyy loppua "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Virheellinen syöte: täytyy sisältää "${_issue.includes}"`;
        if (_issue.format === "regex") {
          return `Virheellinen syöte: täytyy vastata säännöllistä lauseketta ${_issue.pattern}`;
        }
        return `Virheellinen ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Virheellinen luku: täytyy olla luvun ${issue2.divisor} monikerta`;
      case "unrecognized_keys":
        return `${issue2.keys.length > 1 ? "Tuntemattomat avaimet" : "Tuntematon avain"}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return "Virheellinen avain tietueessa";
      case "invalid_union":
        return "Virheellinen unioni";
      case "invalid_element":
        return "Virheellinen arvo joukossa";
      default:
        return `Virheellinen syöte`;
    }
  };
};
function fi_default() {
  return {
    localeError: error13()
  };
}
// node_modules/zod/v4/locales/fr.js
var error14 = () => {
  const Sizable = {
    string: { unit: "caractères", verb: "avoir" },
    file: { unit: "octets", verb: "avoir" },
    array: { unit: "éléments", verb: "avoir" },
    set: { unit: "éléments", verb: "avoir" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType4 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "nombre";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "tableau";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "entrée",
    email: "adresse e-mail",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "date et heure ISO",
    date: "date ISO",
    time: "heure ISO",
    duration: "durée ISO",
    ipv4: "adresse IPv4",
    ipv6: "adresse IPv6",
    cidrv4: "plage IPv4",
    cidrv6: "plage IPv6",
    base64: "chaîne encodée en base64",
    base64url: "chaîne encodée en base64url",
    json_string: "chaîne JSON",
    e164: "numéro E.164",
    jwt: "JWT",
    template_literal: "entrée"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `Entrée invalide : ${issue2.expected} attendu, ${parsedType4(issue2.input)} reçu`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Entrée invalide : ${stringifyPrimitive(issue2.values[0])} attendu`;
        return `Option invalide : une valeur parmi ${joinValues(issue2.values, "|")} attendue`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Trop grand : ${issue2.origin ?? "valeur"} doit ${sizing.verb} ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "élément(s)"}`;
        return `Trop grand : ${issue2.origin ?? "valeur"} doit être ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Trop petit : ${issue2.origin} doit ${sizing.verb} ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Trop petit : ${issue2.origin} doit être ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Chaîne invalide : doit commencer par "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `Chaîne invalide : doit se terminer par "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Chaîne invalide : doit inclure "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Chaîne invalide : doit correspondre au modèle ${_issue.pattern}`;
        return `${Nouns[_issue.format] ?? issue2.format} invalide`;
      }
      case "not_multiple_of":
        return `Nombre invalide : doit être un multiple de ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Clé${issue2.keys.length > 1 ? "s" : ""} non reconnue${issue2.keys.length > 1 ? "s" : ""} : ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Clé invalide dans ${issue2.origin}`;
      case "invalid_union":
        return "Entrée invalide";
      case "invalid_element":
        return `Valeur invalide dans ${issue2.origin}`;
      default:
        return `Entrée invalide`;
    }
  };
};
function fr_default() {
  return {
    localeError: error14()
  };
}
// node_modules/zod/v4/locales/fr-CA.js
var error15 = () => {
  const Sizable = {
    string: { unit: "caractères", verb: "avoir" },
    file: { unit: "octets", verb: "avoir" },
    array: { unit: "éléments", verb: "avoir" },
    set: { unit: "éléments", verb: "avoir" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType4 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "number";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "array";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "entrée",
    email: "adresse courriel",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "date-heure ISO",
    date: "date ISO",
    time: "heure ISO",
    duration: "durée ISO",
    ipv4: "adresse IPv4",
    ipv6: "adresse IPv6",
    cidrv4: "plage IPv4",
    cidrv6: "plage IPv6",
    base64: "chaîne encodée en base64",
    base64url: "chaîne encodée en base64url",
    json_string: "chaîne JSON",
    e164: "numéro E.164",
    jwt: "JWT",
    template_literal: "entrée"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `Entrée invalide : attendu ${issue2.expected}, reçu ${parsedType4(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Entrée invalide : attendu ${stringifyPrimitive(issue2.values[0])}`;
        return `Option invalide : attendu l'une des valeurs suivantes ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "≤" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Trop grand : attendu que ${issue2.origin ?? "la valeur"} ait ${adj}${issue2.maximum.toString()} ${sizing.unit}`;
        return `Trop grand : attendu que ${issue2.origin ?? "la valeur"} soit ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? "≥" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Trop petit : attendu que ${issue2.origin} ait ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Trop petit : attendu que ${issue2.origin} soit ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `Chaîne invalide : doit commencer par "${_issue.prefix}"`;
        }
        if (_issue.format === "ends_with")
          return `Chaîne invalide : doit se terminer par "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Chaîne invalide : doit inclure "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Chaîne invalide : doit correspondre au motif ${_issue.pattern}`;
        return `${Nouns[_issue.format] ?? issue2.format} invalide`;
      }
      case "not_multiple_of":
        return `Nombre invalide : doit être un multiple de ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Clé${issue2.keys.length > 1 ? "s" : ""} non reconnue${issue2.keys.length > 1 ? "s" : ""} : ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Clé invalide dans ${issue2.origin}`;
      case "invalid_union":
        return "Entrée invalide";
      case "invalid_element":
        return `Valeur invalide dans ${issue2.origin}`;
      default:
        return `Entrée invalide`;
    }
  };
};
function fr_CA_default() {
  return {
    localeError: error15()
  };
}
// node_modules/zod/v4/locales/he.js
var error16 = () => {
  const Sizable = {
    string: { unit: "אותיות", verb: "לכלול" },
    file: { unit: "בייטים", verb: "לכלול" },
    array: { unit: "פריטים", verb: "לכלול" },
    set: { unit: "פריטים", verb: "לכלול" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType4 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "number";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "array";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "קלט",
    email: "כתובת אימייל",
    url: "כתובת רשת",
    emoji: "אימוג'י",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "תאריך וזמן ISO",
    date: "תאריך ISO",
    time: "זמן ISO",
    duration: "משך זמן ISO",
    ipv4: "כתובת IPv4",
    ipv6: "כתובת IPv6",
    cidrv4: "טווח IPv4",
    cidrv6: "טווח IPv6",
    base64: "מחרוזת בבסיס 64",
    base64url: "מחרוזת בבסיס 64 לכתובות רשת",
    json_string: "מחרוזת JSON",
    e164: "מספר E.164",
    jwt: "JWT",
    template_literal: "קלט"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `קלט לא תקין: צריך ${issue2.expected}, התקבל ${parsedType4(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `קלט לא תקין: צריך ${stringifyPrimitive(issue2.values[0])}`;
        return `קלט לא תקין: צריך אחת מהאפשרויות  ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `גדול מדי: ${issue2.origin ?? "value"} צריך להיות ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elements"}`;
        return `גדול מדי: ${issue2.origin ?? "value"} צריך להיות ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `קטן מדי: ${issue2.origin} צריך להיות ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `קטן מדי: ${issue2.origin} צריך להיות ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `מחרוזת לא תקינה: חייבת להתחיל ב"${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `מחרוזת לא תקינה: חייבת להסתיים ב "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `מחרוזת לא תקינה: חייבת לכלול "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `מחרוזת לא תקינה: חייבת להתאים לתבנית ${_issue.pattern}`;
        return `${Nouns[_issue.format] ?? issue2.format} לא תקין`;
      }
      case "not_multiple_of":
        return `מספר לא תקין: חייב להיות מכפלה של ${issue2.divisor}`;
      case "unrecognized_keys":
        return `מפתח${issue2.keys.length > 1 ? "ות" : ""} לא מזוה${issue2.keys.length > 1 ? "ים" : "ה"}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `מפתח לא תקין ב${issue2.origin}`;
      case "invalid_union":
        return "קלט לא תקין";
      case "invalid_element":
        return `ערך לא תקין ב${issue2.origin}`;
      default:
        return `קלט לא תקין`;
    }
  };
};
function he_default() {
  return {
    localeError: error16()
  };
}
// node_modules/zod/v4/locales/hu.js
var error17 = () => {
  const Sizable = {
    string: { unit: "karakter", verb: "legyen" },
    file: { unit: "byte", verb: "legyen" },
    array: { unit: "elem", verb: "legyen" },
    set: { unit: "elem", verb: "legyen" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType4 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "szám";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "tömb";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "bemenet",
    email: "email cím",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO időbélyeg",
    date: "ISO dátum",
    time: "ISO idő",
    duration: "ISO időintervallum",
    ipv4: "IPv4 cím",
    ipv6: "IPv6 cím",
    cidrv4: "IPv4 tartomány",
    cidrv6: "IPv6 tartomány",
    base64: "base64-kódolt string",
    base64url: "base64url-kódolt string",
    json_string: "JSON string",
    e164: "E.164 szám",
    jwt: "JWT",
    template_literal: "bemenet"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `Érvénytelen bemenet: a várt érték ${issue2.expected}, a kapott érték ${parsedType4(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Érvénytelen bemenet: a várt érték ${stringifyPrimitive(issue2.values[0])}`;
        return `Érvénytelen opció: valamelyik érték várt ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Túl nagy: ${issue2.origin ?? "érték"} mérete túl nagy ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elem"}`;
        return `Túl nagy: a bemeneti érték ${issue2.origin ?? "érték"} túl nagy: ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Túl kicsi: a bemeneti érték ${issue2.origin} mérete túl kicsi ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Túl kicsi: a bemeneti érték ${issue2.origin} túl kicsi ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Érvénytelen string: "${_issue.prefix}" értékkel kell kezdődnie`;
        if (_issue.format === "ends_with")
          return `Érvénytelen string: "${_issue.suffix}" értékkel kell végződnie`;
        if (_issue.format === "includes")
          return `Érvénytelen string: "${_issue.includes}" értéket kell tartalmaznia`;
        if (_issue.format === "regex")
          return `Érvénytelen string: ${_issue.pattern} mintának kell megfelelnie`;
        return `Érvénytelen ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Érvénytelen szám: ${issue2.divisor} többszörösének kell lennie`;
      case "unrecognized_keys":
        return `Ismeretlen kulcs${issue2.keys.length > 1 ? "s" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Érvénytelen kulcs ${issue2.origin}`;
      case "invalid_union":
        return "Érvénytelen bemenet";
      case "invalid_element":
        return `Érvénytelen érték: ${issue2.origin}`;
      default:
        return `Érvénytelen bemenet`;
    }
  };
};
function hu_default() {
  return {
    localeError: error17()
  };
}
// node_modules/zod/v4/locales/id.js
var error18 = () => {
  const Sizable = {
    string: { unit: "karakter", verb: "memiliki" },
    file: { unit: "byte", verb: "memiliki" },
    array: { unit: "item", verb: "memiliki" },
    set: { unit: "item", verb: "memiliki" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType4 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "number";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "array";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "input",
    email: "alamat email",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "tanggal dan waktu format ISO",
    date: "tanggal format ISO",
    time: "jam format ISO",
    duration: "durasi format ISO",
    ipv4: "alamat IPv4",
    ipv6: "alamat IPv6",
    cidrv4: "rentang alamat IPv4",
    cidrv6: "rentang alamat IPv6",
    base64: "string dengan enkode base64",
    base64url: "string dengan enkode base64url",
    json_string: "string JSON",
    e164: "angka E.164",
    jwt: "JWT",
    template_literal: "input"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `Input tidak valid: diharapkan ${issue2.expected}, diterima ${parsedType4(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Input tidak valid: diharapkan ${stringifyPrimitive(issue2.values[0])}`;
        return `Pilihan tidak valid: diharapkan salah satu dari ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Terlalu besar: diharapkan ${issue2.origin ?? "value"} memiliki ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elemen"}`;
        return `Terlalu besar: diharapkan ${issue2.origin ?? "value"} menjadi ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Terlalu kecil: diharapkan ${issue2.origin} memiliki ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Terlalu kecil: diharapkan ${issue2.origin} menjadi ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `String tidak valid: harus dimulai dengan "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `String tidak valid: harus berakhir dengan "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `String tidak valid: harus menyertakan "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `String tidak valid: harus sesuai pola ${_issue.pattern}`;
        return `${Nouns[_issue.format] ?? issue2.format} tidak valid`;
      }
      case "not_multiple_of":
        return `Angka tidak valid: harus kelipatan dari ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Kunci tidak dikenali ${issue2.keys.length > 1 ? "s" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Kunci tidak valid di ${issue2.origin}`;
      case "invalid_union":
        return "Input tidak valid";
      case "invalid_element":
        return `Nilai tidak valid di ${issue2.origin}`;
      default:
        return `Input tidak valid`;
    }
  };
};
function id_default() {
  return {
    localeError: error18()
  };
}
// node_modules/zod/v4/locales/is.js
var parsedType4 = (data) => {
  const t = typeof data;
  switch (t) {
    case "number": {
      return Number.isNaN(data) ? "NaN" : "númer";
    }
    case "object": {
      if (Array.isArray(data)) {
        return "fylki";
      }
      if (data === null) {
        return "null";
      }
      if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
        return data.constructor.name;
      }
    }
  }
  return t;
};
var error19 = () => {
  const Sizable = {
    string: { unit: "stafi", verb: "að hafa" },
    file: { unit: "bæti", verb: "að hafa" },
    array: { unit: "hluti", verb: "að hafa" },
    set: { unit: "hluti", verb: "að hafa" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const Nouns = {
    regex: "gildi",
    email: "netfang",
    url: "vefslóð",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO dagsetning og tími",
    date: "ISO dagsetning",
    time: "ISO tími",
    duration: "ISO tímalengd",
    ipv4: "IPv4 address",
    ipv6: "IPv6 address",
    cidrv4: "IPv4 range",
    cidrv6: "IPv6 range",
    base64: "base64-encoded strengur",
    base64url: "base64url-encoded strengur",
    json_string: "JSON strengur",
    e164: "E.164 tölugildi",
    jwt: "JWT",
    template_literal: "gildi"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `Rangt gildi: Þú slóst inn ${parsedType4(issue2.input)} þar sem á að vera ${issue2.expected}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Rangt gildi: gert ráð fyrir ${stringifyPrimitive(issue2.values[0])}`;
        return `Ógilt val: má vera eitt af eftirfarandi ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Of stórt: gert er ráð fyrir að ${issue2.origin ?? "gildi"} hafi ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "hluti"}`;
        return `Of stórt: gert er ráð fyrir að ${issue2.origin ?? "gildi"} sé ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Of lítið: gert er ráð fyrir að ${issue2.origin} hafi ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Of lítið: gert er ráð fyrir að ${issue2.origin} sé ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `Ógildur strengur: verður að byrja á "${_issue.prefix}"`;
        }
        if (_issue.format === "ends_with")
          return `Ógildur strengur: verður að enda á "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Ógildur strengur: verður að innihalda "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Ógildur strengur: verður að fylgja mynstri ${_issue.pattern}`;
        return `Rangt ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Röng tala: verður að vera margfeldi af ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Óþekkt ${issue2.keys.length > 1 ? "ir lyklar" : "ur lykill"}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Rangur lykill í ${issue2.origin}`;
      case "invalid_union":
        return "Rangt gildi";
      case "invalid_element":
        return `Rangt gildi í ${issue2.origin}`;
      default:
        return `Rangt gildi`;
    }
  };
};
function is_default() {
  return {
    localeError: error19()
  };
}
// node_modules/zod/v4/locales/it.js
var error20 = () => {
  const Sizable = {
    string: { unit: "caratteri", verb: "avere" },
    file: { unit: "byte", verb: "avere" },
    array: { unit: "elementi", verb: "avere" },
    set: { unit: "elementi", verb: "avere" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType5 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "numero";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "vettore";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "input",
    email: "indirizzo email",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "data e ora ISO",
    date: "data ISO",
    time: "ora ISO",
    duration: "durata ISO",
    ipv4: "indirizzo IPv4",
    ipv6: "indirizzo IPv6",
    cidrv4: "intervallo IPv4",
    cidrv6: "intervallo IPv6",
    base64: "stringa codificata in base64",
    base64url: "URL codificata in base64",
    json_string: "stringa JSON",
    e164: "numero E.164",
    jwt: "JWT",
    template_literal: "input"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `Input non valido: atteso ${issue2.expected}, ricevuto ${parsedType5(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Input non valido: atteso ${stringifyPrimitive(issue2.values[0])}`;
        return `Opzione non valida: atteso uno tra ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Troppo grande: ${issue2.origin ?? "valore"} deve avere ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elementi"}`;
        return `Troppo grande: ${issue2.origin ?? "valore"} deve essere ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Troppo piccolo: ${issue2.origin} deve avere ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Troppo piccolo: ${issue2.origin} deve essere ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Stringa non valida: deve iniziare con "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `Stringa non valida: deve terminare con "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Stringa non valida: deve includere "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Stringa non valida: deve corrispondere al pattern ${_issue.pattern}`;
        return `Invalid ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Numero non valido: deve essere un multiplo di ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Chiav${issue2.keys.length > 1 ? "i" : "e"} non riconosciut${issue2.keys.length > 1 ? "e" : "a"}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Chiave non valida in ${issue2.origin}`;
      case "invalid_union":
        return "Input non valido";
      case "invalid_element":
        return `Valore non valido in ${issue2.origin}`;
      default:
        return `Input non valido`;
    }
  };
};
function it_default() {
  return {
    localeError: error20()
  };
}
// node_modules/zod/v4/locales/ja.js
var error21 = () => {
  const Sizable = {
    string: { unit: "文字", verb: "である" },
    file: { unit: "バイト", verb: "である" },
    array: { unit: "要素", verb: "である" },
    set: { unit: "要素", verb: "である" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType5 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "数値";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "配列";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "入力値",
    email: "メールアドレス",
    url: "URL",
    emoji: "絵文字",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO日時",
    date: "ISO日付",
    time: "ISO時刻",
    duration: "ISO期間",
    ipv4: "IPv4アドレス",
    ipv6: "IPv6アドレス",
    cidrv4: "IPv4範囲",
    cidrv6: "IPv6範囲",
    base64: "base64エンコード文字列",
    base64url: "base64urlエンコード文字列",
    json_string: "JSON文字列",
    e164: "E.164番号",
    jwt: "JWT",
    template_literal: "入力値"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `無効な入力: ${issue2.expected}が期待されましたが、${parsedType5(issue2.input)}が入力されました`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `無効な入力: ${stringifyPrimitive(issue2.values[0])}が期待されました`;
        return `無効な選択: ${joinValues(issue2.values, "、")}のいずれかである必要があります`;
      case "too_big": {
        const adj = issue2.inclusive ? "以下である" : "より小さい";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `大きすぎる値: ${issue2.origin ?? "値"}は${issue2.maximum.toString()}${sizing.unit ?? "要素"}${adj}必要があります`;
        return `大きすぎる値: ${issue2.origin ?? "値"}は${issue2.maximum.toString()}${adj}必要があります`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? "以上である" : "より大きい";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `小さすぎる値: ${issue2.origin}は${issue2.minimum.toString()}${sizing.unit}${adj}必要があります`;
        return `小さすぎる値: ${issue2.origin}は${issue2.minimum.toString()}${adj}必要があります`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `無効な文字列: "${_issue.prefix}"で始まる必要があります`;
        if (_issue.format === "ends_with")
          return `無効な文字列: "${_issue.suffix}"で終わる必要があります`;
        if (_issue.format === "includes")
          return `無効な文字列: "${_issue.includes}"を含む必要があります`;
        if (_issue.format === "regex")
          return `無効な文字列: パターン${_issue.pattern}に一致する必要があります`;
        return `無効な${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `無効な数値: ${issue2.divisor}の倍数である必要があります`;
      case "unrecognized_keys":
        return `認識されていないキー${issue2.keys.length > 1 ? "群" : ""}: ${joinValues(issue2.keys, "、")}`;
      case "invalid_key":
        return `${issue2.origin}内の無効なキー`;
      case "invalid_union":
        return "無効な入力";
      case "invalid_element":
        return `${issue2.origin}内の無効な値`;
      default:
        return `無効な入力`;
    }
  };
};
function ja_default() {
  return {
    localeError: error21()
  };
}
// node_modules/zod/v4/locales/ka.js
var parsedType5 = (data) => {
  const t = typeof data;
  switch (t) {
    case "number": {
      return Number.isNaN(data) ? "NaN" : "რიცხვი";
    }
    case "object": {
      if (Array.isArray(data)) {
        return "მასივი";
      }
      if (data === null) {
        return "null";
      }
      if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
        return data.constructor.name;
      }
    }
  }
  const typeMap = {
    string: "სტრინგი",
    boolean: "ბულეანი",
    undefined: "undefined",
    bigint: "bigint",
    symbol: "symbol",
    function: "ფუნქცია"
  };
  return typeMap[t] ?? t;
};
var error22 = () => {
  const Sizable = {
    string: { unit: "სიმბოლო", verb: "უნდა შეიცავდეს" },
    file: { unit: "ბაიტი", verb: "უნდა შეიცავდეს" },
    array: { unit: "ელემენტი", verb: "უნდა შეიცავდეს" },
    set: { unit: "ელემენტი", verb: "უნდა შეიცავდეს" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const Nouns = {
    regex: "შეყვანა",
    email: "ელ-ფოსტის მისამართი",
    url: "URL",
    emoji: "ემოჯი",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "თარიღი-დრო",
    date: "თარიღი",
    time: "დრო",
    duration: "ხანგრძლივობა",
    ipv4: "IPv4 მისამართი",
    ipv6: "IPv6 მისამართი",
    cidrv4: "IPv4 დიაპაზონი",
    cidrv6: "IPv6 დიაპაზონი",
    base64: "base64-კოდირებული სტრინგი",
    base64url: "base64url-კოდირებული სტრინგი",
    json_string: "JSON სტრინგი",
    e164: "E.164 ნომერი",
    jwt: "JWT",
    template_literal: "შეყვანა"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `არასწორი შეყვანა: მოსალოდნელი ${issue2.expected}, მიღებული ${parsedType5(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `არასწორი შეყვანა: მოსალოდნელი ${stringifyPrimitive(issue2.values[0])}`;
        return `არასწორი ვარიანტი: მოსალოდნელია ერთ-ერთი ${joinValues(issue2.values, "|")}-დან`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `ზედმეტად დიდი: მოსალოდნელი ${issue2.origin ?? "მნიშვნელობა"} ${sizing.verb} ${adj}${issue2.maximum.toString()} ${sizing.unit}`;
        return `ზედმეტად დიდი: მოსალოდნელი ${issue2.origin ?? "მნიშვნელობა"} იყოს ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `ზედმეტად პატარა: მოსალოდნელი ${issue2.origin} ${sizing.verb} ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `ზედმეტად პატარა: მოსალოდნელი ${issue2.origin} იყოს ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `არასწორი სტრინგი: უნდა იწყებოდეს "${_issue.prefix}"-ით`;
        }
        if (_issue.format === "ends_with")
          return `არასწორი სტრინგი: უნდა მთავრდებოდეს "${_issue.suffix}"-ით`;
        if (_issue.format === "includes")
          return `არასწორი სტრინგი: უნდა შეიცავდეს "${_issue.includes}"-ს`;
        if (_issue.format === "regex")
          return `არასწორი სტრინგი: უნდა შეესაბამებოდეს შაბლონს ${_issue.pattern}`;
        return `არასწორი ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `არასწორი რიცხვი: უნდა იყოს ${issue2.divisor}-ის ჯერადი`;
      case "unrecognized_keys":
        return `უცნობი გასაღებ${issue2.keys.length > 1 ? "ები" : "ი"}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `არასწორი გასაღები ${issue2.origin}-ში`;
      case "invalid_union":
        return "არასწორი შეყვანა";
      case "invalid_element":
        return `არასწორი მნიშვნელობა ${issue2.origin}-ში`;
      default:
        return `არასწორი შეყვანა`;
    }
  };
};
function ka_default() {
  return {
    localeError: error22()
  };
}
// node_modules/zod/v4/locales/km.js
var error23 = () => {
  const Sizable = {
    string: { unit: "តួអក្សរ", verb: "គួរមាន" },
    file: { unit: "បៃ", verb: "គួរមាន" },
    array: { unit: "ធាតុ", verb: "គួរមាន" },
    set: { unit: "ធាតុ", verb: "គួរមាន" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType6 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "មិនមែនជាលេខ (NaN)" : "លេខ";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "អារេ (Array)";
        }
        if (data === null) {
          return "គ្មានតម្លៃ (null)";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "ទិន្នន័យបញ្ចូល",
    email: "អាសយដ្ឋានអ៊ីមែល",
    url: "URL",
    emoji: "សញ្ញាអារម្មណ៍",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "កាលបរិច្ឆេទ និងម៉ោង ISO",
    date: "កាលបរិច្ឆេទ ISO",
    time: "ម៉ោង ISO",
    duration: "រយៈពេល ISO",
    ipv4: "អាសយដ្ឋាន IPv4",
    ipv6: "អាសយដ្ឋាន IPv6",
    cidrv4: "ដែនអាសយដ្ឋាន IPv4",
    cidrv6: "ដែនអាសយដ្ឋាន IPv6",
    base64: "ខ្សែអក្សរអ៊ិកូដ base64",
    base64url: "ខ្សែអក្សរអ៊ិកូដ base64url",
    json_string: "ខ្សែអក្សរ JSON",
    e164: "លេខ E.164",
    jwt: "JWT",
    template_literal: "ទិន្នន័យបញ្ចូល"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `ទិន្នន័យបញ្ចូលមិនត្រឹមត្រូវ៖ ត្រូវការ ${issue2.expected} ប៉ុន្តែទទួលបាន ${parsedType6(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `ទិន្នន័យបញ្ចូលមិនត្រឹមត្រូវ៖ ត្រូវការ ${stringifyPrimitive(issue2.values[0])}`;
        return `ជម្រើសមិនត្រឹមត្រូវ៖ ត្រូវជាមួយក្នុងចំណោម ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `ធំពេក៖ ត្រូវការ ${issue2.origin ?? "តម្លៃ"} ${adj} ${issue2.maximum.toString()} ${sizing.unit ?? "ធាតុ"}`;
        return `ធំពេក៖ ត្រូវការ ${issue2.origin ?? "តម្លៃ"} ${adj} ${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `តូចពេក៖ ត្រូវការ ${issue2.origin} ${adj} ${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `តូចពេក៖ ត្រូវការ ${issue2.origin} ${adj} ${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `ខ្សែអក្សរមិនត្រឹមត្រូវ៖ ត្រូវចាប់ផ្តើមដោយ "${_issue.prefix}"`;
        }
        if (_issue.format === "ends_with")
          return `ខ្សែអក្សរមិនត្រឹមត្រូវ៖ ត្រូវបញ្ចប់ដោយ "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `ខ្សែអក្សរមិនត្រឹមត្រូវ៖ ត្រូវមាន "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `ខ្សែអក្សរមិនត្រឹមត្រូវ៖ ត្រូវតែផ្គូផ្គងនឹងទម្រង់ដែលបានកំណត់ ${_issue.pattern}`;
        return `មិនត្រឹមត្រូវ៖ ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `លេខមិនត្រឹមត្រូវ៖ ត្រូវតែជាពហុគុណនៃ ${issue2.divisor}`;
      case "unrecognized_keys":
        return `រកឃើញសោមិនស្គាល់៖ ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `សោមិនត្រឹមត្រូវនៅក្នុង ${issue2.origin}`;
      case "invalid_union":
        return `ទិន្នន័យមិនត្រឹមត្រូវ`;
      case "invalid_element":
        return `ទិន្នន័យមិនត្រឹមត្រូវនៅក្នុង ${issue2.origin}`;
      default:
        return `ទិន្នន័យមិនត្រឹមត្រូវ`;
    }
  };
};
function km_default() {
  return {
    localeError: error23()
  };
}

// node_modules/zod/v4/locales/kh.js
function kh_default() {
  return km_default();
}
// node_modules/zod/v4/locales/ko.js
var error24 = () => {
  const Sizable = {
    string: { unit: "문자", verb: "to have" },
    file: { unit: "바이트", verb: "to have" },
    array: { unit: "개", verb: "to have" },
    set: { unit: "개", verb: "to have" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType6 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "number";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "array";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "입력",
    email: "이메일 주소",
    url: "URL",
    emoji: "이모지",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO 날짜시간",
    date: "ISO 날짜",
    time: "ISO 시간",
    duration: "ISO 기간",
    ipv4: "IPv4 주소",
    ipv6: "IPv6 주소",
    cidrv4: "IPv4 범위",
    cidrv6: "IPv6 범위",
    base64: "base64 인코딩 문자열",
    base64url: "base64url 인코딩 문자열",
    json_string: "JSON 문자열",
    e164: "E.164 번호",
    jwt: "JWT",
    template_literal: "입력"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `잘못된 입력: 예상 타입은 ${issue2.expected}, 받은 타입은 ${parsedType6(issue2.input)}입니다`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `잘못된 입력: 값은 ${stringifyPrimitive(issue2.values[0])} 이어야 합니다`;
        return `잘못된 옵션: ${joinValues(issue2.values, "또는 ")} 중 하나여야 합니다`;
      case "too_big": {
        const adj = issue2.inclusive ? "이하" : "미만";
        const suffix = adj === "미만" ? "이어야 합니다" : "여야 합니다";
        const sizing = getSizing(issue2.origin);
        const unit = sizing?.unit ?? "요소";
        if (sizing)
          return `${issue2.origin ?? "값"}이 너무 큽니다: ${issue2.maximum.toString()}${unit} ${adj}${suffix}`;
        return `${issue2.origin ?? "값"}이 너무 큽니다: ${issue2.maximum.toString()} ${adj}${suffix}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? "이상" : "초과";
        const suffix = adj === "이상" ? "이어야 합니다" : "여야 합니다";
        const sizing = getSizing(issue2.origin);
        const unit = sizing?.unit ?? "요소";
        if (sizing) {
          return `${issue2.origin ?? "값"}이 너무 작습니다: ${issue2.minimum.toString()}${unit} ${adj}${suffix}`;
        }
        return `${issue2.origin ?? "값"}이 너무 작습니다: ${issue2.minimum.toString()} ${adj}${suffix}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `잘못된 문자열: "${_issue.prefix}"(으)로 시작해야 합니다`;
        }
        if (_issue.format === "ends_with")
          return `잘못된 문자열: "${_issue.suffix}"(으)로 끝나야 합니다`;
        if (_issue.format === "includes")
          return `잘못된 문자열: "${_issue.includes}"을(를) 포함해야 합니다`;
        if (_issue.format === "regex")
          return `잘못된 문자열: 정규식 ${_issue.pattern} 패턴과 일치해야 합니다`;
        return `잘못된 ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `잘못된 숫자: ${issue2.divisor}의 배수여야 합니다`;
      case "unrecognized_keys":
        return `인식할 수 없는 키: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `잘못된 키: ${issue2.origin}`;
      case "invalid_union":
        return `잘못된 입력`;
      case "invalid_element":
        return `잘못된 값: ${issue2.origin}`;
      default:
        return `잘못된 입력`;
    }
  };
};
function ko_default() {
  return {
    localeError: error24()
  };
}
// node_modules/zod/v4/locales/lt.js
var parsedType6 = (data) => {
  const t = typeof data;
  return parsedTypeFromType(t, data);
};
var parsedTypeFromType = (t, data = undefined) => {
  switch (t) {
    case "number": {
      return Number.isNaN(data) ? "NaN" : "skaičius";
    }
    case "bigint": {
      return "sveikasis skaičius";
    }
    case "string": {
      return "eilutė";
    }
    case "boolean": {
      return "loginė reikšmė";
    }
    case "undefined":
    case "void": {
      return "neapibrėžta reikšmė";
    }
    case "function": {
      return "funkcija";
    }
    case "symbol": {
      return "simbolis";
    }
    case "object": {
      if (data === undefined)
        return "nežinomas objektas";
      if (data === null)
        return "nulinė reikšmė";
      if (Array.isArray(data))
        return "masyvas";
      if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
        return data.constructor.name;
      }
      return "objektas";
    }
    case "null": {
      return "nulinė reikšmė";
    }
  }
  return t;
};
var capitalizeFirstCharacter = (text) => {
  return text.charAt(0).toUpperCase() + text.slice(1);
};
function getUnitTypeFromNumber(number2) {
  const abs = Math.abs(number2);
  const last = abs % 10;
  const last2 = abs % 100;
  if (last2 >= 11 && last2 <= 19 || last === 0)
    return "many";
  if (last === 1)
    return "one";
  return "few";
}
var error25 = () => {
  const Sizable = {
    string: {
      unit: {
        one: "simbolis",
        few: "simboliai",
        many: "simbolių"
      },
      verb: {
        smaller: {
          inclusive: "turi būti ne ilgesnė kaip",
          notInclusive: "turi būti trumpesnė kaip"
        },
        bigger: {
          inclusive: "turi būti ne trumpesnė kaip",
          notInclusive: "turi būti ilgesnė kaip"
        }
      }
    },
    file: {
      unit: {
        one: "baitas",
        few: "baitai",
        many: "baitų"
      },
      verb: {
        smaller: {
          inclusive: "turi būti ne didesnis kaip",
          notInclusive: "turi būti mažesnis kaip"
        },
        bigger: {
          inclusive: "turi būti ne mažesnis kaip",
          notInclusive: "turi būti didesnis kaip"
        }
      }
    },
    array: {
      unit: {
        one: "elementą",
        few: "elementus",
        many: "elementų"
      },
      verb: {
        smaller: {
          inclusive: "turi turėti ne daugiau kaip",
          notInclusive: "turi turėti mažiau kaip"
        },
        bigger: {
          inclusive: "turi turėti ne mažiau kaip",
          notInclusive: "turi turėti daugiau kaip"
        }
      }
    },
    set: {
      unit: {
        one: "elementą",
        few: "elementus",
        many: "elementų"
      },
      verb: {
        smaller: {
          inclusive: "turi turėti ne daugiau kaip",
          notInclusive: "turi turėti mažiau kaip"
        },
        bigger: {
          inclusive: "turi turėti ne mažiau kaip",
          notInclusive: "turi turėti daugiau kaip"
        }
      }
    }
  };
  function getSizing(origin, unitType, inclusive, targetShouldBe) {
    const result = Sizable[origin] ?? null;
    if (result === null)
      return result;
    return {
      unit: result.unit[unitType],
      verb: result.verb[targetShouldBe][inclusive ? "inclusive" : "notInclusive"]
    };
  }
  const Nouns = {
    regex: "įvestis",
    email: "el. pašto adresas",
    url: "URL",
    emoji: "jaustukas",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO data ir laikas",
    date: "ISO data",
    time: "ISO laikas",
    duration: "ISO trukmė",
    ipv4: "IPv4 adresas",
    ipv6: "IPv6 adresas",
    cidrv4: "IPv4 tinklo prefiksas (CIDR)",
    cidrv6: "IPv6 tinklo prefiksas (CIDR)",
    base64: "base64 užkoduota eilutė",
    base64url: "base64url užkoduota eilutė",
    json_string: "JSON eilutė",
    e164: "E.164 numeris",
    jwt: "JWT",
    template_literal: "įvestis"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `Gautas tipas ${parsedType6(issue2.input)}, o tikėtasi - ${parsedTypeFromType(issue2.expected)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Privalo būti ${stringifyPrimitive(issue2.values[0])}`;
        return `Privalo būti vienas iš ${joinValues(issue2.values, "|")} pasirinkimų`;
      case "too_big": {
        const origin = parsedTypeFromType(issue2.origin);
        const sizing = getSizing(issue2.origin, getUnitTypeFromNumber(Number(issue2.maximum)), issue2.inclusive ?? false, "smaller");
        if (sizing?.verb)
          return `${capitalizeFirstCharacter(origin ?? issue2.origin ?? "reikšmė")} ${sizing.verb} ${issue2.maximum.toString()} ${sizing.unit ?? "elementų"}`;
        const adj = issue2.inclusive ? "ne didesnis kaip" : "mažesnis kaip";
        return `${capitalizeFirstCharacter(origin ?? issue2.origin ?? "reikšmė")} turi būti ${adj} ${issue2.maximum.toString()} ${sizing?.unit}`;
      }
      case "too_small": {
        const origin = parsedTypeFromType(issue2.origin);
        const sizing = getSizing(issue2.origin, getUnitTypeFromNumber(Number(issue2.minimum)), issue2.inclusive ?? false, "bigger");
        if (sizing?.verb)
          return `${capitalizeFirstCharacter(origin ?? issue2.origin ?? "reikšmė")} ${sizing.verb} ${issue2.minimum.toString()} ${sizing.unit ?? "elementų"}`;
        const adj = issue2.inclusive ? "ne mažesnis kaip" : "didesnis kaip";
        return `${capitalizeFirstCharacter(origin ?? issue2.origin ?? "reikšmė")} turi būti ${adj} ${issue2.minimum.toString()} ${sizing?.unit}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `Eilutė privalo prasidėti "${_issue.prefix}"`;
        }
        if (_issue.format === "ends_with")
          return `Eilutė privalo pasibaigti "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Eilutė privalo įtraukti "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Eilutė privalo atitikti ${_issue.pattern}`;
        return `Neteisingas ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Skaičius privalo būti ${issue2.divisor} kartotinis.`;
      case "unrecognized_keys":
        return `Neatpažint${issue2.keys.length > 1 ? "i" : "as"} rakt${issue2.keys.length > 1 ? "ai" : "as"}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return "Rastas klaidingas raktas";
      case "invalid_union":
        return "Klaidinga įvestis";
      case "invalid_element": {
        const origin = parsedTypeFromType(issue2.origin);
        return `${capitalizeFirstCharacter(origin ?? issue2.origin ?? "reikšmė")} turi klaidingą įvestį`;
      }
      default:
        return "Klaidinga įvestis";
    }
  };
};
function lt_default() {
  return {
    localeError: error25()
  };
}
// node_modules/zod/v4/locales/mk.js
var error26 = () => {
  const Sizable = {
    string: { unit: "знаци", verb: "да имаат" },
    file: { unit: "бајти", verb: "да имаат" },
    array: { unit: "ставки", verb: "да имаат" },
    set: { unit: "ставки", verb: "да имаат" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType7 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "број";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "низа";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "внес",
    email: "адреса на е-пошта",
    url: "URL",
    emoji: "емоџи",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO датум и време",
    date: "ISO датум",
    time: "ISO време",
    duration: "ISO времетраење",
    ipv4: "IPv4 адреса",
    ipv6: "IPv6 адреса",
    cidrv4: "IPv4 опсег",
    cidrv6: "IPv6 опсег",
    base64: "base64-енкодирана низа",
    base64url: "base64url-енкодирана низа",
    json_string: "JSON низа",
    e164: "E.164 број",
    jwt: "JWT",
    template_literal: "внес"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `Грешен внес: се очекува ${issue2.expected}, примено ${parsedType7(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Invalid input: expected ${stringifyPrimitive(issue2.values[0])}`;
        return `Грешана опција: се очекува една ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Премногу голем: се очекува ${issue2.origin ?? "вредноста"} да има ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "елементи"}`;
        return `Премногу голем: се очекува ${issue2.origin ?? "вредноста"} да биде ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Премногу мал: се очекува ${issue2.origin} да има ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Премногу мал: се очекува ${issue2.origin} да биде ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `Неважечка низа: мора да започнува со "${_issue.prefix}"`;
        }
        if (_issue.format === "ends_with")
          return `Неважечка низа: мора да завршува со "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Неважечка низа: мора да вклучува "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Неважечка низа: мора да одгоара на патернот ${_issue.pattern}`;
        return `Invalid ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Грешен број: мора да биде делив со ${issue2.divisor}`;
      case "unrecognized_keys":
        return `${issue2.keys.length > 1 ? "Непрепознаени клучеви" : "Непрепознаен клуч"}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Грешен клуч во ${issue2.origin}`;
      case "invalid_union":
        return "Грешен внес";
      case "invalid_element":
        return `Грешна вредност во ${issue2.origin}`;
      default:
        return `Грешен внес`;
    }
  };
};
function mk_default() {
  return {
    localeError: error26()
  };
}
// node_modules/zod/v4/locales/ms.js
var error27 = () => {
  const Sizable = {
    string: { unit: "aksara", verb: "mempunyai" },
    file: { unit: "bait", verb: "mempunyai" },
    array: { unit: "elemen", verb: "mempunyai" },
    set: { unit: "elemen", verb: "mempunyai" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType7 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "nombor";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "array";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "input",
    email: "alamat e-mel",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "tarikh masa ISO",
    date: "tarikh ISO",
    time: "masa ISO",
    duration: "tempoh ISO",
    ipv4: "alamat IPv4",
    ipv6: "alamat IPv6",
    cidrv4: "julat IPv4",
    cidrv6: "julat IPv6",
    base64: "string dikodkan base64",
    base64url: "string dikodkan base64url",
    json_string: "string JSON",
    e164: "nombor E.164",
    jwt: "JWT",
    template_literal: "input"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `Input tidak sah: dijangka ${issue2.expected}, diterima ${parsedType7(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Input tidak sah: dijangka ${stringifyPrimitive(issue2.values[0])}`;
        return `Pilihan tidak sah: dijangka salah satu daripada ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Terlalu besar: dijangka ${issue2.origin ?? "nilai"} ${sizing.verb} ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elemen"}`;
        return `Terlalu besar: dijangka ${issue2.origin ?? "nilai"} adalah ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Terlalu kecil: dijangka ${issue2.origin} ${sizing.verb} ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Terlalu kecil: dijangka ${issue2.origin} adalah ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `String tidak sah: mesti bermula dengan "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `String tidak sah: mesti berakhir dengan "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `String tidak sah: mesti mengandungi "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `String tidak sah: mesti sepadan dengan corak ${_issue.pattern}`;
        return `${Nouns[_issue.format] ?? issue2.format} tidak sah`;
      }
      case "not_multiple_of":
        return `Nombor tidak sah: perlu gandaan ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Kunci tidak dikenali: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Kunci tidak sah dalam ${issue2.origin}`;
      case "invalid_union":
        return "Input tidak sah";
      case "invalid_element":
        return `Nilai tidak sah dalam ${issue2.origin}`;
      default:
        return `Input tidak sah`;
    }
  };
};
function ms_default() {
  return {
    localeError: error27()
  };
}
// node_modules/zod/v4/locales/nl.js
var error28 = () => {
  const Sizable = {
    string: { unit: "tekens" },
    file: { unit: "bytes" },
    array: { unit: "elementen" },
    set: { unit: "elementen" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType7 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "getal";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "array";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "invoer",
    email: "emailadres",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO datum en tijd",
    date: "ISO datum",
    time: "ISO tijd",
    duration: "ISO duur",
    ipv4: "IPv4-adres",
    ipv6: "IPv6-adres",
    cidrv4: "IPv4-bereik",
    cidrv6: "IPv6-bereik",
    base64: "base64-gecodeerde tekst",
    base64url: "base64 URL-gecodeerde tekst",
    json_string: "JSON string",
    e164: "E.164-nummer",
    jwt: "JWT",
    template_literal: "invoer"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `Ongeldige invoer: verwacht ${issue2.expected}, ontving ${parsedType7(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Ongeldige invoer: verwacht ${stringifyPrimitive(issue2.values[0])}`;
        return `Ongeldige optie: verwacht één van ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Te lang: verwacht dat ${issue2.origin ?? "waarde"} ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elementen"} bevat`;
        return `Te lang: verwacht dat ${issue2.origin ?? "waarde"} ${adj}${issue2.maximum.toString()} is`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Te kort: verwacht dat ${issue2.origin} ${adj}${issue2.minimum.toString()} ${sizing.unit} bevat`;
        }
        return `Te kort: verwacht dat ${issue2.origin} ${adj}${issue2.minimum.toString()} is`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `Ongeldige tekst: moet met "${_issue.prefix}" beginnen`;
        }
        if (_issue.format === "ends_with")
          return `Ongeldige tekst: moet op "${_issue.suffix}" eindigen`;
        if (_issue.format === "includes")
          return `Ongeldige tekst: moet "${_issue.includes}" bevatten`;
        if (_issue.format === "regex")
          return `Ongeldige tekst: moet overeenkomen met patroon ${_issue.pattern}`;
        return `Ongeldig: ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Ongeldig getal: moet een veelvoud van ${issue2.divisor} zijn`;
      case "unrecognized_keys":
        return `Onbekende key${issue2.keys.length > 1 ? "s" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Ongeldige key in ${issue2.origin}`;
      case "invalid_union":
        return "Ongeldige invoer";
      case "invalid_element":
        return `Ongeldige waarde in ${issue2.origin}`;
      default:
        return `Ongeldige invoer`;
    }
  };
};
function nl_default() {
  return {
    localeError: error28()
  };
}
// node_modules/zod/v4/locales/no.js
var error29 = () => {
  const Sizable = {
    string: { unit: "tegn", verb: "å ha" },
    file: { unit: "bytes", verb: "å ha" },
    array: { unit: "elementer", verb: "å inneholde" },
    set: { unit: "elementer", verb: "å inneholde" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType7 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "tall";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "liste";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "input",
    email: "e-postadresse",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO dato- og klokkeslett",
    date: "ISO-dato",
    time: "ISO-klokkeslett",
    duration: "ISO-varighet",
    ipv4: "IPv4-område",
    ipv6: "IPv6-område",
    cidrv4: "IPv4-spekter",
    cidrv6: "IPv6-spekter",
    base64: "base64-enkodet streng",
    base64url: "base64url-enkodet streng",
    json_string: "JSON-streng",
    e164: "E.164-nummer",
    jwt: "JWT",
    template_literal: "input"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `Ugyldig input: forventet ${issue2.expected}, fikk ${parsedType7(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Ugyldig verdi: forventet ${stringifyPrimitive(issue2.values[0])}`;
        return `Ugyldig valg: forventet en av ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `For stor(t): forventet ${issue2.origin ?? "value"} til å ha ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elementer"}`;
        return `For stor(t): forventet ${issue2.origin ?? "value"} til å ha ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `For lite(n): forventet ${issue2.origin} til å ha ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `For lite(n): forventet ${issue2.origin} til å ha ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Ugyldig streng: må starte med "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `Ugyldig streng: må ende med "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Ugyldig streng: må inneholde "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Ugyldig streng: må matche mønsteret ${_issue.pattern}`;
        return `Ugyldig ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Ugyldig tall: må være et multiplum av ${issue2.divisor}`;
      case "unrecognized_keys":
        return `${issue2.keys.length > 1 ? "Ukjente nøkler" : "Ukjent nøkkel"}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Ugyldig nøkkel i ${issue2.origin}`;
      case "invalid_union":
        return "Ugyldig input";
      case "invalid_element":
        return `Ugyldig verdi i ${issue2.origin}`;
      default:
        return `Ugyldig input`;
    }
  };
};
function no_default() {
  return {
    localeError: error29()
  };
}
// node_modules/zod/v4/locales/ota.js
var error30 = () => {
  const Sizable = {
    string: { unit: "harf", verb: "olmalıdır" },
    file: { unit: "bayt", verb: "olmalıdır" },
    array: { unit: "unsur", verb: "olmalıdır" },
    set: { unit: "unsur", verb: "olmalıdır" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType7 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "numara";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "saf";
        }
        if (data === null) {
          return "gayb";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "giren",
    email: "epostagâh",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO hengâmı",
    date: "ISO tarihi",
    time: "ISO zamanı",
    duration: "ISO müddeti",
    ipv4: "IPv4 nişânı",
    ipv6: "IPv6 nişânı",
    cidrv4: "IPv4 menzili",
    cidrv6: "IPv6 menzili",
    base64: "base64-şifreli metin",
    base64url: "base64url-şifreli metin",
    json_string: "JSON metin",
    e164: "E.164 sayısı",
    jwt: "JWT",
    template_literal: "giren"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `Fâsit giren: umulan ${issue2.expected}, alınan ${parsedType7(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Fâsit giren: umulan ${stringifyPrimitive(issue2.values[0])}`;
        return `Fâsit tercih: mûteberler ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Fazla büyük: ${issue2.origin ?? "value"}, ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elements"} sahip olmalıydı.`;
        return `Fazla büyük: ${issue2.origin ?? "value"}, ${adj}${issue2.maximum.toString()} olmalıydı.`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Fazla küçük: ${issue2.origin}, ${adj}${issue2.minimum.toString()} ${sizing.unit} sahip olmalıydı.`;
        }
        return `Fazla küçük: ${issue2.origin}, ${adj}${issue2.minimum.toString()} olmalıydı.`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Fâsit metin: "${_issue.prefix}" ile başlamalı.`;
        if (_issue.format === "ends_with")
          return `Fâsit metin: "${_issue.suffix}" ile bitmeli.`;
        if (_issue.format === "includes")
          return `Fâsit metin: "${_issue.includes}" ihtivâ etmeli.`;
        if (_issue.format === "regex")
          return `Fâsit metin: ${_issue.pattern} nakşına uymalı.`;
        return `Fâsit ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Fâsit sayı: ${issue2.divisor} katı olmalıydı.`;
      case "unrecognized_keys":
        return `Tanınmayan anahtar ${issue2.keys.length > 1 ? "s" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `${issue2.origin} için tanınmayan anahtar var.`;
      case "invalid_union":
        return "Giren tanınamadı.";
      case "invalid_element":
        return `${issue2.origin} için tanınmayan kıymet var.`;
      default:
        return `Kıymet tanınamadı.`;
    }
  };
};
function ota_default() {
  return {
    localeError: error30()
  };
}
// node_modules/zod/v4/locales/ps.js
var error31 = () => {
  const Sizable = {
    string: { unit: "توکي", verb: "ولري" },
    file: { unit: "بایټس", verb: "ولري" },
    array: { unit: "توکي", verb: "ولري" },
    set: { unit: "توکي", verb: "ولري" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType7 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "عدد";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "ارې";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "ورودي",
    email: "بریښنالیک",
    url: "یو آر ال",
    emoji: "ایموجي",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "نیټه او وخت",
    date: "نېټه",
    time: "وخت",
    duration: "موده",
    ipv4: "د IPv4 پته",
    ipv6: "د IPv6 پته",
    cidrv4: "د IPv4 ساحه",
    cidrv6: "د IPv6 ساحه",
    base64: "base64-encoded متن",
    base64url: "base64url-encoded متن",
    json_string: "JSON متن",
    e164: "د E.164 شمېره",
    jwt: "JWT",
    template_literal: "ورودي"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `ناسم ورودي: باید ${issue2.expected} وای, مګر ${parsedType7(issue2.input)} ترلاسه شو`;
      case "invalid_value":
        if (issue2.values.length === 1) {
          return `ناسم ورودي: باید ${stringifyPrimitive(issue2.values[0])} وای`;
        }
        return `ناسم انتخاب: باید یو له ${joinValues(issue2.values, "|")} څخه وای`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `ډیر لوی: ${issue2.origin ?? "ارزښت"} باید ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "عنصرونه"} ولري`;
        }
        return `ډیر لوی: ${issue2.origin ?? "ارزښت"} باید ${adj}${issue2.maximum.toString()} وي`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `ډیر کوچنی: ${issue2.origin} باید ${adj}${issue2.minimum.toString()} ${sizing.unit} ولري`;
        }
        return `ډیر کوچنی: ${issue2.origin} باید ${adj}${issue2.minimum.toString()} وي`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `ناسم متن: باید د "${_issue.prefix}" سره پیل شي`;
        }
        if (_issue.format === "ends_with") {
          return `ناسم متن: باید د "${_issue.suffix}" سره پای ته ورسيږي`;
        }
        if (_issue.format === "includes") {
          return `ناسم متن: باید "${_issue.includes}" ولري`;
        }
        if (_issue.format === "regex") {
          return `ناسم متن: باید د ${_issue.pattern} سره مطابقت ولري`;
        }
        return `${Nouns[_issue.format] ?? issue2.format} ناسم دی`;
      }
      case "not_multiple_of":
        return `ناسم عدد: باید د ${issue2.divisor} مضرب وي`;
      case "unrecognized_keys":
        return `ناسم ${issue2.keys.length > 1 ? "کلیډونه" : "کلیډ"}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `ناسم کلیډ په ${issue2.origin} کې`;
      case "invalid_union":
        return `ناسمه ورودي`;
      case "invalid_element":
        return `ناسم عنصر په ${issue2.origin} کې`;
      default:
        return `ناسمه ورودي`;
    }
  };
};
function ps_default() {
  return {
    localeError: error31()
  };
}
// node_modules/zod/v4/locales/pl.js
var error32 = () => {
  const Sizable = {
    string: { unit: "znaków", verb: "mieć" },
    file: { unit: "bajtów", verb: "mieć" },
    array: { unit: "elementów", verb: "mieć" },
    set: { unit: "elementów", verb: "mieć" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType7 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "liczba";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "tablica";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "wyrażenie",
    email: "adres email",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "data i godzina w formacie ISO",
    date: "data w formacie ISO",
    time: "godzina w formacie ISO",
    duration: "czas trwania ISO",
    ipv4: "adres IPv4",
    ipv6: "adres IPv6",
    cidrv4: "zakres IPv4",
    cidrv6: "zakres IPv6",
    base64: "ciąg znaków zakodowany w formacie base64",
    base64url: "ciąg znaków zakodowany w formacie base64url",
    json_string: "ciąg znaków w formacie JSON",
    e164: "liczba E.164",
    jwt: "JWT",
    template_literal: "wejście"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `Nieprawidłowe dane wejściowe: oczekiwano ${issue2.expected}, otrzymano ${parsedType7(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Nieprawidłowe dane wejściowe: oczekiwano ${stringifyPrimitive(issue2.values[0])}`;
        return `Nieprawidłowa opcja: oczekiwano jednej z wartości ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Za duża wartość: oczekiwano, że ${issue2.origin ?? "wartość"} będzie mieć ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elementów"}`;
        }
        return `Zbyt duż(y/a/e): oczekiwano, że ${issue2.origin ?? "wartość"} będzie wynosić ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Za mała wartość: oczekiwano, że ${issue2.origin ?? "wartość"} będzie mieć ${adj}${issue2.minimum.toString()} ${sizing.unit ?? "elementów"}`;
        }
        return `Zbyt mał(y/a/e): oczekiwano, że ${issue2.origin ?? "wartość"} będzie wynosić ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Nieprawidłowy ciąg znaków: musi zaczynać się od "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `Nieprawidłowy ciąg znaków: musi kończyć się na "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Nieprawidłowy ciąg znaków: musi zawierać "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Nieprawidłowy ciąg znaków: musi odpowiadać wzorcowi ${_issue.pattern}`;
        return `Nieprawidłow(y/a/e) ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Nieprawidłowa liczba: musi być wielokrotnością ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Nierozpoznane klucze${issue2.keys.length > 1 ? "s" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Nieprawidłowy klucz w ${issue2.origin}`;
      case "invalid_union":
        return "Nieprawidłowe dane wejściowe";
      case "invalid_element":
        return `Nieprawidłowa wartość w ${issue2.origin}`;
      default:
        return `Nieprawidłowe dane wejściowe`;
    }
  };
};
function pl_default() {
  return {
    localeError: error32()
  };
}
// node_modules/zod/v4/locales/pt.js
var error33 = () => {
  const Sizable = {
    string: { unit: "caracteres", verb: "ter" },
    file: { unit: "bytes", verb: "ter" },
    array: { unit: "itens", verb: "ter" },
    set: { unit: "itens", verb: "ter" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType7 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "número";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "array";
        }
        if (data === null) {
          return "nulo";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "padrão",
    email: "endereço de e-mail",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "data e hora ISO",
    date: "data ISO",
    time: "hora ISO",
    duration: "duração ISO",
    ipv4: "endereço IPv4",
    ipv6: "endereço IPv6",
    cidrv4: "faixa de IPv4",
    cidrv6: "faixa de IPv6",
    base64: "texto codificado em base64",
    base64url: "URL codificada em base64",
    json_string: "texto JSON",
    e164: "número E.164",
    jwt: "JWT",
    template_literal: "entrada"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `Tipo inválido: esperado ${issue2.expected}, recebido ${parsedType7(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Entrada inválida: esperado ${stringifyPrimitive(issue2.values[0])}`;
        return `Opção inválida: esperada uma das ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Muito grande: esperado que ${issue2.origin ?? "valor"} tivesse ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elementos"}`;
        return `Muito grande: esperado que ${issue2.origin ?? "valor"} fosse ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Muito pequeno: esperado que ${issue2.origin} tivesse ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Muito pequeno: esperado que ${issue2.origin} fosse ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Texto inválido: deve começar com "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `Texto inválido: deve terminar com "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Texto inválido: deve incluir "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Texto inválido: deve corresponder ao padrão ${_issue.pattern}`;
        return `${Nouns[_issue.format] ?? issue2.format} inválido`;
      }
      case "not_multiple_of":
        return `Número inválido: deve ser múltiplo de ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Chave${issue2.keys.length > 1 ? "s" : ""} desconhecida${issue2.keys.length > 1 ? "s" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Chave inválida em ${issue2.origin}`;
      case "invalid_union":
        return "Entrada inválida";
      case "invalid_element":
        return `Valor inválido em ${issue2.origin}`;
      default:
        return `Campo inválido`;
    }
  };
};
function pt_default() {
  return {
    localeError: error33()
  };
}
// node_modules/zod/v4/locales/ru.js
function getRussianPlural(count, one, few, many) {
  const absCount = Math.abs(count);
  const lastDigit = absCount % 10;
  const lastTwoDigits = absCount % 100;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
    return many;
  }
  if (lastDigit === 1) {
    return one;
  }
  if (lastDigit >= 2 && lastDigit <= 4) {
    return few;
  }
  return many;
}
var error34 = () => {
  const Sizable = {
    string: {
      unit: {
        one: "символ",
        few: "символа",
        many: "символов"
      },
      verb: "иметь"
    },
    file: {
      unit: {
        one: "байт",
        few: "байта",
        many: "байт"
      },
      verb: "иметь"
    },
    array: {
      unit: {
        one: "элемент",
        few: "элемента",
        many: "элементов"
      },
      verb: "иметь"
    },
    set: {
      unit: {
        one: "элемент",
        few: "элемента",
        many: "элементов"
      },
      verb: "иметь"
    }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType7 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "число";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "массив";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "ввод",
    email: "email адрес",
    url: "URL",
    emoji: "эмодзи",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO дата и время",
    date: "ISO дата",
    time: "ISO время",
    duration: "ISO длительность",
    ipv4: "IPv4 адрес",
    ipv6: "IPv6 адрес",
    cidrv4: "IPv4 диапазон",
    cidrv6: "IPv6 диапазон",
    base64: "строка в формате base64",
    base64url: "строка в формате base64url",
    json_string: "JSON строка",
    e164: "номер E.164",
    jwt: "JWT",
    template_literal: "ввод"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `Неверный ввод: ожидалось ${issue2.expected}, получено ${parsedType7(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Неверный ввод: ожидалось ${stringifyPrimitive(issue2.values[0])}`;
        return `Неверный вариант: ожидалось одно из ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          const maxValue = Number(issue2.maximum);
          const unit = getRussianPlural(maxValue, sizing.unit.one, sizing.unit.few, sizing.unit.many);
          return `Слишком большое значение: ожидалось, что ${issue2.origin ?? "значение"} будет иметь ${adj}${issue2.maximum.toString()} ${unit}`;
        }
        return `Слишком большое значение: ожидалось, что ${issue2.origin ?? "значение"} будет ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          const minValue = Number(issue2.minimum);
          const unit = getRussianPlural(minValue, sizing.unit.one, sizing.unit.few, sizing.unit.many);
          return `Слишком маленькое значение: ожидалось, что ${issue2.origin} будет иметь ${adj}${issue2.minimum.toString()} ${unit}`;
        }
        return `Слишком маленькое значение: ожидалось, что ${issue2.origin} будет ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Неверная строка: должна начинаться с "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `Неверная строка: должна заканчиваться на "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Неверная строка: должна содержать "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Неверная строка: должна соответствовать шаблону ${_issue.pattern}`;
        return `Неверный ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Неверное число: должно быть кратным ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Нераспознанн${issue2.keys.length > 1 ? "ые" : "ый"} ключ${issue2.keys.length > 1 ? "и" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Неверный ключ в ${issue2.origin}`;
      case "invalid_union":
        return "Неверные входные данные";
      case "invalid_element":
        return `Неверное значение в ${issue2.origin}`;
      default:
        return `Неверные входные данные`;
    }
  };
};
function ru_default() {
  return {
    localeError: error34()
  };
}
// node_modules/zod/v4/locales/sl.js
var error35 = () => {
  const Sizable = {
    string: { unit: "znakov", verb: "imeti" },
    file: { unit: "bajtov", verb: "imeti" },
    array: { unit: "elementov", verb: "imeti" },
    set: { unit: "elementov", verb: "imeti" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType7 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "število";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "tabela";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "vnos",
    email: "e-poštni naslov",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO datum in čas",
    date: "ISO datum",
    time: "ISO čas",
    duration: "ISO trajanje",
    ipv4: "IPv4 naslov",
    ipv6: "IPv6 naslov",
    cidrv4: "obseg IPv4",
    cidrv6: "obseg IPv6",
    base64: "base64 kodiran niz",
    base64url: "base64url kodiran niz",
    json_string: "JSON niz",
    e164: "E.164 številka",
    jwt: "JWT",
    template_literal: "vnos"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `Neveljaven vnos: pričakovano ${issue2.expected}, prejeto ${parsedType7(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Neveljaven vnos: pričakovano ${stringifyPrimitive(issue2.values[0])}`;
        return `Neveljavna možnost: pričakovano eno izmed ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Preveliko: pričakovano, da bo ${issue2.origin ?? "vrednost"} imelo ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elementov"}`;
        return `Preveliko: pričakovano, da bo ${issue2.origin ?? "vrednost"} ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Premajhno: pričakovano, da bo ${issue2.origin} imelo ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Premajhno: pričakovano, da bo ${issue2.origin} ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `Neveljaven niz: mora se začeti z "${_issue.prefix}"`;
        }
        if (_issue.format === "ends_with")
          return `Neveljaven niz: mora se končati z "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Neveljaven niz: mora vsebovati "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Neveljaven niz: mora ustrezati vzorcu ${_issue.pattern}`;
        return `Neveljaven ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Neveljavno število: mora biti večkratnik ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Neprepoznan${issue2.keys.length > 1 ? "i ključi" : " ključ"}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Neveljaven ključ v ${issue2.origin}`;
      case "invalid_union":
        return "Neveljaven vnos";
      case "invalid_element":
        return `Neveljavna vrednost v ${issue2.origin}`;
      default:
        return "Neveljaven vnos";
    }
  };
};
function sl_default() {
  return {
    localeError: error35()
  };
}
// node_modules/zod/v4/locales/sv.js
var error36 = () => {
  const Sizable = {
    string: { unit: "tecken", verb: "att ha" },
    file: { unit: "bytes", verb: "att ha" },
    array: { unit: "objekt", verb: "att innehålla" },
    set: { unit: "objekt", verb: "att innehålla" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType7 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "antal";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "lista";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "reguljärt uttryck",
    email: "e-postadress",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO-datum och tid",
    date: "ISO-datum",
    time: "ISO-tid",
    duration: "ISO-varaktighet",
    ipv4: "IPv4-intervall",
    ipv6: "IPv6-intervall",
    cidrv4: "IPv4-spektrum",
    cidrv6: "IPv6-spektrum",
    base64: "base64-kodad sträng",
    base64url: "base64url-kodad sträng",
    json_string: "JSON-sträng",
    e164: "E.164-nummer",
    jwt: "JWT",
    template_literal: "mall-literal"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `Ogiltig inmatning: förväntat ${issue2.expected}, fick ${parsedType7(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Ogiltig inmatning: förväntat ${stringifyPrimitive(issue2.values[0])}`;
        return `Ogiltigt val: förväntade en av ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `För stor(t): förväntade ${issue2.origin ?? "värdet"} att ha ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "element"}`;
        }
        return `För stor(t): förväntat ${issue2.origin ?? "värdet"} att ha ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `För lite(t): förväntade ${issue2.origin ?? "värdet"} att ha ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `För lite(t): förväntade ${issue2.origin ?? "värdet"} att ha ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `Ogiltig sträng: måste börja med "${_issue.prefix}"`;
        }
        if (_issue.format === "ends_with")
          return `Ogiltig sträng: måste sluta med "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Ogiltig sträng: måste innehålla "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Ogiltig sträng: måste matcha mönstret "${_issue.pattern}"`;
        return `Ogiltig(t) ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Ogiltigt tal: måste vara en multipel av ${issue2.divisor}`;
      case "unrecognized_keys":
        return `${issue2.keys.length > 1 ? "Okända nycklar" : "Okänd nyckel"}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Ogiltig nyckel i ${issue2.origin ?? "värdet"}`;
      case "invalid_union":
        return "Ogiltig input";
      case "invalid_element":
        return `Ogiltigt värde i ${issue2.origin ?? "värdet"}`;
      default:
        return `Ogiltig input`;
    }
  };
};
function sv_default() {
  return {
    localeError: error36()
  };
}
// node_modules/zod/v4/locales/ta.js
var error37 = () => {
  const Sizable = {
    string: { unit: "எழுத்துக்கள்", verb: "கொண்டிருக்க வேண்டும்" },
    file: { unit: "பைட்டுகள்", verb: "கொண்டிருக்க வேண்டும்" },
    array: { unit: "உறுப்புகள்", verb: "கொண்டிருக்க வேண்டும்" },
    set: { unit: "உறுப்புகள்", verb: "கொண்டிருக்க வேண்டும்" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType7 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "எண் அல்லாதது" : "எண்";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "அணி";
        }
        if (data === null) {
          return "வெறுமை";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "உள்ளீடு",
    email: "மின்னஞ்சல் முகவரி",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO தேதி நேரம்",
    date: "ISO தேதி",
    time: "ISO நேரம்",
    duration: "ISO கால அளவு",
    ipv4: "IPv4 முகவரி",
    ipv6: "IPv6 முகவரி",
    cidrv4: "IPv4 வரம்பு",
    cidrv6: "IPv6 வரம்பு",
    base64: "base64-encoded சரம்",
    base64url: "base64url-encoded சரம்",
    json_string: "JSON சரம்",
    e164: "E.164 எண்",
    jwt: "JWT",
    template_literal: "input"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `தவறான உள்ளீடு: எதிர்பார்க்கப்பட்டது ${issue2.expected}, பெறப்பட்டது ${parsedType7(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `தவறான உள்ளீடு: எதிர்பார்க்கப்பட்டது ${stringifyPrimitive(issue2.values[0])}`;
        return `தவறான விருப்பம்: எதிர்பார்க்கப்பட்டது ${joinValues(issue2.values, "|")} இல் ஒன்று`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `மிக பெரியது: எதிர்பார்க்கப்பட்டது ${issue2.origin ?? "மதிப்பு"} ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "உறுப்புகள்"} ஆக இருக்க வேண்டும்`;
        }
        return `மிக பெரியது: எதிர்பார்க்கப்பட்டது ${issue2.origin ?? "மதிப்பு"} ${adj}${issue2.maximum.toString()} ஆக இருக்க வேண்டும்`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `மிகச் சிறியது: எதிர்பார்க்கப்பட்டது ${issue2.origin} ${adj}${issue2.minimum.toString()} ${sizing.unit} ஆக இருக்க வேண்டும்`;
        }
        return `மிகச் சிறியது: எதிர்பார்க்கப்பட்டது ${issue2.origin} ${adj}${issue2.minimum.toString()} ஆக இருக்க வேண்டும்`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `தவறான சரம்: "${_issue.prefix}" இல் தொடங்க வேண்டும்`;
        if (_issue.format === "ends_with")
          return `தவறான சரம்: "${_issue.suffix}" இல் முடிவடைய வேண்டும்`;
        if (_issue.format === "includes")
          return `தவறான சரம்: "${_issue.includes}" ஐ உள்ளடக்க வேண்டும்`;
        if (_issue.format === "regex")
          return `தவறான சரம்: ${_issue.pattern} முறைபாட்டுடன் பொருந்த வேண்டும்`;
        return `தவறான ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `தவறான எண்: ${issue2.divisor} இன் பலமாக இருக்க வேண்டும்`;
      case "unrecognized_keys":
        return `அடையாளம் தெரியாத விசை${issue2.keys.length > 1 ? "கள்" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `${issue2.origin} இல் தவறான விசை`;
      case "invalid_union":
        return "தவறான உள்ளீடு";
      case "invalid_element":
        return `${issue2.origin} இல் தவறான மதிப்பு`;
      default:
        return `தவறான உள்ளீடு`;
    }
  };
};
function ta_default() {
  return {
    localeError: error37()
  };
}
// node_modules/zod/v4/locales/th.js
var error38 = () => {
  const Sizable = {
    string: { unit: "ตัวอักษร", verb: "ควรมี" },
    file: { unit: "ไบต์", verb: "ควรมี" },
    array: { unit: "รายการ", verb: "ควรมี" },
    set: { unit: "รายการ", verb: "ควรมี" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType7 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "ไม่ใช่ตัวเลข (NaN)" : "ตัวเลข";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "อาร์เรย์ (Array)";
        }
        if (data === null) {
          return "ไม่มีค่า (null)";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "ข้อมูลที่ป้อน",
    email: "ที่อยู่อีเมล",
    url: "URL",
    emoji: "อิโมจิ",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "วันที่เวลาแบบ ISO",
    date: "วันที่แบบ ISO",
    time: "เวลาแบบ ISO",
    duration: "ช่วงเวลาแบบ ISO",
    ipv4: "ที่อยู่ IPv4",
    ipv6: "ที่อยู่ IPv6",
    cidrv4: "ช่วง IP แบบ IPv4",
    cidrv6: "ช่วง IP แบบ IPv6",
    base64: "ข้อความแบบ Base64",
    base64url: "ข้อความแบบ Base64 สำหรับ URL",
    json_string: "ข้อความแบบ JSON",
    e164: "เบอร์โทรศัพท์ระหว่างประเทศ (E.164)",
    jwt: "โทเคน JWT",
    template_literal: "ข้อมูลที่ป้อน"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `ประเภทข้อมูลไม่ถูกต้อง: ควรเป็น ${issue2.expected} แต่ได้รับ ${parsedType7(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `ค่าไม่ถูกต้อง: ควรเป็น ${stringifyPrimitive(issue2.values[0])}`;
        return `ตัวเลือกไม่ถูกต้อง: ควรเป็นหนึ่งใน ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "ไม่เกิน" : "น้อยกว่า";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `เกินกำหนด: ${issue2.origin ?? "ค่า"} ควรมี${adj} ${issue2.maximum.toString()} ${sizing.unit ?? "รายการ"}`;
        return `เกินกำหนด: ${issue2.origin ?? "ค่า"} ควรมี${adj} ${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? "อย่างน้อย" : "มากกว่า";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `น้อยกว่ากำหนด: ${issue2.origin} ควรมี${adj} ${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `น้อยกว่ากำหนด: ${issue2.origin} ควรมี${adj} ${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `รูปแบบไม่ถูกต้อง: ข้อความต้องขึ้นต้นด้วย "${_issue.prefix}"`;
        }
        if (_issue.format === "ends_with")
          return `รูปแบบไม่ถูกต้อง: ข้อความต้องลงท้ายด้วย "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `รูปแบบไม่ถูกต้อง: ข้อความต้องมี "${_issue.includes}" อยู่ในข้อความ`;
        if (_issue.format === "regex")
          return `รูปแบบไม่ถูกต้อง: ต้องตรงกับรูปแบบที่กำหนด ${_issue.pattern}`;
        return `รูปแบบไม่ถูกต้อง: ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `ตัวเลขไม่ถูกต้อง: ต้องเป็นจำนวนที่หารด้วย ${issue2.divisor} ได้ลงตัว`;
      case "unrecognized_keys":
        return `พบคีย์ที่ไม่รู้จัก: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `คีย์ไม่ถูกต้องใน ${issue2.origin}`;
      case "invalid_union":
        return "ข้อมูลไม่ถูกต้อง: ไม่ตรงกับรูปแบบยูเนียนที่กำหนดไว้";
      case "invalid_element":
        return `ข้อมูลไม่ถูกต้องใน ${issue2.origin}`;
      default:
        return `ข้อมูลไม่ถูกต้อง`;
    }
  };
};
function th_default() {
  return {
    localeError: error38()
  };
}
// node_modules/zod/v4/locales/tr.js
var parsedType7 = (data) => {
  const t = typeof data;
  switch (t) {
    case "number": {
      return Number.isNaN(data) ? "NaN" : "number";
    }
    case "object": {
      if (Array.isArray(data)) {
        return "array";
      }
      if (data === null) {
        return "null";
      }
      if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
        return data.constructor.name;
      }
    }
  }
  return t;
};
var error39 = () => {
  const Sizable = {
    string: { unit: "karakter", verb: "olmalı" },
    file: { unit: "bayt", verb: "olmalı" },
    array: { unit: "öğe", verb: "olmalı" },
    set: { unit: "öğe", verb: "olmalı" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const Nouns = {
    regex: "girdi",
    email: "e-posta adresi",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO tarih ve saat",
    date: "ISO tarih",
    time: "ISO saat",
    duration: "ISO süre",
    ipv4: "IPv4 adresi",
    ipv6: "IPv6 adresi",
    cidrv4: "IPv4 aralığı",
    cidrv6: "IPv6 aralığı",
    base64: "base64 ile şifrelenmiş metin",
    base64url: "base64url ile şifrelenmiş metin",
    json_string: "JSON dizesi",
    e164: "E.164 sayısı",
    jwt: "JWT",
    template_literal: "Şablon dizesi"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `Geçersiz değer: beklenen ${issue2.expected}, alınan ${parsedType7(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Geçersiz değer: beklenen ${stringifyPrimitive(issue2.values[0])}`;
        return `Geçersiz seçenek: aşağıdakilerden biri olmalı: ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Çok büyük: beklenen ${issue2.origin ?? "değer"} ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "öğe"}`;
        return `Çok büyük: beklenen ${issue2.origin ?? "değer"} ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Çok küçük: beklenen ${issue2.origin} ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        return `Çok küçük: beklenen ${issue2.origin} ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Geçersiz metin: "${_issue.prefix}" ile başlamalı`;
        if (_issue.format === "ends_with")
          return `Geçersiz metin: "${_issue.suffix}" ile bitmeli`;
        if (_issue.format === "includes")
          return `Geçersiz metin: "${_issue.includes}" içermeli`;
        if (_issue.format === "regex")
          return `Geçersiz metin: ${_issue.pattern} desenine uymalı`;
        return `Geçersiz ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Geçersiz sayı: ${issue2.divisor} ile tam bölünebilmeli`;
      case "unrecognized_keys":
        return `Tanınmayan anahtar${issue2.keys.length > 1 ? "lar" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `${issue2.origin} içinde geçersiz anahtar`;
      case "invalid_union":
        return "Geçersiz değer";
      case "invalid_element":
        return `${issue2.origin} içinde geçersiz değer`;
      default:
        return `Geçersiz değer`;
    }
  };
};
function tr_default() {
  return {
    localeError: error39()
  };
}
// node_modules/zod/v4/locales/uk.js
var error40 = () => {
  const Sizable = {
    string: { unit: "символів", verb: "матиме" },
    file: { unit: "байтів", verb: "матиме" },
    array: { unit: "елементів", verb: "матиме" },
    set: { unit: "елементів", verb: "матиме" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType8 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "число";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "масив";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "вхідні дані",
    email: "адреса електронної пошти",
    url: "URL",
    emoji: "емодзі",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "дата та час ISO",
    date: "дата ISO",
    time: "час ISO",
    duration: "тривалість ISO",
    ipv4: "адреса IPv4",
    ipv6: "адреса IPv6",
    cidrv4: "діапазон IPv4",
    cidrv6: "діапазон IPv6",
    base64: "рядок у кодуванні base64",
    base64url: "рядок у кодуванні base64url",
    json_string: "рядок JSON",
    e164: "номер E.164",
    jwt: "JWT",
    template_literal: "вхідні дані"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `Неправильні вхідні дані: очікується ${issue2.expected}, отримано ${parsedType8(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Неправильні вхідні дані: очікується ${stringifyPrimitive(issue2.values[0])}`;
        return `Неправильна опція: очікується одне з ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Занадто велике: очікується, що ${issue2.origin ?? "значення"} ${sizing.verb} ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "елементів"}`;
        return `Занадто велике: очікується, що ${issue2.origin ?? "значення"} буде ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Занадто мале: очікується, що ${issue2.origin} ${sizing.verb} ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Занадто мале: очікується, що ${issue2.origin} буде ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Неправильний рядок: повинен починатися з "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `Неправильний рядок: повинен закінчуватися на "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Неправильний рядок: повинен містити "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Неправильний рядок: повинен відповідати шаблону ${_issue.pattern}`;
        return `Неправильний ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Неправильне число: повинно бути кратним ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Нерозпізнаний ключ${issue2.keys.length > 1 ? "і" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Неправильний ключ у ${issue2.origin}`;
      case "invalid_union":
        return "Неправильні вхідні дані";
      case "invalid_element":
        return `Неправильне значення у ${issue2.origin}`;
      default:
        return `Неправильні вхідні дані`;
    }
  };
};
function uk_default() {
  return {
    localeError: error40()
  };
}

// node_modules/zod/v4/locales/ua.js
function ua_default() {
  return uk_default();
}
// node_modules/zod/v4/locales/ur.js
var error41 = () => {
  const Sizable = {
    string: { unit: "حروف", verb: "ہونا" },
    file: { unit: "بائٹس", verb: "ہونا" },
    array: { unit: "آئٹمز", verb: "ہونا" },
    set: { unit: "آئٹمز", verb: "ہونا" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType8 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "نمبر";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "آرے";
        }
        if (data === null) {
          return "نل";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "ان پٹ",
    email: "ای میل ایڈریس",
    url: "یو آر ایل",
    emoji: "ایموجی",
    uuid: "یو یو آئی ڈی",
    uuidv4: "یو یو آئی ڈی وی 4",
    uuidv6: "یو یو آئی ڈی وی 6",
    nanoid: "نینو آئی ڈی",
    guid: "جی یو آئی ڈی",
    cuid: "سی یو آئی ڈی",
    cuid2: "سی یو آئی ڈی 2",
    ulid: "یو ایل آئی ڈی",
    xid: "ایکس آئی ڈی",
    ksuid: "کے ایس یو آئی ڈی",
    datetime: "آئی ایس او ڈیٹ ٹائم",
    date: "آئی ایس او تاریخ",
    time: "آئی ایس او وقت",
    duration: "آئی ایس او مدت",
    ipv4: "آئی پی وی 4 ایڈریس",
    ipv6: "آئی پی وی 6 ایڈریس",
    cidrv4: "آئی پی وی 4 رینج",
    cidrv6: "آئی پی وی 6 رینج",
    base64: "بیس 64 ان کوڈڈ سٹرنگ",
    base64url: "بیس 64 یو آر ایل ان کوڈڈ سٹرنگ",
    json_string: "جے ایس او این سٹرنگ",
    e164: "ای 164 نمبر",
    jwt: "جے ڈبلیو ٹی",
    template_literal: "ان پٹ"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `غلط ان پٹ: ${issue2.expected} متوقع تھا، ${parsedType8(issue2.input)} موصول ہوا`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `غلط ان پٹ: ${stringifyPrimitive(issue2.values[0])} متوقع تھا`;
        return `غلط آپشن: ${joinValues(issue2.values, "|")} میں سے ایک متوقع تھا`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `بہت بڑا: ${issue2.origin ?? "ویلیو"} کے ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "عناصر"} ہونے متوقع تھے`;
        return `بہت بڑا: ${issue2.origin ?? "ویلیو"} کا ${adj}${issue2.maximum.toString()} ہونا متوقع تھا`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `بہت چھوٹا: ${issue2.origin} کے ${adj}${issue2.minimum.toString()} ${sizing.unit} ہونے متوقع تھے`;
        }
        return `بہت چھوٹا: ${issue2.origin} کا ${adj}${issue2.minimum.toString()} ہونا متوقع تھا`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `غلط سٹرنگ: "${_issue.prefix}" سے شروع ہونا چاہیے`;
        }
        if (_issue.format === "ends_with")
          return `غلط سٹرنگ: "${_issue.suffix}" پر ختم ہونا چاہیے`;
        if (_issue.format === "includes")
          return `غلط سٹرنگ: "${_issue.includes}" شامل ہونا چاہیے`;
        if (_issue.format === "regex")
          return `غلط سٹرنگ: پیٹرن ${_issue.pattern} سے میچ ہونا چاہیے`;
        return `غلط ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `غلط نمبر: ${issue2.divisor} کا مضاعف ہونا چاہیے`;
      case "unrecognized_keys":
        return `غیر تسلیم شدہ کی${issue2.keys.length > 1 ? "ز" : ""}: ${joinValues(issue2.keys, "، ")}`;
      case "invalid_key":
        return `${issue2.origin} میں غلط کی`;
      case "invalid_union":
        return "غلط ان پٹ";
      case "invalid_element":
        return `${issue2.origin} میں غلط ویلیو`;
      default:
        return `غلط ان پٹ`;
    }
  };
};
function ur_default() {
  return {
    localeError: error41()
  };
}
// node_modules/zod/v4/locales/vi.js
var error42 = () => {
  const Sizable = {
    string: { unit: "ký tự", verb: "có" },
    file: { unit: "byte", verb: "có" },
    array: { unit: "phần tử", verb: "có" },
    set: { unit: "phần tử", verb: "có" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType8 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "số";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "mảng";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "đầu vào",
    email: "địa chỉ email",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ngày giờ ISO",
    date: "ngày ISO",
    time: "giờ ISO",
    duration: "khoảng thời gian ISO",
    ipv4: "địa chỉ IPv4",
    ipv6: "địa chỉ IPv6",
    cidrv4: "dải IPv4",
    cidrv6: "dải IPv6",
    base64: "chuỗi mã hóa base64",
    base64url: "chuỗi mã hóa base64url",
    json_string: "chuỗi JSON",
    e164: "số E.164",
    jwt: "JWT",
    template_literal: "đầu vào"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `Đầu vào không hợp lệ: mong đợi ${issue2.expected}, nhận được ${parsedType8(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Đầu vào không hợp lệ: mong đợi ${stringifyPrimitive(issue2.values[0])}`;
        return `Tùy chọn không hợp lệ: mong đợi một trong các giá trị ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Quá lớn: mong đợi ${issue2.origin ?? "giá trị"} ${sizing.verb} ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "phần tử"}`;
        return `Quá lớn: mong đợi ${issue2.origin ?? "giá trị"} ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Quá nhỏ: mong đợi ${issue2.origin} ${sizing.verb} ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Quá nhỏ: mong đợi ${issue2.origin} ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Chuỗi không hợp lệ: phải bắt đầu bằng "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `Chuỗi không hợp lệ: phải kết thúc bằng "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Chuỗi không hợp lệ: phải bao gồm "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Chuỗi không hợp lệ: phải khớp với mẫu ${_issue.pattern}`;
        return `${Nouns[_issue.format] ?? issue2.format} không hợp lệ`;
      }
      case "not_multiple_of":
        return `Số không hợp lệ: phải là bội số của ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Khóa không được nhận dạng: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Khóa không hợp lệ trong ${issue2.origin}`;
      case "invalid_union":
        return "Đầu vào không hợp lệ";
      case "invalid_element":
        return `Giá trị không hợp lệ trong ${issue2.origin}`;
      default:
        return `Đầu vào không hợp lệ`;
    }
  };
};
function vi_default() {
  return {
    localeError: error42()
  };
}
// node_modules/zod/v4/locales/zh-CN.js
var error43 = () => {
  const Sizable = {
    string: { unit: "字符", verb: "包含" },
    file: { unit: "字节", verb: "包含" },
    array: { unit: "项", verb: "包含" },
    set: { unit: "项", verb: "包含" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType8 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "非数字(NaN)" : "数字";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "数组";
        }
        if (data === null) {
          return "空值(null)";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "输入",
    email: "电子邮件",
    url: "URL",
    emoji: "表情符号",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO日期时间",
    date: "ISO日期",
    time: "ISO时间",
    duration: "ISO时长",
    ipv4: "IPv4地址",
    ipv6: "IPv6地址",
    cidrv4: "IPv4网段",
    cidrv6: "IPv6网段",
    base64: "base64编码字符串",
    base64url: "base64url编码字符串",
    json_string: "JSON字符串",
    e164: "E.164号码",
    jwt: "JWT",
    template_literal: "输入"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `无效输入：期望 ${issue2.expected}，实际接收 ${parsedType8(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `无效输入：期望 ${stringifyPrimitive(issue2.values[0])}`;
        return `无效选项：期望以下之一 ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `数值过大：期望 ${issue2.origin ?? "值"} ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "个元素"}`;
        return `数值过大：期望 ${issue2.origin ?? "值"} ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `数值过小：期望 ${issue2.origin} ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `数值过小：期望 ${issue2.origin} ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `无效字符串：必须以 "${_issue.prefix}" 开头`;
        if (_issue.format === "ends_with")
          return `无效字符串：必须以 "${_issue.suffix}" 结尾`;
        if (_issue.format === "includes")
          return `无效字符串：必须包含 "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `无效字符串：必须满足正则表达式 ${_issue.pattern}`;
        return `无效${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `无效数字：必须是 ${issue2.divisor} 的倍数`;
      case "unrecognized_keys":
        return `出现未知的键(key): ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `${issue2.origin} 中的键(key)无效`;
      case "invalid_union":
        return "无效输入";
      case "invalid_element":
        return `${issue2.origin} 中包含无效值(value)`;
      default:
        return `无效输入`;
    }
  };
};
function zh_CN_default() {
  return {
    localeError: error43()
  };
}
// node_modules/zod/v4/locales/zh-TW.js
var error44 = () => {
  const Sizable = {
    string: { unit: "字元", verb: "擁有" },
    file: { unit: "位元組", verb: "擁有" },
    array: { unit: "項目", verb: "擁有" },
    set: { unit: "項目", verb: "擁有" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType8 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "number";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "array";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "輸入",
    email: "郵件地址",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO 日期時間",
    date: "ISO 日期",
    time: "ISO 時間",
    duration: "ISO 期間",
    ipv4: "IPv4 位址",
    ipv6: "IPv6 位址",
    cidrv4: "IPv4 範圍",
    cidrv6: "IPv6 範圍",
    base64: "base64 編碼字串",
    base64url: "base64url 編碼字串",
    json_string: "JSON 字串",
    e164: "E.164 數值",
    jwt: "JWT",
    template_literal: "輸入"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `無效的輸入值：預期為 ${issue2.expected}，但收到 ${parsedType8(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `無效的輸入值：預期為 ${stringifyPrimitive(issue2.values[0])}`;
        return `無效的選項：預期為以下其中之一 ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `數值過大：預期 ${issue2.origin ?? "值"} 應為 ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "個元素"}`;
        return `數值過大：預期 ${issue2.origin ?? "值"} 應為 ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `數值過小：預期 ${issue2.origin} 應為 ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `數值過小：預期 ${issue2.origin} 應為 ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `無效的字串：必須以 "${_issue.prefix}" 開頭`;
        }
        if (_issue.format === "ends_with")
          return `無效的字串：必須以 "${_issue.suffix}" 結尾`;
        if (_issue.format === "includes")
          return `無效的字串：必須包含 "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `無效的字串：必須符合格式 ${_issue.pattern}`;
        return `無效的 ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `無效的數字：必須為 ${issue2.divisor} 的倍數`;
      case "unrecognized_keys":
        return `無法識別的鍵值${issue2.keys.length > 1 ? "們" : ""}：${joinValues(issue2.keys, "、")}`;
      case "invalid_key":
        return `${issue2.origin} 中有無效的鍵值`;
      case "invalid_union":
        return "無效的輸入值";
      case "invalid_element":
        return `${issue2.origin} 中有無效的值`;
      default:
        return `無效的輸入值`;
    }
  };
};
function zh_TW_default() {
  return {
    localeError: error44()
  };
}
// node_modules/zod/v4/locales/yo.js
var error45 = () => {
  const Sizable = {
    string: { unit: "àmi", verb: "ní" },
    file: { unit: "bytes", verb: "ní" },
    array: { unit: "nkan", verb: "ní" },
    set: { unit: "nkan", verb: "ní" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const parsedType8 = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "nọ́mbà";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "akopọ";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  const Nouns = {
    regex: "ẹ̀rọ ìbáwọlé",
    email: "àdírẹ́sì ìmẹ́lì",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "àkókò ISO",
    date: "ọjọ́ ISO",
    time: "àkókò ISO",
    duration: "àkókò tó pé ISO",
    ipv4: "àdírẹ́sì IPv4",
    ipv6: "àdírẹ́sì IPv6",
    cidrv4: "àgbègbè IPv4",
    cidrv6: "àgbègbè IPv6",
    base64: "ọ̀rọ̀ tí a kọ́ ní base64",
    base64url: "ọ̀rọ̀ base64url",
    json_string: "ọ̀rọ̀ JSON",
    e164: "nọ́mbà E.164",
    jwt: "JWT",
    template_literal: "ẹ̀rọ ìbáwọlé"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type":
        return `Ìbáwọlé aṣìṣe: a ní láti fi ${issue2.expected}, àmọ̀ a rí ${parsedType8(issue2.input)}`;
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Ìbáwọlé aṣìṣe: a ní láti fi ${stringifyPrimitive(issue2.values[0])}`;
        return `Àṣàyàn aṣìṣe: yan ọ̀kan lára ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Tó pọ̀ jù: a ní láti jẹ́ pé ${issue2.origin ?? "iye"} ${sizing.verb} ${adj}${issue2.maximum} ${sizing.unit}`;
        return `Tó pọ̀ jù: a ní láti jẹ́ ${adj}${issue2.maximum}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Kéré ju: a ní láti jẹ́ pé ${issue2.origin} ${sizing.verb} ${adj}${issue2.minimum} ${sizing.unit}`;
        return `Kéré ju: a ní láti jẹ́ ${adj}${issue2.minimum}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Ọ̀rọ̀ aṣìṣe: gbọ́dọ̀ bẹ̀rẹ̀ pẹ̀lú "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `Ọ̀rọ̀ aṣìṣe: gbọ́dọ̀ parí pẹ̀lú "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Ọ̀rọ̀ aṣìṣe: gbọ́dọ̀ ní "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Ọ̀rọ̀ aṣìṣe: gbọ́dọ̀ bá àpẹẹrẹ mu ${_issue.pattern}`;
        return `Aṣìṣe: ${Nouns[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Nọ́mbà aṣìṣe: gbọ́dọ̀ jẹ́ èyà pípín ti ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Bọtìnì àìmọ̀: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Bọtìnì aṣìṣe nínú ${issue2.origin}`;
      case "invalid_union":
        return "Ìbáwọlé aṣìṣe";
      case "invalid_element":
        return `Iye aṣìṣe nínú ${issue2.origin}`;
      default:
        return "Ìbáwọlé aṣìṣe";
    }
  };
};
function yo_default() {
  return {
    localeError: error45()
  };
}
// node_modules/zod/v4/core/registries.js
var $output = Symbol("ZodOutput");
var $input = Symbol("ZodInput");

class $ZodRegistry {
  constructor() {
    this._map = new WeakMap;
    this._idmap = new Map;
  }
  add(schema, ..._meta) {
    const meta = _meta[0];
    this._map.set(schema, meta);
    if (meta && typeof meta === "object" && "id" in meta) {
      if (this._idmap.has(meta.id)) {
        throw new Error(`ID ${meta.id} already exists in the registry`);
      }
      this._idmap.set(meta.id, schema);
    }
    return this;
  }
  clear() {
    this._map = new WeakMap;
    this._idmap = new Map;
    return this;
  }
  remove(schema) {
    const meta = this._map.get(schema);
    if (meta && typeof meta === "object" && "id" in meta) {
      this._idmap.delete(meta.id);
    }
    this._map.delete(schema);
    return this;
  }
  get(schema) {
    const p = schema._zod.parent;
    if (p) {
      const pm = { ...this.get(p) ?? {} };
      delete pm.id;
      const f = { ...pm, ...this._map.get(schema) };
      return Object.keys(f).length ? f : undefined;
    }
    return this._map.get(schema);
  }
  has(schema) {
    return this._map.has(schema);
  }
}
function registry() {
  return new $ZodRegistry;
}
var globalRegistry = /* @__PURE__ */ registry();
// node_modules/zod/v4/core/api.js
function _string(Class2, params) {
  return new Class2({
    type: "string",
    ...normalizeParams(params)
  });
}
function _coercedString(Class2, params) {
  return new Class2({
    type: "string",
    coerce: true,
    ...normalizeParams(params)
  });
}
function _email(Class2, params) {
  return new Class2({
    type: "string",
    format: "email",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _guid(Class2, params) {
  return new Class2({
    type: "string",
    format: "guid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _uuid(Class2, params) {
  return new Class2({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _uuidv4(Class2, params) {
  return new Class2({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    version: "v4",
    ...normalizeParams(params)
  });
}
function _uuidv6(Class2, params) {
  return new Class2({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    version: "v6",
    ...normalizeParams(params)
  });
}
function _uuidv7(Class2, params) {
  return new Class2({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    version: "v7",
    ...normalizeParams(params)
  });
}
function _url(Class2, params) {
  return new Class2({
    type: "string",
    format: "url",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _emoji2(Class2, params) {
  return new Class2({
    type: "string",
    format: "emoji",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _nanoid(Class2, params) {
  return new Class2({
    type: "string",
    format: "nanoid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _cuid(Class2, params) {
  return new Class2({
    type: "string",
    format: "cuid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _cuid2(Class2, params) {
  return new Class2({
    type: "string",
    format: "cuid2",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _ulid(Class2, params) {
  return new Class2({
    type: "string",
    format: "ulid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _xid(Class2, params) {
  return new Class2({
    type: "string",
    format: "xid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _ksuid(Class2, params) {
  return new Class2({
    type: "string",
    format: "ksuid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _ipv4(Class2, params) {
  return new Class2({
    type: "string",
    format: "ipv4",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _ipv6(Class2, params) {
  return new Class2({
    type: "string",
    format: "ipv6",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _cidrv4(Class2, params) {
  return new Class2({
    type: "string",
    format: "cidrv4",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _cidrv6(Class2, params) {
  return new Class2({
    type: "string",
    format: "cidrv6",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _base64(Class2, params) {
  return new Class2({
    type: "string",
    format: "base64",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _base64url(Class2, params) {
  return new Class2({
    type: "string",
    format: "base64url",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _e164(Class2, params) {
  return new Class2({
    type: "string",
    format: "e164",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _jwt(Class2, params) {
  return new Class2({
    type: "string",
    format: "jwt",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
var TimePrecision = {
  Any: null,
  Minute: -1,
  Second: 0,
  Millisecond: 3,
  Microsecond: 6
};
function _isoDateTime(Class2, params) {
  return new Class2({
    type: "string",
    format: "datetime",
    check: "string_format",
    offset: false,
    local: false,
    precision: null,
    ...normalizeParams(params)
  });
}
function _isoDate(Class2, params) {
  return new Class2({
    type: "string",
    format: "date",
    check: "string_format",
    ...normalizeParams(params)
  });
}
function _isoTime(Class2, params) {
  return new Class2({
    type: "string",
    format: "time",
    check: "string_format",
    precision: null,
    ...normalizeParams(params)
  });
}
function _isoDuration(Class2, params) {
  return new Class2({
    type: "string",
    format: "duration",
    check: "string_format",
    ...normalizeParams(params)
  });
}
function _number(Class2, params) {
  return new Class2({
    type: "number",
    checks: [],
    ...normalizeParams(params)
  });
}
function _coercedNumber(Class2, params) {
  return new Class2({
    type: "number",
    coerce: true,
    checks: [],
    ...normalizeParams(params)
  });
}
function _int(Class2, params) {
  return new Class2({
    type: "number",
    check: "number_format",
    abort: false,
    format: "safeint",
    ...normalizeParams(params)
  });
}
function _float32(Class2, params) {
  return new Class2({
    type: "number",
    check: "number_format",
    abort: false,
    format: "float32",
    ...normalizeParams(params)
  });
}
function _float64(Class2, params) {
  return new Class2({
    type: "number",
    check: "number_format",
    abort: false,
    format: "float64",
    ...normalizeParams(params)
  });
}
function _int32(Class2, params) {
  return new Class2({
    type: "number",
    check: "number_format",
    abort: false,
    format: "int32",
    ...normalizeParams(params)
  });
}
function _uint32(Class2, params) {
  return new Class2({
    type: "number",
    check: "number_format",
    abort: false,
    format: "uint32",
    ...normalizeParams(params)
  });
}
function _boolean(Class2, params) {
  return new Class2({
    type: "boolean",
    ...normalizeParams(params)
  });
}
function _coercedBoolean(Class2, params) {
  return new Class2({
    type: "boolean",
    coerce: true,
    ...normalizeParams(params)
  });
}
function _bigint(Class2, params) {
  return new Class2({
    type: "bigint",
    ...normalizeParams(params)
  });
}
function _coercedBigint(Class2, params) {
  return new Class2({
    type: "bigint",
    coerce: true,
    ...normalizeParams(params)
  });
}
function _int64(Class2, params) {
  return new Class2({
    type: "bigint",
    check: "bigint_format",
    abort: false,
    format: "int64",
    ...normalizeParams(params)
  });
}
function _uint64(Class2, params) {
  return new Class2({
    type: "bigint",
    check: "bigint_format",
    abort: false,
    format: "uint64",
    ...normalizeParams(params)
  });
}
function _symbol(Class2, params) {
  return new Class2({
    type: "symbol",
    ...normalizeParams(params)
  });
}
function _undefined2(Class2, params) {
  return new Class2({
    type: "undefined",
    ...normalizeParams(params)
  });
}
function _null2(Class2, params) {
  return new Class2({
    type: "null",
    ...normalizeParams(params)
  });
}
function _any(Class2) {
  return new Class2({
    type: "any"
  });
}
function _unknown(Class2) {
  return new Class2({
    type: "unknown"
  });
}
function _never(Class2, params) {
  return new Class2({
    type: "never",
    ...normalizeParams(params)
  });
}
function _void(Class2, params) {
  return new Class2({
    type: "void",
    ...normalizeParams(params)
  });
}
function _date(Class2, params) {
  return new Class2({
    type: "date",
    ...normalizeParams(params)
  });
}
function _coercedDate(Class2, params) {
  return new Class2({
    type: "date",
    coerce: true,
    ...normalizeParams(params)
  });
}
function _nan(Class2, params) {
  return new Class2({
    type: "nan",
    ...normalizeParams(params)
  });
}
function _lt(value, params) {
  return new $ZodCheckLessThan({
    check: "less_than",
    ...normalizeParams(params),
    value,
    inclusive: false
  });
}
function _lte(value, params) {
  return new $ZodCheckLessThan({
    check: "less_than",
    ...normalizeParams(params),
    value,
    inclusive: true
  });
}
function _gt(value, params) {
  return new $ZodCheckGreaterThan({
    check: "greater_than",
    ...normalizeParams(params),
    value,
    inclusive: false
  });
}
function _gte(value, params) {
  return new $ZodCheckGreaterThan({
    check: "greater_than",
    ...normalizeParams(params),
    value,
    inclusive: true
  });
}
function _positive(params) {
  return _gt(0, params);
}
function _negative(params) {
  return _lt(0, params);
}
function _nonpositive(params) {
  return _lte(0, params);
}
function _nonnegative(params) {
  return _gte(0, params);
}
function _multipleOf(value, params) {
  return new $ZodCheckMultipleOf({
    check: "multiple_of",
    ...normalizeParams(params),
    value
  });
}
function _maxSize(maximum, params) {
  return new $ZodCheckMaxSize({
    check: "max_size",
    ...normalizeParams(params),
    maximum
  });
}
function _minSize(minimum, params) {
  return new $ZodCheckMinSize({
    check: "min_size",
    ...normalizeParams(params),
    minimum
  });
}
function _size(size, params) {
  return new $ZodCheckSizeEquals({
    check: "size_equals",
    ...normalizeParams(params),
    size
  });
}
function _maxLength(maximum, params) {
  const ch = new $ZodCheckMaxLength({
    check: "max_length",
    ...normalizeParams(params),
    maximum
  });
  return ch;
}
function _minLength(minimum, params) {
  return new $ZodCheckMinLength({
    check: "min_length",
    ...normalizeParams(params),
    minimum
  });
}
function _length(length, params) {
  return new $ZodCheckLengthEquals({
    check: "length_equals",
    ...normalizeParams(params),
    length
  });
}
function _regex(pattern, params) {
  return new $ZodCheckRegex({
    check: "string_format",
    format: "regex",
    ...normalizeParams(params),
    pattern
  });
}
function _lowercase(params) {
  return new $ZodCheckLowerCase({
    check: "string_format",
    format: "lowercase",
    ...normalizeParams(params)
  });
}
function _uppercase(params) {
  return new $ZodCheckUpperCase({
    check: "string_format",
    format: "uppercase",
    ...normalizeParams(params)
  });
}
function _includes(includes, params) {
  return new $ZodCheckIncludes({
    check: "string_format",
    format: "includes",
    ...normalizeParams(params),
    includes
  });
}
function _startsWith(prefix, params) {
  return new $ZodCheckStartsWith({
    check: "string_format",
    format: "starts_with",
    ...normalizeParams(params),
    prefix
  });
}
function _endsWith(suffix, params) {
  return new $ZodCheckEndsWith({
    check: "string_format",
    format: "ends_with",
    ...normalizeParams(params),
    suffix
  });
}
function _property(property, schema, params) {
  return new $ZodCheckProperty({
    check: "property",
    property,
    schema,
    ...normalizeParams(params)
  });
}
function _mime(types, params) {
  return new $ZodCheckMimeType({
    check: "mime_type",
    mime: types,
    ...normalizeParams(params)
  });
}
function _overwrite(tx) {
  return new $ZodCheckOverwrite({
    check: "overwrite",
    tx
  });
}
function _normalize(form) {
  return _overwrite((input) => input.normalize(form));
}
function _trim() {
  return _overwrite((input) => input.trim());
}
function _toLowerCase() {
  return _overwrite((input) => input.toLowerCase());
}
function _toUpperCase() {
  return _overwrite((input) => input.toUpperCase());
}
function _array(Class2, element, params) {
  return new Class2({
    type: "array",
    element,
    ...normalizeParams(params)
  });
}
function _union(Class2, options, params) {
  return new Class2({
    type: "union",
    options,
    ...normalizeParams(params)
  });
}
function _discriminatedUnion(Class2, discriminator, options, params) {
  return new Class2({
    type: "union",
    options,
    discriminator,
    ...normalizeParams(params)
  });
}
function _intersection(Class2, left, right) {
  return new Class2({
    type: "intersection",
    left,
    right
  });
}
function _tuple(Class2, items, _paramsOrRest, _params) {
  const hasRest = _paramsOrRest instanceof $ZodType;
  const params = hasRest ? _params : _paramsOrRest;
  const rest = hasRest ? _paramsOrRest : null;
  return new Class2({
    type: "tuple",
    items,
    rest,
    ...normalizeParams(params)
  });
}
function _record(Class2, keyType, valueType, params) {
  return new Class2({
    type: "record",
    keyType,
    valueType,
    ...normalizeParams(params)
  });
}
function _map(Class2, keyType, valueType, params) {
  return new Class2({
    type: "map",
    keyType,
    valueType,
    ...normalizeParams(params)
  });
}
function _set(Class2, valueType, params) {
  return new Class2({
    type: "set",
    valueType,
    ...normalizeParams(params)
  });
}
function _enum(Class2, values, params) {
  const entries = Array.isArray(values) ? Object.fromEntries(values.map((v) => [v, v])) : values;
  return new Class2({
    type: "enum",
    entries,
    ...normalizeParams(params)
  });
}
function _nativeEnum(Class2, entries, params) {
  return new Class2({
    type: "enum",
    entries,
    ...normalizeParams(params)
  });
}
function _literal(Class2, value, params) {
  return new Class2({
    type: "literal",
    values: Array.isArray(value) ? value : [value],
    ...normalizeParams(params)
  });
}
function _file(Class2, params) {
  return new Class2({
    type: "file",
    ...normalizeParams(params)
  });
}
function _transform(Class2, fn) {
  return new Class2({
    type: "transform",
    transform: fn
  });
}
function _optional(Class2, innerType) {
  return new Class2({
    type: "optional",
    innerType
  });
}
function _nullable(Class2, innerType) {
  return new Class2({
    type: "nullable",
    innerType
  });
}
function _default(Class2, innerType, defaultValue) {
  return new Class2({
    type: "default",
    innerType,
    get defaultValue() {
      return typeof defaultValue === "function" ? defaultValue() : shallowClone(defaultValue);
    }
  });
}
function _nonoptional(Class2, innerType, params) {
  return new Class2({
    type: "nonoptional",
    innerType,
    ...normalizeParams(params)
  });
}
function _success(Class2, innerType) {
  return new Class2({
    type: "success",
    innerType
  });
}
function _catch(Class2, innerType, catchValue) {
  return new Class2({
    type: "catch",
    innerType,
    catchValue: typeof catchValue === "function" ? catchValue : () => catchValue
  });
}
function _pipe(Class2, in_, out) {
  return new Class2({
    type: "pipe",
    in: in_,
    out
  });
}
function _readonly(Class2, innerType) {
  return new Class2({
    type: "readonly",
    innerType
  });
}
function _templateLiteral(Class2, parts, params) {
  return new Class2({
    type: "template_literal",
    parts,
    ...normalizeParams(params)
  });
}
function _lazy(Class2, getter) {
  return new Class2({
    type: "lazy",
    getter
  });
}
function _promise(Class2, innerType) {
  return new Class2({
    type: "promise",
    innerType
  });
}
function _custom(Class2, fn, _params) {
  const norm = normalizeParams(_params);
  norm.abort ?? (norm.abort = true);
  const schema = new Class2({
    type: "custom",
    check: "custom",
    fn,
    ...norm
  });
  return schema;
}
function _refine(Class2, fn, _params) {
  const schema = new Class2({
    type: "custom",
    check: "custom",
    fn,
    ...normalizeParams(_params)
  });
  return schema;
}
function _superRefine(fn) {
  const ch = _check((payload) => {
    payload.addIssue = (issue2) => {
      if (typeof issue2 === "string") {
        payload.issues.push(issue(issue2, payload.value, ch._zod.def));
      } else {
        const _issue = issue2;
        if (_issue.fatal)
          _issue.continue = false;
        _issue.code ?? (_issue.code = "custom");
        _issue.input ?? (_issue.input = payload.value);
        _issue.inst ?? (_issue.inst = ch);
        _issue.continue ?? (_issue.continue = !ch._zod.def.abort);
        payload.issues.push(issue(_issue));
      }
    };
    return fn(payload.value, payload);
  });
  return ch;
}
function _check(fn, params) {
  const ch = new $ZodCheck({
    check: "custom",
    ...normalizeParams(params)
  });
  ch._zod.check = fn;
  return ch;
}
function _stringbool(Classes, _params) {
  const params = normalizeParams(_params);
  let truthyArray = params.truthy ?? ["true", "1", "yes", "on", "y", "enabled"];
  let falsyArray = params.falsy ?? ["false", "0", "no", "off", "n", "disabled"];
  if (params.case !== "sensitive") {
    truthyArray = truthyArray.map((v) => typeof v === "string" ? v.toLowerCase() : v);
    falsyArray = falsyArray.map((v) => typeof v === "string" ? v.toLowerCase() : v);
  }
  const truthySet = new Set(truthyArray);
  const falsySet = new Set(falsyArray);
  const _Codec = Classes.Codec ?? $ZodCodec;
  const _Boolean = Classes.Boolean ?? $ZodBoolean;
  const _String = Classes.String ?? $ZodString;
  const stringSchema = new _String({ type: "string", error: params.error });
  const booleanSchema = new _Boolean({ type: "boolean", error: params.error });
  const codec = new _Codec({
    type: "pipe",
    in: stringSchema,
    out: booleanSchema,
    transform: (input, payload) => {
      let data = input;
      if (params.case !== "sensitive")
        data = data.toLowerCase();
      if (truthySet.has(data)) {
        return true;
      } else if (falsySet.has(data)) {
        return false;
      } else {
        payload.issues.push({
          code: "invalid_value",
          expected: "stringbool",
          values: [...truthySet, ...falsySet],
          input: payload.value,
          inst: codec,
          continue: false
        });
        return {};
      }
    },
    reverseTransform: (input, _payload) => {
      if (input === true) {
        return truthyArray[0] || "true";
      } else {
        return falsyArray[0] || "false";
      }
    },
    error: params.error
  });
  return codec;
}
function _stringFormat(Class2, format, fnOrRegex, _params = {}) {
  const params = normalizeParams(_params);
  const def = {
    ...normalizeParams(_params),
    check: "string_format",
    type: "string",
    format,
    fn: typeof fnOrRegex === "function" ? fnOrRegex : (val) => fnOrRegex.test(val),
    ...params
  };
  if (fnOrRegex instanceof RegExp) {
    def.pattern = fnOrRegex;
  }
  const inst = new Class2(def);
  return inst;
}
// node_modules/zod/v4/core/to-json-schema.js
class JSONSchemaGenerator {
  constructor(params) {
    this.counter = 0;
    this.metadataRegistry = params?.metadata ?? globalRegistry;
    this.target = params?.target ?? "draft-2020-12";
    this.unrepresentable = params?.unrepresentable ?? "throw";
    this.override = params?.override ?? (() => {});
    this.io = params?.io ?? "output";
    this.seen = new Map;
  }
  process(schema, _params = { path: [], schemaPath: [] }) {
    var _a;
    const def = schema._zod.def;
    const formatMap = {
      guid: "uuid",
      url: "uri",
      datetime: "date-time",
      json_string: "json-string",
      regex: ""
    };
    const seen = this.seen.get(schema);
    if (seen) {
      seen.count++;
      const isCycle = _params.schemaPath.includes(schema);
      if (isCycle) {
        seen.cycle = _params.path;
      }
      return seen.schema;
    }
    const result = { schema: {}, count: 1, cycle: undefined, path: _params.path };
    this.seen.set(schema, result);
    const overrideSchema = schema._zod.toJSONSchema?.();
    if (overrideSchema) {
      result.schema = overrideSchema;
    } else {
      const params = {
        ..._params,
        schemaPath: [..._params.schemaPath, schema],
        path: _params.path
      };
      const parent = schema._zod.parent;
      if (parent) {
        result.ref = parent;
        this.process(parent, params);
        this.seen.get(parent).isParent = true;
      } else {
        const _json = result.schema;
        switch (def.type) {
          case "string": {
            const json = _json;
            json.type = "string";
            const { minimum, maximum, format, patterns, contentEncoding } = schema._zod.bag;
            if (typeof minimum === "number")
              json.minLength = minimum;
            if (typeof maximum === "number")
              json.maxLength = maximum;
            if (format) {
              json.format = formatMap[format] ?? format;
              if (json.format === "")
                delete json.format;
            }
            if (contentEncoding)
              json.contentEncoding = contentEncoding;
            if (patterns && patterns.size > 0) {
              const regexes = [...patterns];
              if (regexes.length === 1)
                json.pattern = regexes[0].source;
              else if (regexes.length > 1) {
                result.schema.allOf = [
                  ...regexes.map((regex) => ({
                    ...this.target === "draft-7" || this.target === "draft-4" || this.target === "openapi-3.0" ? { type: "string" } : {},
                    pattern: regex.source
                  }))
                ];
              }
            }
            break;
          }
          case "number": {
            const json = _json;
            const { minimum, maximum, format, multipleOf, exclusiveMaximum, exclusiveMinimum } = schema._zod.bag;
            if (typeof format === "string" && format.includes("int"))
              json.type = "integer";
            else
              json.type = "number";
            if (typeof exclusiveMinimum === "number") {
              if (this.target === "draft-4" || this.target === "openapi-3.0") {
                json.minimum = exclusiveMinimum;
                json.exclusiveMinimum = true;
              } else {
                json.exclusiveMinimum = exclusiveMinimum;
              }
            }
            if (typeof minimum === "number") {
              json.minimum = minimum;
              if (typeof exclusiveMinimum === "number" && this.target !== "draft-4") {
                if (exclusiveMinimum >= minimum)
                  delete json.minimum;
                else
                  delete json.exclusiveMinimum;
              }
            }
            if (typeof exclusiveMaximum === "number") {
              if (this.target === "draft-4" || this.target === "openapi-3.0") {
                json.maximum = exclusiveMaximum;
                json.exclusiveMaximum = true;
              } else {
                json.exclusiveMaximum = exclusiveMaximum;
              }
            }
            if (typeof maximum === "number") {
              json.maximum = maximum;
              if (typeof exclusiveMaximum === "number" && this.target !== "draft-4") {
                if (exclusiveMaximum <= maximum)
                  delete json.maximum;
                else
                  delete json.exclusiveMaximum;
              }
            }
            if (typeof multipleOf === "number")
              json.multipleOf = multipleOf;
            break;
          }
          case "boolean": {
            const json = _json;
            json.type = "boolean";
            break;
          }
          case "bigint": {
            if (this.unrepresentable === "throw") {
              throw new Error("BigInt cannot be represented in JSON Schema");
            }
            break;
          }
          case "symbol": {
            if (this.unrepresentable === "throw") {
              throw new Error("Symbols cannot be represented in JSON Schema");
            }
            break;
          }
          case "null": {
            if (this.target === "openapi-3.0") {
              _json.type = "string";
              _json.nullable = true;
              _json.enum = [null];
            } else
              _json.type = "null";
            break;
          }
          case "any": {
            break;
          }
          case "unknown": {
            break;
          }
          case "undefined": {
            if (this.unrepresentable === "throw") {
              throw new Error("Undefined cannot be represented in JSON Schema");
            }
            break;
          }
          case "void": {
            if (this.unrepresentable === "throw") {
              throw new Error("Void cannot be represented in JSON Schema");
            }
            break;
          }
          case "never": {
            _json.not = {};
            break;
          }
          case "date": {
            if (this.unrepresentable === "throw") {
              throw new Error("Date cannot be represented in JSON Schema");
            }
            break;
          }
          case "array": {
            const json = _json;
            const { minimum, maximum } = schema._zod.bag;
            if (typeof minimum === "number")
              json.minItems = minimum;
            if (typeof maximum === "number")
              json.maxItems = maximum;
            json.type = "array";
            json.items = this.process(def.element, { ...params, path: [...params.path, "items"] });
            break;
          }
          case "object": {
            const json = _json;
            json.type = "object";
            json.properties = {};
            const shape = def.shape;
            for (const key in shape) {
              json.properties[key] = this.process(shape[key], {
                ...params,
                path: [...params.path, "properties", key]
              });
            }
            const allKeys = new Set(Object.keys(shape));
            const requiredKeys = new Set([...allKeys].filter((key) => {
              const v = def.shape[key]._zod;
              if (this.io === "input") {
                return v.optin === undefined;
              } else {
                return v.optout === undefined;
              }
            }));
            if (requiredKeys.size > 0) {
              json.required = Array.from(requiredKeys);
            }
            if (def.catchall?._zod.def.type === "never") {
              json.additionalProperties = false;
            } else if (!def.catchall) {
              if (this.io === "output")
                json.additionalProperties = false;
            } else if (def.catchall) {
              json.additionalProperties = this.process(def.catchall, {
                ...params,
                path: [...params.path, "additionalProperties"]
              });
            }
            break;
          }
          case "union": {
            const json = _json;
            const options = def.options.map((x, i) => this.process(x, {
              ...params,
              path: [...params.path, "anyOf", i]
            }));
            json.anyOf = options;
            break;
          }
          case "intersection": {
            const json = _json;
            const a = this.process(def.left, {
              ...params,
              path: [...params.path, "allOf", 0]
            });
            const b = this.process(def.right, {
              ...params,
              path: [...params.path, "allOf", 1]
            });
            const isSimpleIntersection = (val) => ("allOf" in val) && Object.keys(val).length === 1;
            const allOf = [
              ...isSimpleIntersection(a) ? a.allOf : [a],
              ...isSimpleIntersection(b) ? b.allOf : [b]
            ];
            json.allOf = allOf;
            break;
          }
          case "tuple": {
            const json = _json;
            json.type = "array";
            const prefixPath = this.target === "draft-2020-12" ? "prefixItems" : "items";
            const restPath = this.target === "draft-2020-12" ? "items" : this.target === "openapi-3.0" ? "items" : "additionalItems";
            const prefixItems = def.items.map((x, i) => this.process(x, {
              ...params,
              path: [...params.path, prefixPath, i]
            }));
            const rest = def.rest ? this.process(def.rest, {
              ...params,
              path: [...params.path, restPath, ...this.target === "openapi-3.0" ? [def.items.length] : []]
            }) : null;
            if (this.target === "draft-2020-12") {
              json.prefixItems = prefixItems;
              if (rest) {
                json.items = rest;
              }
            } else if (this.target === "openapi-3.0") {
              json.items = {
                anyOf: prefixItems
              };
              if (rest) {
                json.items.anyOf.push(rest);
              }
              json.minItems = prefixItems.length;
              if (!rest) {
                json.maxItems = prefixItems.length;
              }
            } else {
              json.items = prefixItems;
              if (rest) {
                json.additionalItems = rest;
              }
            }
            const { minimum, maximum } = schema._zod.bag;
            if (typeof minimum === "number")
              json.minItems = minimum;
            if (typeof maximum === "number")
              json.maxItems = maximum;
            break;
          }
          case "record": {
            const json = _json;
            json.type = "object";
            if (this.target === "draft-7" || this.target === "draft-2020-12") {
              json.propertyNames = this.process(def.keyType, {
                ...params,
                path: [...params.path, "propertyNames"]
              });
            }
            json.additionalProperties = this.process(def.valueType, {
              ...params,
              path: [...params.path, "additionalProperties"]
            });
            break;
          }
          case "map": {
            if (this.unrepresentable === "throw") {
              throw new Error("Map cannot be represented in JSON Schema");
            }
            break;
          }
          case "set": {
            if (this.unrepresentable === "throw") {
              throw new Error("Set cannot be represented in JSON Schema");
            }
            break;
          }
          case "enum": {
            const json = _json;
            const values = getEnumValues(def.entries);
            if (values.every((v) => typeof v === "number"))
              json.type = "number";
            if (values.every((v) => typeof v === "string"))
              json.type = "string";
            json.enum = values;
            break;
          }
          case "literal": {
            const json = _json;
            const vals = [];
            for (const val of def.values) {
              if (val === undefined) {
                if (this.unrepresentable === "throw") {
                  throw new Error("Literal `undefined` cannot be represented in JSON Schema");
                } else {}
              } else if (typeof val === "bigint") {
                if (this.unrepresentable === "throw") {
                  throw new Error("BigInt literals cannot be represented in JSON Schema");
                } else {
                  vals.push(Number(val));
                }
              } else {
                vals.push(val);
              }
            }
            if (vals.length === 0) {} else if (vals.length === 1) {
              const val = vals[0];
              json.type = val === null ? "null" : typeof val;
              if (this.target === "draft-4" || this.target === "openapi-3.0") {
                json.enum = [val];
              } else {
                json.const = val;
              }
            } else {
              if (vals.every((v) => typeof v === "number"))
                json.type = "number";
              if (vals.every((v) => typeof v === "string"))
                json.type = "string";
              if (vals.every((v) => typeof v === "boolean"))
                json.type = "string";
              if (vals.every((v) => v === null))
                json.type = "null";
              json.enum = vals;
            }
            break;
          }
          case "file": {
            const json = _json;
            const file = {
              type: "string",
              format: "binary",
              contentEncoding: "binary"
            };
            const { minimum, maximum, mime } = schema._zod.bag;
            if (minimum !== undefined)
              file.minLength = minimum;
            if (maximum !== undefined)
              file.maxLength = maximum;
            if (mime) {
              if (mime.length === 1) {
                file.contentMediaType = mime[0];
                Object.assign(json, file);
              } else {
                json.anyOf = mime.map((m) => {
                  const mFile = { ...file, contentMediaType: m };
                  return mFile;
                });
              }
            } else {
              Object.assign(json, file);
            }
            break;
          }
          case "transform": {
            if (this.unrepresentable === "throw") {
              throw new Error("Transforms cannot be represented in JSON Schema");
            }
            break;
          }
          case "nullable": {
            const inner = this.process(def.innerType, params);
            if (this.target === "openapi-3.0") {
              result.ref = def.innerType;
              _json.nullable = true;
            } else {
              _json.anyOf = [inner, { type: "null" }];
            }
            break;
          }
          case "nonoptional": {
            this.process(def.innerType, params);
            result.ref = def.innerType;
            break;
          }
          case "success": {
            const json = _json;
            json.type = "boolean";
            break;
          }
          case "default": {
            this.process(def.innerType, params);
            result.ref = def.innerType;
            _json.default = JSON.parse(JSON.stringify(def.defaultValue));
            break;
          }
          case "prefault": {
            this.process(def.innerType, params);
            result.ref = def.innerType;
            if (this.io === "input")
              _json._prefault = JSON.parse(JSON.stringify(def.defaultValue));
            break;
          }
          case "catch": {
            this.process(def.innerType, params);
            result.ref = def.innerType;
            let catchValue;
            try {
              catchValue = def.catchValue(undefined);
            } catch {
              throw new Error("Dynamic catch values are not supported in JSON Schema");
            }
            _json.default = catchValue;
            break;
          }
          case "nan": {
            if (this.unrepresentable === "throw") {
              throw new Error("NaN cannot be represented in JSON Schema");
            }
            break;
          }
          case "template_literal": {
            const json = _json;
            const pattern = schema._zod.pattern;
            if (!pattern)
              throw new Error("Pattern not found in template literal");
            json.type = "string";
            json.pattern = pattern.source;
            break;
          }
          case "pipe": {
            const innerType = this.io === "input" ? def.in._zod.def.type === "transform" ? def.out : def.in : def.out;
            this.process(innerType, params);
            result.ref = innerType;
            break;
          }
          case "readonly": {
            this.process(def.innerType, params);
            result.ref = def.innerType;
            _json.readOnly = true;
            break;
          }
          case "promise": {
            this.process(def.innerType, params);
            result.ref = def.innerType;
            break;
          }
          case "optional": {
            this.process(def.innerType, params);
            result.ref = def.innerType;
            break;
          }
          case "lazy": {
            const innerType = schema._zod.innerType;
            this.process(innerType, params);
            result.ref = innerType;
            break;
          }
          case "custom": {
            if (this.unrepresentable === "throw") {
              throw new Error("Custom types cannot be represented in JSON Schema");
            }
            break;
          }
          case "function": {
            if (this.unrepresentable === "throw") {
              throw new Error("Function types cannot be represented in JSON Schema");
            }
            break;
          }
          default: {}
        }
      }
    }
    const meta = this.metadataRegistry.get(schema);
    if (meta)
      Object.assign(result.schema, meta);
    if (this.io === "input" && isTransforming(schema)) {
      delete result.schema.examples;
      delete result.schema.default;
    }
    if (this.io === "input" && result.schema._prefault)
      (_a = result.schema).default ?? (_a.default = result.schema._prefault);
    delete result.schema._prefault;
    const _result = this.seen.get(schema);
    return _result.schema;
  }
  emit(schema, _params) {
    const params = {
      cycles: _params?.cycles ?? "ref",
      reused: _params?.reused ?? "inline",
      external: _params?.external ?? undefined
    };
    const root = this.seen.get(schema);
    if (!root)
      throw new Error("Unprocessed schema. This is a bug in Zod.");
    const makeURI = (entry) => {
      const defsSegment = this.target === "draft-2020-12" ? "$defs" : "definitions";
      if (params.external) {
        const externalId = params.external.registry.get(entry[0])?.id;
        const uriGenerator = params.external.uri ?? ((id2) => id2);
        if (externalId) {
          return { ref: uriGenerator(externalId) };
        }
        const id = entry[1].defId ?? entry[1].schema.id ?? `schema${this.counter++}`;
        entry[1].defId = id;
        return { defId: id, ref: `${uriGenerator("__shared")}#/${defsSegment}/${id}` };
      }
      if (entry[1] === root) {
        return { ref: "#" };
      }
      const uriPrefix = `#`;
      const defUriPrefix = `${uriPrefix}/${defsSegment}/`;
      const defId = entry[1].schema.id ?? `__schema${this.counter++}`;
      return { defId, ref: defUriPrefix + defId };
    };
    const extractToDef = (entry) => {
      if (entry[1].schema.$ref) {
        return;
      }
      const seen = entry[1];
      const { ref, defId } = makeURI(entry);
      seen.def = { ...seen.schema };
      if (defId)
        seen.defId = defId;
      const schema2 = seen.schema;
      for (const key in schema2) {
        delete schema2[key];
      }
      schema2.$ref = ref;
    };
    if (params.cycles === "throw") {
      for (const entry of this.seen.entries()) {
        const seen = entry[1];
        if (seen.cycle) {
          throw new Error("Cycle detected: " + `#/${seen.cycle?.join("/")}/<root>` + '\n\nSet the `cycles` parameter to `"ref"` to resolve cyclical schemas with defs.');
        }
      }
    }
    for (const entry of this.seen.entries()) {
      const seen = entry[1];
      if (schema === entry[0]) {
        extractToDef(entry);
        continue;
      }
      if (params.external) {
        const ext = params.external.registry.get(entry[0])?.id;
        if (schema !== entry[0] && ext) {
          extractToDef(entry);
          continue;
        }
      }
      const id = this.metadataRegistry.get(entry[0])?.id;
      if (id) {
        extractToDef(entry);
        continue;
      }
      if (seen.cycle) {
        extractToDef(entry);
        continue;
      }
      if (seen.count > 1) {
        if (params.reused === "ref") {
          extractToDef(entry);
          continue;
        }
      }
    }
    const flattenRef = (zodSchema, params2) => {
      const seen = this.seen.get(zodSchema);
      const schema2 = seen.def ?? seen.schema;
      const _cached = { ...schema2 };
      if (seen.ref === null) {
        return;
      }
      const ref = seen.ref;
      seen.ref = null;
      if (ref) {
        flattenRef(ref, params2);
        const refSchema = this.seen.get(ref).schema;
        if (refSchema.$ref && (params2.target === "draft-7" || params2.target === "draft-4" || params2.target === "openapi-3.0")) {
          schema2.allOf = schema2.allOf ?? [];
          schema2.allOf.push(refSchema);
        } else {
          Object.assign(schema2, refSchema);
          Object.assign(schema2, _cached);
        }
      }
      if (!seen.isParent)
        this.override({
          zodSchema,
          jsonSchema: schema2,
          path: seen.path ?? []
        });
    };
    for (const entry of [...this.seen.entries()].reverse()) {
      flattenRef(entry[0], { target: this.target });
    }
    const result = {};
    if (this.target === "draft-2020-12") {
      result.$schema = "https://json-schema.org/draft/2020-12/schema";
    } else if (this.target === "draft-7") {
      result.$schema = "http://json-schema.org/draft-07/schema#";
    } else if (this.target === "draft-4") {
      result.$schema = "http://json-schema.org/draft-04/schema#";
    } else if (this.target === "openapi-3.0") {} else {
      console.warn(`Invalid target: ${this.target}`);
    }
    if (params.external?.uri) {
      const id = params.external.registry.get(schema)?.id;
      if (!id)
        throw new Error("Schema is missing an `id` property");
      result.$id = params.external.uri(id);
    }
    Object.assign(result, root.def);
    const defs = params.external?.defs ?? {};
    for (const entry of this.seen.entries()) {
      const seen = entry[1];
      if (seen.def && seen.defId) {
        defs[seen.defId] = seen.def;
      }
    }
    if (params.external) {} else {
      if (Object.keys(defs).length > 0) {
        if (this.target === "draft-2020-12") {
          result.$defs = defs;
        } else {
          result.definitions = defs;
        }
      }
    }
    try {
      return JSON.parse(JSON.stringify(result));
    } catch (_err) {
      throw new Error("Error converting schema to JSON.");
    }
  }
}
function toJSONSchema(input, _params) {
  if (input instanceof $ZodRegistry) {
    const gen2 = new JSONSchemaGenerator(_params);
    const defs = {};
    for (const entry of input._idmap.entries()) {
      const [_, schema] = entry;
      gen2.process(schema);
    }
    const schemas = {};
    const external = {
      registry: input,
      uri: _params?.uri,
      defs
    };
    for (const entry of input._idmap.entries()) {
      const [key, schema] = entry;
      schemas[key] = gen2.emit(schema, {
        ..._params,
        external
      });
    }
    if (Object.keys(defs).length > 0) {
      const defsSegment = gen2.target === "draft-2020-12" ? "$defs" : "definitions";
      schemas.__shared = {
        [defsSegment]: defs
      };
    }
    return { schemas };
  }
  const gen = new JSONSchemaGenerator(_params);
  gen.process(input);
  return gen.emit(input, _params);
}
function isTransforming(_schema, _ctx) {
  const ctx = _ctx ?? { seen: new Set };
  if (ctx.seen.has(_schema))
    return false;
  ctx.seen.add(_schema);
  const schema = _schema;
  const def = schema._zod.def;
  switch (def.type) {
    case "string":
    case "number":
    case "bigint":
    case "boolean":
    case "date":
    case "symbol":
    case "undefined":
    case "null":
    case "any":
    case "unknown":
    case "never":
    case "void":
    case "literal":
    case "enum":
    case "nan":
    case "file":
    case "template_literal":
      return false;
    case "array": {
      return isTransforming(def.element, ctx);
    }
    case "object": {
      for (const key in def.shape) {
        if (isTransforming(def.shape[key], ctx))
          return true;
      }
      return false;
    }
    case "union": {
      for (const option of def.options) {
        if (isTransforming(option, ctx))
          return true;
      }
      return false;
    }
    case "intersection": {
      return isTransforming(def.left, ctx) || isTransforming(def.right, ctx);
    }
    case "tuple": {
      for (const item of def.items) {
        if (isTransforming(item, ctx))
          return true;
      }
      if (def.rest && isTransforming(def.rest, ctx))
        return true;
      return false;
    }
    case "record": {
      return isTransforming(def.keyType, ctx) || isTransforming(def.valueType, ctx);
    }
    case "map": {
      return isTransforming(def.keyType, ctx) || isTransforming(def.valueType, ctx);
    }
    case "set": {
      return isTransforming(def.valueType, ctx);
    }
    case "promise":
    case "optional":
    case "nonoptional":
    case "nullable":
    case "readonly":
      return isTransforming(def.innerType, ctx);
    case "lazy":
      return isTransforming(def.getter(), ctx);
    case "default": {
      return isTransforming(def.innerType, ctx);
    }
    case "prefault": {
      return isTransforming(def.innerType, ctx);
    }
    case "custom": {
      return false;
    }
    case "transform": {
      return true;
    }
    case "pipe": {
      return isTransforming(def.in, ctx) || isTransforming(def.out, ctx);
    }
    case "success": {
      return false;
    }
    case "catch": {
      return false;
    }
    case "function": {
      return false;
    }
    default:
  }
  throw new Error(`Unknown schema type: ${def.type}`);
}
// node_modules/zod/v4/core/json-schema.js
var exports_json_schema = {};
// node_modules/zod/v4/classic/iso.js
var exports_iso = {};
__export(exports_iso, {
  time: () => time2,
  duration: () => duration2,
  datetime: () => datetime2,
  date: () => date2,
  ZodISOTime: () => ZodISOTime,
  ZodISODuration: () => ZodISODuration,
  ZodISODateTime: () => ZodISODateTime,
  ZodISODate: () => ZodISODate
});
var ZodISODateTime = /* @__PURE__ */ $constructor("ZodISODateTime", (inst, def) => {
  $ZodISODateTime.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function datetime2(params) {
  return _isoDateTime(ZodISODateTime, params);
}
var ZodISODate = /* @__PURE__ */ $constructor("ZodISODate", (inst, def) => {
  $ZodISODate.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function date2(params) {
  return _isoDate(ZodISODate, params);
}
var ZodISOTime = /* @__PURE__ */ $constructor("ZodISOTime", (inst, def) => {
  $ZodISOTime.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function time2(params) {
  return _isoTime(ZodISOTime, params);
}
var ZodISODuration = /* @__PURE__ */ $constructor("ZodISODuration", (inst, def) => {
  $ZodISODuration.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function duration2(params) {
  return _isoDuration(ZodISODuration, params);
}

// node_modules/zod/v4/classic/errors.js
var initializer2 = (inst, issues) => {
  $ZodError.init(inst, issues);
  inst.name = "ZodError";
  Object.defineProperties(inst, {
    format: {
      value: (mapper) => formatError(inst, mapper)
    },
    flatten: {
      value: (mapper) => flattenError(inst, mapper)
    },
    addIssue: {
      value: (issue2) => {
        inst.issues.push(issue2);
        inst.message = JSON.stringify(inst.issues, jsonStringifyReplacer, 2);
      }
    },
    addIssues: {
      value: (issues2) => {
        inst.issues.push(...issues2);
        inst.message = JSON.stringify(inst.issues, jsonStringifyReplacer, 2);
      }
    },
    isEmpty: {
      get() {
        return inst.issues.length === 0;
      }
    }
  });
};
var ZodError = $constructor("ZodError", initializer2);
var ZodRealError = $constructor("ZodError", initializer2, {
  Parent: Error
});

// node_modules/zod/v4/classic/parse.js
var parse3 = /* @__PURE__ */ _parse(ZodRealError);
var parseAsync2 = /* @__PURE__ */ _parseAsync(ZodRealError);
var safeParse2 = /* @__PURE__ */ _safeParse(ZodRealError);
var safeParseAsync2 = /* @__PURE__ */ _safeParseAsync(ZodRealError);
var encode2 = /* @__PURE__ */ _encode(ZodRealError);
var decode2 = /* @__PURE__ */ _decode(ZodRealError);
var encodeAsync2 = /* @__PURE__ */ _encodeAsync(ZodRealError);
var decodeAsync2 = /* @__PURE__ */ _decodeAsync(ZodRealError);
var safeEncode2 = /* @__PURE__ */ _safeEncode(ZodRealError);
var safeDecode2 = /* @__PURE__ */ _safeDecode(ZodRealError);
var safeEncodeAsync2 = /* @__PURE__ */ _safeEncodeAsync(ZodRealError);
var safeDecodeAsync2 = /* @__PURE__ */ _safeDecodeAsync(ZodRealError);

// node_modules/zod/v4/classic/schemas.js
var ZodType = /* @__PURE__ */ $constructor("ZodType", (inst, def) => {
  $ZodType.init(inst, def);
  inst.def = def;
  inst.type = def.type;
  Object.defineProperty(inst, "_def", { value: def });
  inst.check = (...checks2) => {
    return inst.clone(exports_util.mergeDefs(def, {
      checks: [
        ...def.checks ?? [],
        ...checks2.map((ch) => typeof ch === "function" ? { _zod: { check: ch, def: { check: "custom" }, onattach: [] } } : ch)
      ]
    }));
  };
  inst.clone = (def2, params) => clone(inst, def2, params);
  inst.brand = () => inst;
  inst.register = (reg, meta) => {
    reg.add(inst, meta);
    return inst;
  };
  inst.parse = (data, params) => parse3(inst, data, params, { callee: inst.parse });
  inst.safeParse = (data, params) => safeParse2(inst, data, params);
  inst.parseAsync = async (data, params) => parseAsync2(inst, data, params, { callee: inst.parseAsync });
  inst.safeParseAsync = async (data, params) => safeParseAsync2(inst, data, params);
  inst.spa = inst.safeParseAsync;
  inst.encode = (data, params) => encode2(inst, data, params);
  inst.decode = (data, params) => decode2(inst, data, params);
  inst.encodeAsync = async (data, params) => encodeAsync2(inst, data, params);
  inst.decodeAsync = async (data, params) => decodeAsync2(inst, data, params);
  inst.safeEncode = (data, params) => safeEncode2(inst, data, params);
  inst.safeDecode = (data, params) => safeDecode2(inst, data, params);
  inst.safeEncodeAsync = async (data, params) => safeEncodeAsync2(inst, data, params);
  inst.safeDecodeAsync = async (data, params) => safeDecodeAsync2(inst, data, params);
  inst.refine = (check, params) => inst.check(refine(check, params));
  inst.superRefine = (refinement) => inst.check(superRefine(refinement));
  inst.overwrite = (fn) => inst.check(_overwrite(fn));
  inst.optional = () => optional(inst);
  inst.nullable = () => nullable(inst);
  inst.nullish = () => optional(nullable(inst));
  inst.nonoptional = (params) => nonoptional(inst, params);
  inst.array = () => array(inst);
  inst.or = (arg) => union([inst, arg]);
  inst.and = (arg) => intersection(inst, arg);
  inst.transform = (tx) => pipe(inst, transform(tx));
  inst.default = (def2) => _default2(inst, def2);
  inst.prefault = (def2) => prefault(inst, def2);
  inst.catch = (params) => _catch2(inst, params);
  inst.pipe = (target) => pipe(inst, target);
  inst.readonly = () => readonly(inst);
  inst.describe = (description) => {
    const cl = inst.clone();
    globalRegistry.add(cl, { description });
    return cl;
  };
  Object.defineProperty(inst, "description", {
    get() {
      return globalRegistry.get(inst)?.description;
    },
    configurable: true
  });
  inst.meta = (...args) => {
    if (args.length === 0) {
      return globalRegistry.get(inst);
    }
    const cl = inst.clone();
    globalRegistry.add(cl, args[0]);
    return cl;
  };
  inst.isOptional = () => inst.safeParse(undefined).success;
  inst.isNullable = () => inst.safeParse(null).success;
  return inst;
});
var _ZodString = /* @__PURE__ */ $constructor("_ZodString", (inst, def) => {
  $ZodString.init(inst, def);
  ZodType.init(inst, def);
  const bag = inst._zod.bag;
  inst.format = bag.format ?? null;
  inst.minLength = bag.minimum ?? null;
  inst.maxLength = bag.maximum ?? null;
  inst.regex = (...args) => inst.check(_regex(...args));
  inst.includes = (...args) => inst.check(_includes(...args));
  inst.startsWith = (...args) => inst.check(_startsWith(...args));
  inst.endsWith = (...args) => inst.check(_endsWith(...args));
  inst.min = (...args) => inst.check(_minLength(...args));
  inst.max = (...args) => inst.check(_maxLength(...args));
  inst.length = (...args) => inst.check(_length(...args));
  inst.nonempty = (...args) => inst.check(_minLength(1, ...args));
  inst.lowercase = (params) => inst.check(_lowercase(params));
  inst.uppercase = (params) => inst.check(_uppercase(params));
  inst.trim = () => inst.check(_trim());
  inst.normalize = (...args) => inst.check(_normalize(...args));
  inst.toLowerCase = () => inst.check(_toLowerCase());
  inst.toUpperCase = () => inst.check(_toUpperCase());
});
var ZodString = /* @__PURE__ */ $constructor("ZodString", (inst, def) => {
  $ZodString.init(inst, def);
  _ZodString.init(inst, def);
  inst.email = (params) => inst.check(_email(ZodEmail, params));
  inst.url = (params) => inst.check(_url(ZodURL, params));
  inst.jwt = (params) => inst.check(_jwt(ZodJWT, params));
  inst.emoji = (params) => inst.check(_emoji2(ZodEmoji, params));
  inst.guid = (params) => inst.check(_guid(ZodGUID, params));
  inst.uuid = (params) => inst.check(_uuid(ZodUUID, params));
  inst.uuidv4 = (params) => inst.check(_uuidv4(ZodUUID, params));
  inst.uuidv6 = (params) => inst.check(_uuidv6(ZodUUID, params));
  inst.uuidv7 = (params) => inst.check(_uuidv7(ZodUUID, params));
  inst.nanoid = (params) => inst.check(_nanoid(ZodNanoID, params));
  inst.guid = (params) => inst.check(_guid(ZodGUID, params));
  inst.cuid = (params) => inst.check(_cuid(ZodCUID, params));
  inst.cuid2 = (params) => inst.check(_cuid2(ZodCUID2, params));
  inst.ulid = (params) => inst.check(_ulid(ZodULID, params));
  inst.base64 = (params) => inst.check(_base64(ZodBase64, params));
  inst.base64url = (params) => inst.check(_base64url(ZodBase64URL, params));
  inst.xid = (params) => inst.check(_xid(ZodXID, params));
  inst.ksuid = (params) => inst.check(_ksuid(ZodKSUID, params));
  inst.ipv4 = (params) => inst.check(_ipv4(ZodIPv4, params));
  inst.ipv6 = (params) => inst.check(_ipv6(ZodIPv6, params));
  inst.cidrv4 = (params) => inst.check(_cidrv4(ZodCIDRv4, params));
  inst.cidrv6 = (params) => inst.check(_cidrv6(ZodCIDRv6, params));
  inst.e164 = (params) => inst.check(_e164(ZodE164, params));
  inst.datetime = (params) => inst.check(datetime2(params));
  inst.date = (params) => inst.check(date2(params));
  inst.time = (params) => inst.check(time2(params));
  inst.duration = (params) => inst.check(duration2(params));
});
function string2(params) {
  return _string(ZodString, params);
}
var ZodStringFormat = /* @__PURE__ */ $constructor("ZodStringFormat", (inst, def) => {
  $ZodStringFormat.init(inst, def);
  _ZodString.init(inst, def);
});
var ZodEmail = /* @__PURE__ */ $constructor("ZodEmail", (inst, def) => {
  $ZodEmail.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function email2(params) {
  return _email(ZodEmail, params);
}
var ZodGUID = /* @__PURE__ */ $constructor("ZodGUID", (inst, def) => {
  $ZodGUID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function guid2(params) {
  return _guid(ZodGUID, params);
}
var ZodUUID = /* @__PURE__ */ $constructor("ZodUUID", (inst, def) => {
  $ZodUUID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function uuid2(params) {
  return _uuid(ZodUUID, params);
}
function uuidv4(params) {
  return _uuidv4(ZodUUID, params);
}
function uuidv6(params) {
  return _uuidv6(ZodUUID, params);
}
function uuidv7(params) {
  return _uuidv7(ZodUUID, params);
}
var ZodURL = /* @__PURE__ */ $constructor("ZodURL", (inst, def) => {
  $ZodURL.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function url(params) {
  return _url(ZodURL, params);
}
function httpUrl(params) {
  return _url(ZodURL, {
    protocol: /^https?$/,
    hostname: exports_regexes.domain,
    ...exports_util.normalizeParams(params)
  });
}
var ZodEmoji = /* @__PURE__ */ $constructor("ZodEmoji", (inst, def) => {
  $ZodEmoji.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function emoji2(params) {
  return _emoji2(ZodEmoji, params);
}
var ZodNanoID = /* @__PURE__ */ $constructor("ZodNanoID", (inst, def) => {
  $ZodNanoID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function nanoid2(params) {
  return _nanoid(ZodNanoID, params);
}
var ZodCUID = /* @__PURE__ */ $constructor("ZodCUID", (inst, def) => {
  $ZodCUID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function cuid3(params) {
  return _cuid(ZodCUID, params);
}
var ZodCUID2 = /* @__PURE__ */ $constructor("ZodCUID2", (inst, def) => {
  $ZodCUID2.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function cuid22(params) {
  return _cuid2(ZodCUID2, params);
}
var ZodULID = /* @__PURE__ */ $constructor("ZodULID", (inst, def) => {
  $ZodULID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function ulid2(params) {
  return _ulid(ZodULID, params);
}
var ZodXID = /* @__PURE__ */ $constructor("ZodXID", (inst, def) => {
  $ZodXID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function xid2(params) {
  return _xid(ZodXID, params);
}
var ZodKSUID = /* @__PURE__ */ $constructor("ZodKSUID", (inst, def) => {
  $ZodKSUID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function ksuid2(params) {
  return _ksuid(ZodKSUID, params);
}
var ZodIPv4 = /* @__PURE__ */ $constructor("ZodIPv4", (inst, def) => {
  $ZodIPv4.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function ipv42(params) {
  return _ipv4(ZodIPv4, params);
}
var ZodIPv6 = /* @__PURE__ */ $constructor("ZodIPv6", (inst, def) => {
  $ZodIPv6.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function ipv62(params) {
  return _ipv6(ZodIPv6, params);
}
var ZodCIDRv4 = /* @__PURE__ */ $constructor("ZodCIDRv4", (inst, def) => {
  $ZodCIDRv4.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function cidrv42(params) {
  return _cidrv4(ZodCIDRv4, params);
}
var ZodCIDRv6 = /* @__PURE__ */ $constructor("ZodCIDRv6", (inst, def) => {
  $ZodCIDRv6.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function cidrv62(params) {
  return _cidrv6(ZodCIDRv6, params);
}
var ZodBase64 = /* @__PURE__ */ $constructor("ZodBase64", (inst, def) => {
  $ZodBase64.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function base642(params) {
  return _base64(ZodBase64, params);
}
var ZodBase64URL = /* @__PURE__ */ $constructor("ZodBase64URL", (inst, def) => {
  $ZodBase64URL.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function base64url2(params) {
  return _base64url(ZodBase64URL, params);
}
var ZodE164 = /* @__PURE__ */ $constructor("ZodE164", (inst, def) => {
  $ZodE164.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function e1642(params) {
  return _e164(ZodE164, params);
}
var ZodJWT = /* @__PURE__ */ $constructor("ZodJWT", (inst, def) => {
  $ZodJWT.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function jwt(params) {
  return _jwt(ZodJWT, params);
}
var ZodCustomStringFormat = /* @__PURE__ */ $constructor("ZodCustomStringFormat", (inst, def) => {
  $ZodCustomStringFormat.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function stringFormat(format, fnOrRegex, _params = {}) {
  return _stringFormat(ZodCustomStringFormat, format, fnOrRegex, _params);
}
function hostname2(_params) {
  return _stringFormat(ZodCustomStringFormat, "hostname", exports_regexes.hostname, _params);
}
function hex2(_params) {
  return _stringFormat(ZodCustomStringFormat, "hex", exports_regexes.hex, _params);
}
function hash(alg, params) {
  const enc = params?.enc ?? "hex";
  const format = `${alg}_${enc}`;
  const regex = exports_regexes[format];
  if (!regex)
    throw new Error(`Unrecognized hash format: ${format}`);
  return _stringFormat(ZodCustomStringFormat, format, regex, params);
}
var ZodNumber = /* @__PURE__ */ $constructor("ZodNumber", (inst, def) => {
  $ZodNumber.init(inst, def);
  ZodType.init(inst, def);
  inst.gt = (value, params) => inst.check(_gt(value, params));
  inst.gte = (value, params) => inst.check(_gte(value, params));
  inst.min = (value, params) => inst.check(_gte(value, params));
  inst.lt = (value, params) => inst.check(_lt(value, params));
  inst.lte = (value, params) => inst.check(_lte(value, params));
  inst.max = (value, params) => inst.check(_lte(value, params));
  inst.int = (params) => inst.check(int(params));
  inst.safe = (params) => inst.check(int(params));
  inst.positive = (params) => inst.check(_gt(0, params));
  inst.nonnegative = (params) => inst.check(_gte(0, params));
  inst.negative = (params) => inst.check(_lt(0, params));
  inst.nonpositive = (params) => inst.check(_lte(0, params));
  inst.multipleOf = (value, params) => inst.check(_multipleOf(value, params));
  inst.step = (value, params) => inst.check(_multipleOf(value, params));
  inst.finite = () => inst;
  const bag = inst._zod.bag;
  inst.minValue = Math.max(bag.minimum ?? Number.NEGATIVE_INFINITY, bag.exclusiveMinimum ?? Number.NEGATIVE_INFINITY) ?? null;
  inst.maxValue = Math.min(bag.maximum ?? Number.POSITIVE_INFINITY, bag.exclusiveMaximum ?? Number.POSITIVE_INFINITY) ?? null;
  inst.isInt = (bag.format ?? "").includes("int") || Number.isSafeInteger(bag.multipleOf ?? 0.5);
  inst.isFinite = true;
  inst.format = bag.format ?? null;
});
function number2(params) {
  return _number(ZodNumber, params);
}
var ZodNumberFormat = /* @__PURE__ */ $constructor("ZodNumberFormat", (inst, def) => {
  $ZodNumberFormat.init(inst, def);
  ZodNumber.init(inst, def);
});
function int(params) {
  return _int(ZodNumberFormat, params);
}
function float32(params) {
  return _float32(ZodNumberFormat, params);
}
function float64(params) {
  return _float64(ZodNumberFormat, params);
}
function int32(params) {
  return _int32(ZodNumberFormat, params);
}
function uint32(params) {
  return _uint32(ZodNumberFormat, params);
}
var ZodBoolean = /* @__PURE__ */ $constructor("ZodBoolean", (inst, def) => {
  $ZodBoolean.init(inst, def);
  ZodType.init(inst, def);
});
function boolean2(params) {
  return _boolean(ZodBoolean, params);
}
var ZodBigInt = /* @__PURE__ */ $constructor("ZodBigInt", (inst, def) => {
  $ZodBigInt.init(inst, def);
  ZodType.init(inst, def);
  inst.gte = (value, params) => inst.check(_gte(value, params));
  inst.min = (value, params) => inst.check(_gte(value, params));
  inst.gt = (value, params) => inst.check(_gt(value, params));
  inst.gte = (value, params) => inst.check(_gte(value, params));
  inst.min = (value, params) => inst.check(_gte(value, params));
  inst.lt = (value, params) => inst.check(_lt(value, params));
  inst.lte = (value, params) => inst.check(_lte(value, params));
  inst.max = (value, params) => inst.check(_lte(value, params));
  inst.positive = (params) => inst.check(_gt(BigInt(0), params));
  inst.negative = (params) => inst.check(_lt(BigInt(0), params));
  inst.nonpositive = (params) => inst.check(_lte(BigInt(0), params));
  inst.nonnegative = (params) => inst.check(_gte(BigInt(0), params));
  inst.multipleOf = (value, params) => inst.check(_multipleOf(value, params));
  const bag = inst._zod.bag;
  inst.minValue = bag.minimum ?? null;
  inst.maxValue = bag.maximum ?? null;
  inst.format = bag.format ?? null;
});
function bigint2(params) {
  return _bigint(ZodBigInt, params);
}
var ZodBigIntFormat = /* @__PURE__ */ $constructor("ZodBigIntFormat", (inst, def) => {
  $ZodBigIntFormat.init(inst, def);
  ZodBigInt.init(inst, def);
});
function int64(params) {
  return _int64(ZodBigIntFormat, params);
}
function uint64(params) {
  return _uint64(ZodBigIntFormat, params);
}
var ZodSymbol = /* @__PURE__ */ $constructor("ZodSymbol", (inst, def) => {
  $ZodSymbol.init(inst, def);
  ZodType.init(inst, def);
});
function symbol(params) {
  return _symbol(ZodSymbol, params);
}
var ZodUndefined = /* @__PURE__ */ $constructor("ZodUndefined", (inst, def) => {
  $ZodUndefined.init(inst, def);
  ZodType.init(inst, def);
});
function _undefined3(params) {
  return _undefined2(ZodUndefined, params);
}
var ZodNull = /* @__PURE__ */ $constructor("ZodNull", (inst, def) => {
  $ZodNull.init(inst, def);
  ZodType.init(inst, def);
});
function _null3(params) {
  return _null2(ZodNull, params);
}
var ZodAny = /* @__PURE__ */ $constructor("ZodAny", (inst, def) => {
  $ZodAny.init(inst, def);
  ZodType.init(inst, def);
});
function any() {
  return _any(ZodAny);
}
var ZodUnknown = /* @__PURE__ */ $constructor("ZodUnknown", (inst, def) => {
  $ZodUnknown.init(inst, def);
  ZodType.init(inst, def);
});
function unknown() {
  return _unknown(ZodUnknown);
}
var ZodNever = /* @__PURE__ */ $constructor("ZodNever", (inst, def) => {
  $ZodNever.init(inst, def);
  ZodType.init(inst, def);
});
function never(params) {
  return _never(ZodNever, params);
}
var ZodVoid = /* @__PURE__ */ $constructor("ZodVoid", (inst, def) => {
  $ZodVoid.init(inst, def);
  ZodType.init(inst, def);
});
function _void2(params) {
  return _void(ZodVoid, params);
}
var ZodDate = /* @__PURE__ */ $constructor("ZodDate", (inst, def) => {
  $ZodDate.init(inst, def);
  ZodType.init(inst, def);
  inst.min = (value, params) => inst.check(_gte(value, params));
  inst.max = (value, params) => inst.check(_lte(value, params));
  const c = inst._zod.bag;
  inst.minDate = c.minimum ? new Date(c.minimum) : null;
  inst.maxDate = c.maximum ? new Date(c.maximum) : null;
});
function date3(params) {
  return _date(ZodDate, params);
}
var ZodArray = /* @__PURE__ */ $constructor("ZodArray", (inst, def) => {
  $ZodArray.init(inst, def);
  ZodType.init(inst, def);
  inst.element = def.element;
  inst.min = (minLength, params) => inst.check(_minLength(minLength, params));
  inst.nonempty = (params) => inst.check(_minLength(1, params));
  inst.max = (maxLength, params) => inst.check(_maxLength(maxLength, params));
  inst.length = (len, params) => inst.check(_length(len, params));
  inst.unwrap = () => inst.element;
});
function array(element, params) {
  return _array(ZodArray, element, params);
}
function keyof(schema) {
  const shape = schema._zod.def.shape;
  return _enum2(Object.keys(shape));
}
var ZodObject = /* @__PURE__ */ $constructor("ZodObject", (inst, def) => {
  $ZodObjectJIT.init(inst, def);
  ZodType.init(inst, def);
  exports_util.defineLazy(inst, "shape", () => {
    return def.shape;
  });
  inst.keyof = () => _enum2(Object.keys(inst._zod.def.shape));
  inst.catchall = (catchall) => inst.clone({ ...inst._zod.def, catchall });
  inst.passthrough = () => inst.clone({ ...inst._zod.def, catchall: unknown() });
  inst.loose = () => inst.clone({ ...inst._zod.def, catchall: unknown() });
  inst.strict = () => inst.clone({ ...inst._zod.def, catchall: never() });
  inst.strip = () => inst.clone({ ...inst._zod.def, catchall: undefined });
  inst.extend = (incoming) => {
    return exports_util.extend(inst, incoming);
  };
  inst.safeExtend = (incoming) => {
    return exports_util.safeExtend(inst, incoming);
  };
  inst.merge = (other) => exports_util.merge(inst, other);
  inst.pick = (mask) => exports_util.pick(inst, mask);
  inst.omit = (mask) => exports_util.omit(inst, mask);
  inst.partial = (...args) => exports_util.partial(ZodOptional, inst, args[0]);
  inst.required = (...args) => exports_util.required(ZodNonOptional, inst, args[0]);
});
function object(shape, params) {
  const def = {
    type: "object",
    shape: shape ?? {},
    ...exports_util.normalizeParams(params)
  };
  return new ZodObject(def);
}
function strictObject(shape, params) {
  return new ZodObject({
    type: "object",
    shape,
    catchall: never(),
    ...exports_util.normalizeParams(params)
  });
}
function looseObject(shape, params) {
  return new ZodObject({
    type: "object",
    shape,
    catchall: unknown(),
    ...exports_util.normalizeParams(params)
  });
}
var ZodUnion = /* @__PURE__ */ $constructor("ZodUnion", (inst, def) => {
  $ZodUnion.init(inst, def);
  ZodType.init(inst, def);
  inst.options = def.options;
});
function union(options, params) {
  return new ZodUnion({
    type: "union",
    options,
    ...exports_util.normalizeParams(params)
  });
}
var ZodDiscriminatedUnion = /* @__PURE__ */ $constructor("ZodDiscriminatedUnion", (inst, def) => {
  ZodUnion.init(inst, def);
  $ZodDiscriminatedUnion.init(inst, def);
});
function discriminatedUnion(discriminator, options, params) {
  return new ZodDiscriminatedUnion({
    type: "union",
    options,
    discriminator,
    ...exports_util.normalizeParams(params)
  });
}
var ZodIntersection = /* @__PURE__ */ $constructor("ZodIntersection", (inst, def) => {
  $ZodIntersection.init(inst, def);
  ZodType.init(inst, def);
});
function intersection(left, right) {
  return new ZodIntersection({
    type: "intersection",
    left,
    right
  });
}
var ZodTuple = /* @__PURE__ */ $constructor("ZodTuple", (inst, def) => {
  $ZodTuple.init(inst, def);
  ZodType.init(inst, def);
  inst.rest = (rest) => inst.clone({
    ...inst._zod.def,
    rest
  });
});
function tuple(items, _paramsOrRest, _params) {
  const hasRest = _paramsOrRest instanceof $ZodType;
  const params = hasRest ? _params : _paramsOrRest;
  const rest = hasRest ? _paramsOrRest : null;
  return new ZodTuple({
    type: "tuple",
    items,
    rest,
    ...exports_util.normalizeParams(params)
  });
}
var ZodRecord = /* @__PURE__ */ $constructor("ZodRecord", (inst, def) => {
  $ZodRecord.init(inst, def);
  ZodType.init(inst, def);
  inst.keyType = def.keyType;
  inst.valueType = def.valueType;
});
function record(keyType, valueType, params) {
  return new ZodRecord({
    type: "record",
    keyType,
    valueType,
    ...exports_util.normalizeParams(params)
  });
}
function partialRecord(keyType, valueType, params) {
  const k = clone(keyType);
  k._zod.values = undefined;
  return new ZodRecord({
    type: "record",
    keyType: k,
    valueType,
    ...exports_util.normalizeParams(params)
  });
}
var ZodMap = /* @__PURE__ */ $constructor("ZodMap", (inst, def) => {
  $ZodMap.init(inst, def);
  ZodType.init(inst, def);
  inst.keyType = def.keyType;
  inst.valueType = def.valueType;
});
function map(keyType, valueType, params) {
  return new ZodMap({
    type: "map",
    keyType,
    valueType,
    ...exports_util.normalizeParams(params)
  });
}
var ZodSet = /* @__PURE__ */ $constructor("ZodSet", (inst, def) => {
  $ZodSet.init(inst, def);
  ZodType.init(inst, def);
  inst.min = (...args) => inst.check(_minSize(...args));
  inst.nonempty = (params) => inst.check(_minSize(1, params));
  inst.max = (...args) => inst.check(_maxSize(...args));
  inst.size = (...args) => inst.check(_size(...args));
});
function set(valueType, params) {
  return new ZodSet({
    type: "set",
    valueType,
    ...exports_util.normalizeParams(params)
  });
}
var ZodEnum = /* @__PURE__ */ $constructor("ZodEnum", (inst, def) => {
  $ZodEnum.init(inst, def);
  ZodType.init(inst, def);
  inst.enum = def.entries;
  inst.options = Object.values(def.entries);
  const keys = new Set(Object.keys(def.entries));
  inst.extract = (values, params) => {
    const newEntries = {};
    for (const value of values) {
      if (keys.has(value)) {
        newEntries[value] = def.entries[value];
      } else
        throw new Error(`Key ${value} not found in enum`);
    }
    return new ZodEnum({
      ...def,
      checks: [],
      ...exports_util.normalizeParams(params),
      entries: newEntries
    });
  };
  inst.exclude = (values, params) => {
    const newEntries = { ...def.entries };
    for (const value of values) {
      if (keys.has(value)) {
        delete newEntries[value];
      } else
        throw new Error(`Key ${value} not found in enum`);
    }
    return new ZodEnum({
      ...def,
      checks: [],
      ...exports_util.normalizeParams(params),
      entries: newEntries
    });
  };
});
function _enum2(values, params) {
  const entries = Array.isArray(values) ? Object.fromEntries(values.map((v) => [v, v])) : values;
  return new ZodEnum({
    type: "enum",
    entries,
    ...exports_util.normalizeParams(params)
  });
}
function nativeEnum(entries, params) {
  return new ZodEnum({
    type: "enum",
    entries,
    ...exports_util.normalizeParams(params)
  });
}
var ZodLiteral = /* @__PURE__ */ $constructor("ZodLiteral", (inst, def) => {
  $ZodLiteral.init(inst, def);
  ZodType.init(inst, def);
  inst.values = new Set(def.values);
  Object.defineProperty(inst, "value", {
    get() {
      if (def.values.length > 1) {
        throw new Error("This schema contains multiple valid literal values. Use `.values` instead.");
      }
      return def.values[0];
    }
  });
});
function literal(value, params) {
  return new ZodLiteral({
    type: "literal",
    values: Array.isArray(value) ? value : [value],
    ...exports_util.normalizeParams(params)
  });
}
var ZodFile = /* @__PURE__ */ $constructor("ZodFile", (inst, def) => {
  $ZodFile.init(inst, def);
  ZodType.init(inst, def);
  inst.min = (size, params) => inst.check(_minSize(size, params));
  inst.max = (size, params) => inst.check(_maxSize(size, params));
  inst.mime = (types, params) => inst.check(_mime(Array.isArray(types) ? types : [types], params));
});
function file(params) {
  return _file(ZodFile, params);
}
var ZodTransform = /* @__PURE__ */ $constructor("ZodTransform", (inst, def) => {
  $ZodTransform.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.parse = (payload, _ctx) => {
    if (_ctx.direction === "backward") {
      throw new $ZodEncodeError(inst.constructor.name);
    }
    payload.addIssue = (issue2) => {
      if (typeof issue2 === "string") {
        payload.issues.push(exports_util.issue(issue2, payload.value, def));
      } else {
        const _issue = issue2;
        if (_issue.fatal)
          _issue.continue = false;
        _issue.code ?? (_issue.code = "custom");
        _issue.input ?? (_issue.input = payload.value);
        _issue.inst ?? (_issue.inst = inst);
        payload.issues.push(exports_util.issue(_issue));
      }
    };
    const output = def.transform(payload.value, payload);
    if (output instanceof Promise) {
      return output.then((output2) => {
        payload.value = output2;
        return payload;
      });
    }
    payload.value = output;
    return payload;
  };
});
function transform(fn) {
  return new ZodTransform({
    type: "transform",
    transform: fn
  });
}
var ZodOptional = /* @__PURE__ */ $constructor("ZodOptional", (inst, def) => {
  $ZodOptional.init(inst, def);
  ZodType.init(inst, def);
  inst.unwrap = () => inst._zod.def.innerType;
});
function optional(innerType) {
  return new ZodOptional({
    type: "optional",
    innerType
  });
}
var ZodNullable = /* @__PURE__ */ $constructor("ZodNullable", (inst, def) => {
  $ZodNullable.init(inst, def);
  ZodType.init(inst, def);
  inst.unwrap = () => inst._zod.def.innerType;
});
function nullable(innerType) {
  return new ZodNullable({
    type: "nullable",
    innerType
  });
}
function nullish2(innerType) {
  return optional(nullable(innerType));
}
var ZodDefault = /* @__PURE__ */ $constructor("ZodDefault", (inst, def) => {
  $ZodDefault.init(inst, def);
  ZodType.init(inst, def);
  inst.unwrap = () => inst._zod.def.innerType;
  inst.removeDefault = inst.unwrap;
});
function _default2(innerType, defaultValue) {
  return new ZodDefault({
    type: "default",
    innerType,
    get defaultValue() {
      return typeof defaultValue === "function" ? defaultValue() : exports_util.shallowClone(defaultValue);
    }
  });
}
var ZodPrefault = /* @__PURE__ */ $constructor("ZodPrefault", (inst, def) => {
  $ZodPrefault.init(inst, def);
  ZodType.init(inst, def);
  inst.unwrap = () => inst._zod.def.innerType;
});
function prefault(innerType, defaultValue) {
  return new ZodPrefault({
    type: "prefault",
    innerType,
    get defaultValue() {
      return typeof defaultValue === "function" ? defaultValue() : exports_util.shallowClone(defaultValue);
    }
  });
}
var ZodNonOptional = /* @__PURE__ */ $constructor("ZodNonOptional", (inst, def) => {
  $ZodNonOptional.init(inst, def);
  ZodType.init(inst, def);
  inst.unwrap = () => inst._zod.def.innerType;
});
function nonoptional(innerType, params) {
  return new ZodNonOptional({
    type: "nonoptional",
    innerType,
    ...exports_util.normalizeParams(params)
  });
}
var ZodSuccess = /* @__PURE__ */ $constructor("ZodSuccess", (inst, def) => {
  $ZodSuccess.init(inst, def);
  ZodType.init(inst, def);
  inst.unwrap = () => inst._zod.def.innerType;
});
function success(innerType) {
  return new ZodSuccess({
    type: "success",
    innerType
  });
}
var ZodCatch = /* @__PURE__ */ $constructor("ZodCatch", (inst, def) => {
  $ZodCatch.init(inst, def);
  ZodType.init(inst, def);
  inst.unwrap = () => inst._zod.def.innerType;
  inst.removeCatch = inst.unwrap;
});
function _catch2(innerType, catchValue) {
  return new ZodCatch({
    type: "catch",
    innerType,
    catchValue: typeof catchValue === "function" ? catchValue : () => catchValue
  });
}
var ZodNaN = /* @__PURE__ */ $constructor("ZodNaN", (inst, def) => {
  $ZodNaN.init(inst, def);
  ZodType.init(inst, def);
});
function nan(params) {
  return _nan(ZodNaN, params);
}
var ZodPipe = /* @__PURE__ */ $constructor("ZodPipe", (inst, def) => {
  $ZodPipe.init(inst, def);
  ZodType.init(inst, def);
  inst.in = def.in;
  inst.out = def.out;
});
function pipe(in_, out) {
  return new ZodPipe({
    type: "pipe",
    in: in_,
    out
  });
}
var ZodCodec = /* @__PURE__ */ $constructor("ZodCodec", (inst, def) => {
  ZodPipe.init(inst, def);
  $ZodCodec.init(inst, def);
});
function codec(in_, out, params) {
  return new ZodCodec({
    type: "pipe",
    in: in_,
    out,
    transform: params.decode,
    reverseTransform: params.encode
  });
}
var ZodReadonly = /* @__PURE__ */ $constructor("ZodReadonly", (inst, def) => {
  $ZodReadonly.init(inst, def);
  ZodType.init(inst, def);
  inst.unwrap = () => inst._zod.def.innerType;
});
function readonly(innerType) {
  return new ZodReadonly({
    type: "readonly",
    innerType
  });
}
var ZodTemplateLiteral = /* @__PURE__ */ $constructor("ZodTemplateLiteral", (inst, def) => {
  $ZodTemplateLiteral.init(inst, def);
  ZodType.init(inst, def);
});
function templateLiteral(parts, params) {
  return new ZodTemplateLiteral({
    type: "template_literal",
    parts,
    ...exports_util.normalizeParams(params)
  });
}
var ZodLazy = /* @__PURE__ */ $constructor("ZodLazy", (inst, def) => {
  $ZodLazy.init(inst, def);
  ZodType.init(inst, def);
  inst.unwrap = () => inst._zod.def.getter();
});
function lazy(getter) {
  return new ZodLazy({
    type: "lazy",
    getter
  });
}
var ZodPromise = /* @__PURE__ */ $constructor("ZodPromise", (inst, def) => {
  $ZodPromise.init(inst, def);
  ZodType.init(inst, def);
  inst.unwrap = () => inst._zod.def.innerType;
});
function promise(innerType) {
  return new ZodPromise({
    type: "promise",
    innerType
  });
}
var ZodFunction = /* @__PURE__ */ $constructor("ZodFunction", (inst, def) => {
  $ZodFunction.init(inst, def);
  ZodType.init(inst, def);
});
function _function(params) {
  return new ZodFunction({
    type: "function",
    input: Array.isArray(params?.input) ? tuple(params?.input) : params?.input ?? array(unknown()),
    output: params?.output ?? unknown()
  });
}
var ZodCustom = /* @__PURE__ */ $constructor("ZodCustom", (inst, def) => {
  $ZodCustom.init(inst, def);
  ZodType.init(inst, def);
});
function check(fn) {
  const ch = new $ZodCheck({
    check: "custom"
  });
  ch._zod.check = fn;
  return ch;
}
function custom(fn, _params) {
  return _custom(ZodCustom, fn ?? (() => true), _params);
}
function refine(fn, _params = {}) {
  return _refine(ZodCustom, fn, _params);
}
function superRefine(fn) {
  return _superRefine(fn);
}
function _instanceof(cls, params = {
  error: `Input not instance of ${cls.name}`
}) {
  const inst = new ZodCustom({
    type: "custom",
    check: "custom",
    fn: (data) => data instanceof cls,
    abort: true,
    ...exports_util.normalizeParams(params)
  });
  inst._zod.bag.Class = cls;
  return inst;
}
var stringbool = (...args) => _stringbool({
  Codec: ZodCodec,
  Boolean: ZodBoolean,
  String: ZodString
}, ...args);
function json(params) {
  const jsonSchema = lazy(() => {
    return union([string2(params), number2(), boolean2(), _null3(), array(jsonSchema), record(string2(), jsonSchema)]);
  });
  return jsonSchema;
}
function preprocess(fn, schema) {
  return pipe(transform(fn), schema);
}
// node_modules/zod/v4/classic/compat.js
var ZodIssueCode = {
  invalid_type: "invalid_type",
  too_big: "too_big",
  too_small: "too_small",
  invalid_format: "invalid_format",
  not_multiple_of: "not_multiple_of",
  unrecognized_keys: "unrecognized_keys",
  invalid_union: "invalid_union",
  invalid_key: "invalid_key",
  invalid_element: "invalid_element",
  invalid_value: "invalid_value",
  custom: "custom"
};
function setErrorMap(map2) {
  config({
    customError: map2
  });
}
function getErrorMap() {
  return config().customError;
}
var ZodFirstPartyTypeKind;
(function(ZodFirstPartyTypeKind2) {})(ZodFirstPartyTypeKind || (ZodFirstPartyTypeKind = {}));
// node_modules/zod/v4/classic/coerce.js
var exports_coerce = {};
__export(exports_coerce, {
  string: () => string3,
  number: () => number3,
  date: () => date4,
  boolean: () => boolean3,
  bigint: () => bigint3
});
function string3(params) {
  return _coercedString(ZodString, params);
}
function number3(params) {
  return _coercedNumber(ZodNumber, params);
}
function boolean3(params) {
  return _coercedBoolean(ZodBoolean, params);
}
function bigint3(params) {
  return _coercedBigint(ZodBigInt, params);
}
function date4(params) {
  return _coercedDate(ZodDate, params);
}

// node_modules/zod/v4/classic/external.js
config(en_default());
// node_modules/@openuidev/lang-core/dist/index.mjs
var reactiveSchemas = /* @__PURE__ */ new WeakSet;
function isReactiveSchema(schema) {
  return typeof schema === "object" && schema !== null && reactiveSchemas.has(schema);
}
var schemaIdTags = /* @__PURE__ */ new WeakMap;
function tagSchemaId(schema, id) {
  schemaIdTags.set(schema, id);
}
var actionRefTags = /* @__PURE__ */ new WeakMap;
function actionRef(name, data) {
  actionRefTags.set(data, name);
  return data;
}
function assertV4Schema(schema, componentName) {
  if (schema != null && typeof schema === "object" && "_def" in schema && !("_zod" in schema))
    throw new Error(`[OpenUI] Component "${componentName}" was defined with a Zod 3 schema. OpenUI requires Zod 4 schemas. If you're on zod@3.25+, import from "zod/v4" instead of "zod". See: https://zod.dev/v4/versioning`);
}
function assertParamsObject(params, name) {
  assertV4Schema(params, name);
  if (params?._zod?.def.type !== "object")
    throw new Error(`[OpenUI] "${name}" params must be a z.object().`);
}
function defineFunction(config2) {
  assertParamsObject(config2.params, config2.name);
  if (config2.returns)
    assertV4Schema(config2.returns, config2.name);
  return config2;
}
function defineAction(config2) {
  assertParamsObject(config2.params, config2.name);
  const data = object({
    type: literal(config2.name),
    params: config2.params
  });
  return {
    ...config2,
    ref: actionRef(config2.name, data)
  };
}
function resolveField(obj, path) {
  if (!path || obj == null)
    return;
  if (!path.includes("."))
    return obj[path];
  let cur = obj;
  for (const p of path.split(".")) {
    if (cur == null)
      return;
    cur = cur[p];
  }
  return cur;
}
function toNumber(val) {
  if (typeof val === "number")
    return val;
  if (typeof val === "string") {
    const n = Number(val);
    return isNaN(n) ? 0 : n;
  }
  if (typeof val === "boolean")
    return val ? 1 : 0;
  return 0;
}
var sumOf = (arr) => arr.reduce((a, b) => a + toNumber(b), 0);
var array2 = () => exports_external.array(exports_external.any());
var numbers = () => exports_external.object({ numbers: exports_external.array(exports_external.number()) });
var number4 = () => exports_external.object({ number: exports_external.number() });
var builtins = [
  defineFunction({
    name: "Count",
    description: "Returns array length",
    params: exports_external.object({ array: array2() }),
    returns: exports_external.number(),
    fn: ({ array: array3 }) => Array.isArray(array3) ? array3.length : 0
  }),
  defineFunction({
    name: "First",
    description: "Returns first element of array",
    params: exports_external.object({ array: array2() }),
    returns: exports_external.any(),
    fn: ({ array: array3 }) => Array.isArray(array3) ? array3[0] ?? null : null
  }),
  defineFunction({
    name: "Last",
    description: "Returns last element of array",
    params: exports_external.object({ array: array2() }),
    returns: exports_external.any(),
    fn: ({ array: array3 }) => Array.isArray(array3) ? array3[array3.length - 1] ?? null : null
  }),
  defineFunction({
    name: "Sum",
    description: "Sum of numeric array",
    params: numbers(),
    returns: exports_external.number(),
    fn: ({ numbers: numbers2 }) => Array.isArray(numbers2) ? sumOf(numbers2) : 0
  }),
  defineFunction({
    name: "Avg",
    description: "Average of numeric array",
    params: numbers(),
    returns: exports_external.number(),
    fn: ({ numbers: numbers2 }) => Array.isArray(numbers2) && numbers2.length ? sumOf(numbers2) / numbers2.length : 0
  }),
  defineFunction({
    name: "Min",
    description: "Minimum value in array",
    params: numbers(),
    returns: exports_external.number(),
    fn: ({ numbers: numbers2 }) => Array.isArray(numbers2) && numbers2.length ? numbers2.reduce((acc, b) => Math.min(acc, toNumber(b)), toNumber(numbers2[0])) : 0
  }),
  defineFunction({
    name: "Max",
    description: "Maximum value in array",
    params: numbers(),
    returns: exports_external.number(),
    fn: ({ numbers: numbers2 }) => Array.isArray(numbers2) && numbers2.length ? numbers2.reduce((acc, b) => Math.max(acc, toNumber(b)), toNumber(numbers2[0])) : 0
  }),
  defineFunction({
    name: "Sort",
    description: 'Sort array by field. Direction: "asc" (default) or "desc"',
    params: exports_external.object({
      array: array2(),
      field: exports_external.string(),
      direction: exports_external.enum(["asc", "desc"]).optional()
    }),
    returns: array2(),
    fn: ({ array: array3, field, direction }) => {
      if (!Array.isArray(array3))
        return array3;
      const f = String(field ?? "");
      const desc = String(direction ?? "asc") === "desc";
      return [...array3].sort((a, b) => {
        const av = f ? resolveField(a, f) : a;
        const bv = f ? resolveField(b, f) : b;
        const aIsNumeric = typeof av === "number" || typeof av === "string" && !isNaN(Number(av)) && av !== "";
        const bIsNumeric = typeof bv === "number" || typeof bv === "string" && !isNaN(Number(bv)) && bv !== "";
        if (aIsNumeric && bIsNumeric) {
          const diff = toNumber(av) - toNumber(bv);
          return desc ? -diff : diff;
        }
        const cmp = String(av ?? "").localeCompare(String(bv ?? ""));
        return desc ? -cmp : cmp;
      });
    }
  }),
  defineFunction({
    name: "Filter",
    description: "Filter array by field value",
    params: exports_external.object({
      array: array2(),
      field: exports_external.string(),
      operator: exports_external.enum([
        "==",
        "!=",
        ">",
        "<",
        ">=",
        "<=",
        "contains"
      ]),
      value: exports_external.any()
    }),
    returns: array2(),
    fn: ({ array: array3, field, operator, value }) => {
      if (!Array.isArray(array3))
        return [];
      const f = String(field ?? "");
      const o = String(operator ?? "==");
      return array3.filter((item) => {
        const v = f ? resolveField(item, f) : item;
        switch (o) {
          case "==":
            return v == value;
          case "!=":
            return v != value;
          case ">":
            return toNumber(v) > toNumber(value);
          case "<":
            return toNumber(v) < toNumber(value);
          case ">=":
            return toNumber(v) >= toNumber(value);
          case "<=":
            return toNumber(v) <= toNumber(value);
          case "contains":
            return String(v ?? "").includes(String(value ?? ""));
          default:
            return false;
        }
      });
    }
  }),
  defineFunction({
    name: "Round",
    description: "Round to N decimal places (default 0)",
    params: exports_external.object({
      number: exports_external.number(),
      decimals: exports_external.number().optional()
    }),
    returns: exports_external.number(),
    fn: ({ number: number5, decimals }) => {
      const num = toNumber(number5);
      const d = decimals != null ? toNumber(decimals) : 0;
      const factor = Math.pow(10, d);
      return Math.round(num * factor) / factor;
    }
  }),
  defineFunction({
    name: "Abs",
    description: "Absolute value",
    params: number4(),
    returns: exports_external.number(),
    fn: ({ number: number5 }) => Math.abs(toNumber(number5))
  }),
  defineFunction({
    name: "Floor",
    description: "Round down to nearest integer",
    params: number4(),
    returns: exports_external.number(),
    fn: ({ number: number5 }) => Math.floor(toNumber(number5))
  }),
  defineFunction({
    name: "Ceil",
    description: "Round up to nearest integer",
    params: number4(),
    returns: exports_external.number(),
    fn: ({ number: number5 }) => Math.ceil(toNumber(number5))
  }),
  {
    name: "Each",
    description: "Evaluate template for each element. varName is the loop variable — use it ONLY inside the template expression (inline). Do NOT create a separate statement for the template.",
    params: exports_external.object({
      array: array2(),
      varName: exports_external.string(),
      template: exports_external.any()
    }),
    lazy: true
  }
];
var BUILTINS = Object.fromEntries(builtins.map((b) => [b.name, b]));
var ACTION_STEPS = {
  Run: "run",
  ToAssistant: "continue_conversation",
  OpenUrl: "open_url",
  Set: "set",
  Reset: "reset"
};
function named(id) {
  const schema = exports_external.any();
  tagSchemaId(schema, id);
  return schema;
}
var openUrlData = () => exports_external.object({
  type: exports_external.literal("open_url"),
  url: exports_external.string()
});
var toAssistantData = () => exports_external.object({
  type: exports_external.literal("continue_conversation"),
  context: exports_external.string().optional()
});
var actionSchema = exports_external.union([
  openUrlData(),
  toAssistantData(),
  exports_external.object({
    type: exports_external.string(),
    params: exports_external.record(exports_external.string(), exports_external.any()).optional()
  })
]);
tagSchemaId(actionSchema, "ActionExpression");
var steps = {
  OpenUrl: { ref: actionRef("OpenUrl", openUrlData()) },
  ToAssistant: { ref: actionRef("ToAssistant", toAssistantData()) }
};
var ACTION_DEFS = {
  ActionExpression: actionSchema,
  OpenUrl: steps.OpenUrl.ref,
  ToAssistant: steps.ToAssistant.ref
};
var builtinSteps$1 = [
  {
    ...defineAction({
      name: "Run",
      description: "Execute a Mutation or re-fetch a Query (ref must be a declared Query/Mutation)",
      params: exports_external.object({ ref: named("Query | Mutation") })
    }),
    lazy: true
  },
  {
    ...defineAction({
      name: "ToAssistant",
      description: 'Send a message to the assistant (for conversational buttons like "Tell me more", "Explain this"). The optional context is any value (object, array, string, number) passed to the assistant as hidden data, e.g. @ToAssistant("Show details", {orderId: 42})',
      params: exports_external.object({
        message: exports_external.string(),
        context: exports_external.any().optional()
      })
    }),
    ref: steps.ToAssistant.ref,
    step: ({ message, context }) => ({
      type: ACTION_STEPS.ToAssistant,
      message: String(message ?? ""),
      context: context ?? undefined
    })
  },
  {
    ...defineAction({
      name: "OpenUrl",
      description: "Navigate to a URL",
      params: exports_external.object({ url: exports_external.string() })
    }),
    ref: steps.OpenUrl.ref,
    step: ({ url: url2 }) => ({
      type: ACTION_STEPS.OpenUrl,
      url: String(url2 ?? "")
    })
  },
  {
    ...defineAction({
      name: "Set",
      description: "Set a $variable to a specific value",
      params: exports_external.object({
        variable: named("$variable"),
        value: exports_external.any()
      })
    }),
    lazy: true
  },
  {
    ...defineAction({
      name: "Reset",
      description: 'Reset $variables to their declared defaults; pass several to reset each (e.g. @Reset($title, $priority) restores $title="" and $priority="medium")',
      params: exports_external.object({ variable: named("$variable") })
    }),
    lazy: true
  }
];
var BUILTIN_STEPS = Object.fromEntries(builtinSteps$1.map((s) => [s.name, s]));
var callDef = (kind, def) => ({
  kind,
  params: Object.keys(def.params.shape).map((name) => ({
    name,
    required: false
  })),
  builtin: true,
  ...def.lazy ? { lazy: true } : {}
});
var BUILTIN_CALLS = new Map([
  ...builtins.map((b) => [b.name, callDef("function", b)]),
  ...builtinSteps$1.map((s) => [s.name, callDef("action", s)]),
  ["Action", {
    kind: "action",
    params: [{
      name: "steps",
      required: true
    }],
    builtin: true,
    lazy: true
  }]
]);
function getCallDefs(cat) {
  return cat?.callDefs ?? BUILTIN_CALLS;
}
function isBuiltin(name) {
  return BUILTIN_CALLS.has(name);
}
function isStep(name, actions) {
  return BUILTIN_CALLS.get(name)?.kind === "action" || !!actions && Object.prototype.hasOwnProperty.call(actions, name);
}
var RESERVED_CALLS = {
  Query: "Query",
  Mutation: "Mutation"
};
function isReservedCall(name) {
  return name in RESERVED_CALLS;
}
var PARSER_PARSE_EVENT_NAME = "lang_core_parser_parse_used";
var PARSER_PARSE_SAMPLE_RATE = 0.1;
var SDK_VERSION = "1.0.2";
var STATE_KEY = Symbol.for("@openuidev/lang-core/telemetry/v1");
async function sha256(value) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle)
    throw new Error("Web Crypto is unavailable");
  const bytes = new TextEncoder().encode(value);
  const digest = await subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function getProcess() {
  const candidate = globalThis.process;
  if (!candidate || typeof candidate !== "object")
    return;
  return candidate;
}
function hasBrowserWindow() {
  const target = globalThis;
  return target.navigator?.product === "ReactNative" || Boolean(target.window && target.document);
}
function isBrowserWorker() {
  const workerGlobalScope = globalThis.WorkerGlobalScope;
  return Boolean(workerGlobalScope && workerGlobalScope.prototype.isPrototypeOf(globalThis));
}
function detectRuntime() {
  if (hasBrowserWindow())
    return;
  const target = globalThis;
  const processLike = getProcess();
  if (target.Bun && typeof target.Bun === "object")
    return {
      name: "bun",
      version: target.Bun.version,
      env: processLike?.env,
      process: processLike
    };
  if (target.Deno && typeof target.Deno === "object")
    return {
      name: "deno",
      version: target.Deno.version?.deno
    };
  if (typeof target.EdgeRuntime === "string")
    return {
      name: "edge",
      version: target.EdgeRuntime
    };
  if (typeof target.WebSocketPair === "function")
    return { name: "edge" };
  if (isBrowserWorker())
    return;
  if (processLike?.release?.name === "node" || typeof processLike?.versions?.node === "string" && processLike.versions.node.length > 0)
    return {
      name: "node",
      version: processLike.versions?.node,
      env: processLike.env,
      process: processLike
    };
}
function getEnvironment(env) {
  const value = env?.NODE_ENV;
  if (value === "production" || value === "development" || value === "test")
    return value;
  return "unknown";
}
function getState() {
  const registry2 = globalThis;
  registry2[STATE_KEY] ??= { runtimeId: globalThis.crypto.randomUUID() };
  return registry2[STATE_KEY];
}
function readGitOrigin(processLike) {
  const execFile = processLike.getBuiltinModule?.("node:child_process")?.execFile;
  if (!execFile)
    return Promise.resolve(undefined);
  return new Promise((resolve) => {
    try {
      execFile("git", [
        "config",
        "--local",
        "--get",
        "remote.origin.url"
      ], {
        encoding: "utf8",
        timeout: 1000,
        windowsHide: true
      }, (error46, stdout) => {
        const origin = stdout?.trim();
        resolve(error46 || !origin ? undefined : origin);
      });
    } catch {
      resolve(undefined);
    }
  });
}
async function getRepositoryIdentifier(processLike) {
  if (!processLike)
    return;
  const rawValue = await readGitOrigin(processLike) || processLike.env?.REPOSITORY_URL || processLike.cwd?.();
  return rawValue ? normalizeProjectIdentity(rawValue) || undefined : undefined;
}
function calculateProjectHash(repositoryIdentifier) {
  const normalized = normalizeProjectIdentity(repositoryIdentifier);
  if (!normalized)
    return Promise.reject(/* @__PURE__ */ new TypeError("Repository identifier is empty"));
  return sha256(`${PROJECT_ID_SALT}\x00${normalized}`);
}
function getProjectHash(state, runtime) {
  if (runtime.name !== "node")
    return Promise.resolve(undefined);
  state.projectHash ??= Promise.resolve().then(() => getRepositoryIdentifier(runtime.process)).then((identifier) => identifier ? calculateProjectHash(identifier) : undefined).catch(() => {
    return;
  });
  return state.projectHash;
}
async function getCIInfo(runtime) {
  if (!runtime.env)
    return {
      id: null,
      isCI: false
    };
  try {
    const ciInfo = await Promise.resolve().then(() => __toESM(require_ci_info(), 1));
    return {
      id: ciInfo.id,
      isCI: ciInfo.isCI
    };
  } catch {
    return {
      id: null,
      isCI: false
    };
  }
}
async function postCapture(event, properties, runtime) {
  const postHog = getPostHogConfig(runtime.env);
  await globalThis.fetch(postHog.captureUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: postHog.apiKey,
      event,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      properties
    }),
    keepalive: true,
    signal: globalThis.AbortSignal.timeout(TELEMETRY_REQUEST_TIMEOUT_MS)
  });
}
function getValidationErrorCounts(result) {
  const counts = {
    "unknown-component": 0,
    "missing-required": 0,
    "null-required": 0,
    "inline-reserved": 0,
    "excess-args": 0,
    "type-mismatch": 0,
    "unknown-function": 0,
    "no-root": 0
  };
  for (const error46 of result.meta.errors)
    counts[error46.code] += 1;
  return {
    unknown_component_count: counts["unknown-component"],
    missing_required_count: counts["missing-required"],
    null_required_count: counts["null-required"],
    inline_reserved_count: counts["inline-reserved"],
    excess_args_count: counts["excess-args"]
  };
}
function summarizeParserParse(result) {
  return {
    outcome: result.meta.errors.length > 0 ? "invalid" : result.root ? "valid" : "no_renderable_root",
    incomplete: result.meta.incomplete,
    has_renderable_root: result.root !== null,
    statement_count: result.meta.statementCount,
    unresolved_count: result.meta.unresolved.length,
    orphaned_count: result.meta.orphaned.length,
    validation_error_count: result.meta.errors.length,
    ...getValidationErrorCounts(result)
  };
}
async function sendParserParseCapture(context, outcome) {
  const { state, runtime, environment } = context;
  const [projectHash, ciInfo] = await Promise.all([getProjectHash(state, runtime), getCIInfo(runtime)]);
  await postCapture(PARSER_PARSE_EVENT_NAME, {
    distinct_id: state.runtimeId,
    $process_person_profile: false,
    event_id: globalThis.crypto.randomUUID(),
    telemetry_schema_version: 2,
    sdk_name: "@openuidev/lang-core",
    sdk_version: SDK_VERSION,
    api_surface: "parser.parse",
    runtime: runtime.name,
    runtime_version: runtime.version,
    environment,
    ci: ciInfo.isCI,
    ...ciInfo.id ? { ci_name: ciInfo.id } : {},
    sample_rate: PARSER_PARSE_SAMPLE_RATE,
    ...outcome,
    ...projectHash ? {
      project_hash_version: 2,
      project_hash: projectHash
    } : {}
  }, runtime);
}
function prepareParserParseTelemetry() {
  try {
    const runtime = detectRuntime();
    if (!runtime || typeof globalThis.fetch !== "function" || typeof globalThis.crypto?.randomUUID !== "function" || typeof globalThis.AbortSignal?.timeout !== "function")
      return;
    const env = runtime.env;
    if (!isRuntimeTelemetryEnabled(env))
      return;
    if (Math.random() >= PARSER_PARSE_SAMPLE_RATE)
      return;
    return {
      state: getState(),
      runtime,
      environment: getEnvironment(env)
    };
  } catch {
    return;
  }
}
function captureParserParseResult(context, result) {
  if (!context)
    return;
  try {
    const outcome = summarizeParserParse(result);
    Promise.resolve().then(() => sendParserParseCapture(context, outcome)).catch(() => {
      return;
    });
  } catch {}
}
function captureParserParseException(context) {
  if (!context)
    return;
  try {
    Promise.resolve().then(() => sendParserParseCapture(context, { outcome: "threw" })).catch(() => {
      return;
    });
  } catch {}
}
function isElementNode(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return false;
  const node = value;
  return node.type === "element" && typeof node.typeName === "string" && typeof node.props === "object" && node.props !== null && typeof node.partial === "boolean";
}
function isRuntimeExpr(node) {
  switch (node.k) {
    case "StateRef":
    case "RuntimeRef":
    case "BinOp":
    case "UnaryOp":
    case "Ternary":
    case "Member":
    case "Index":
    case "Assign":
      return true;
    default:
      return false;
  }
}
var AST_KINDS = new Set([
  "Comp",
  "Ref",
  "StateRef",
  "RuntimeRef",
  "BinOp",
  "UnaryOp",
  "Ternary",
  "Member",
  "Index",
  "Assign",
  "Str",
  "Num",
  "Bool",
  "Null",
  "Arr",
  "Obj",
  "Ph"
]);
function isASTNode(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return false;
  return AST_KINDS.has(value.k);
}
function walkAST(node, visit) {
  const walk = (current) => {
    visit(current);
    switch (current.k) {
      case "Comp":
        current.args.forEach(walk);
        Object.values(current.mappedProps ?? {}).forEach(walk);
        break;
      case "Arr":
        current.els.forEach(walk);
        break;
      case "Obj":
        current.entries.forEach(([, value]) => walk(value));
        break;
      case "BinOp":
        walk(current.left);
        walk(current.right);
        break;
      case "UnaryOp":
        walk(current.operand);
        break;
      case "Ternary":
        walk(current.cond);
        walk(current.then);
        walk(current.else);
        break;
      case "Member":
        walk(current.obj);
        break;
      case "Index":
        walk(current.obj);
        walk(current.index);
        break;
      case "Assign":
        walk(current.value);
        break;
    }
  };
  walk(node);
}
function toLiteralAST(value) {
  if (value === null || value === undefined)
    return { k: "Null" };
  if (typeof value === "string")
    return {
      k: "Str",
      v: value
    };
  if (typeof value === "number")
    return {
      k: "Num",
      v: value
    };
  if (typeof value === "boolean")
    return {
      k: "Bool",
      v: value
    };
  if (Array.isArray(value))
    return {
      k: "Arr",
      els: value.map(toLiteralAST)
    };
  if (typeof value === "object")
    return {
      k: "Obj",
      entries: Object.entries(value).map(([k, v]) => [k, toLiteralAST(v)])
    };
  return { k: "Null" };
}
function literalValue(node) {
  switch (node.k) {
    case "Str":
    case "Num":
    case "Bool":
      return { v: node.v };
    case "Null":
      return { v: null };
    case "Arr": {
      const v = [];
      for (const e of node.els) {
        const lit = literalValue(e);
        if (!lit)
          return;
        v.push(lit.v);
      }
      return { v };
    }
    case "Obj": {
      const v = {};
      for (const [k, e] of node.entries) {
        const lit = literalValue(e);
        if (!lit)
          return;
        v[k] = lit.v;
      }
      return { v };
    }
    default:
      return;
  }
}
var PREC_TERNARY = 1;
var PREC_OR = 2;
var PREC_AND = 3;
var PREC_EQ = 4;
var PREC_CMP = 5;
var PREC_ADD = 6;
var PREC_MUL = 7;
var PREC_UNARY = 8;
var PREC_MEMBER = 9;
function parseExpression(tokens) {
  let pos = 0;
  const cur = () => tokens[pos] ?? { t: 13 };
  const adv = () => {
    const tok = cur();
    pos++;
    return tok;
  };
  const eat = (kind) => {
    if (cur().t === kind)
      pos++;
  };
  function getInfixPrec(tok) {
    switch (tok.t) {
      case 34:
        return PREC_TERNARY;
      case 32:
        return PREC_OR;
      case 31:
        return PREC_AND;
      case 25:
      case 26:
        return PREC_EQ;
      case 27:
      case 28:
      case 29:
      case 30:
        return PREC_CMP;
      case 20:
      case 21:
        return PREC_ADD;
      case 22:
      case 23:
      case 24:
        return PREC_MUL;
      case 19:
      case 3:
        return PREC_MEMBER;
      default:
        return 0;
    }
  }
  function parseExpr(minPrec = 0) {
    let left = parsePrefix();
    while (getInfixPrec(cur()) > minPrec)
      left = parseInfix(left);
    return left;
  }
  function parsePrefix() {
    const tok = cur();
    if (tok.t === 14) {
      adv();
      return {
        k: "Str",
        v: tok.v
      };
    }
    if (tok.t === 15) {
      adv();
      return {
        k: "Num",
        v: tok.v
      };
    }
    if (tok.t === 10) {
      adv();
      return {
        k: "Bool",
        v: true
      };
    }
    if (tok.t === 11) {
      adv();
      return {
        k: "Bool",
        v: false
      };
    }
    if (tok.t === 12) {
      adv();
      return { k: "Null" };
    }
    if (tok.t === 3)
      return parseArr();
    if (tok.t === 5)
      return parseObj();
    if (tok.t === 18) {
      const name = tok.v;
      adv();
      if (cur().t === 9) {
        adv();
        return {
          k: "Assign",
          target: name,
          value: parseExpr(0)
        };
      }
      return {
        k: "StateRef",
        n: name
      };
    }
    if (tok.t === 17) {
      const name = tok.v;
      if (tokens[pos + 1]?.t === 1 && (!isBuiltin(name) || name === "Action"))
        return parseComp();
      adv();
      return {
        k: "Ref",
        n: name
      };
    }
    if (tok.t === 35) {
      if (tokens[pos + 1]?.t === 1) {
        const call = parseComp();
        if (call.k === "Comp" && !isBuiltin(call.name))
          call.fn = true;
        return call;
      }
      adv();
      return {
        k: "Ref",
        n: tok.v
      };
    }
    if (tok.t === 16) {
      adv();
      return {
        k: "Ref",
        n: tok.v
      };
    }
    if (tok.t === 33) {
      adv();
      return {
        k: "UnaryOp",
        op: "!",
        operand: parseExpr(PREC_UNARY)
      };
    }
    if (tok.t === 21) {
      adv();
      return {
        k: "UnaryOp",
        op: "-",
        operand: parseExpr(PREC_UNARY)
      };
    }
    if (tok.t === 1) {
      adv();
      const inner = parseExpr(0);
      eat(2);
      return inner;
    }
    adv();
    return { k: "Null" };
  }
  function parseInfix(left) {
    const tok = cur();
    if (tok.t === 20) {
      adv();
      return {
        k: "BinOp",
        op: "+",
        left,
        right: parseExpr(PREC_ADD)
      };
    }
    if (tok.t === 21) {
      adv();
      return {
        k: "BinOp",
        op: "-",
        left,
        right: parseExpr(PREC_ADD)
      };
    }
    if (tok.t === 22) {
      adv();
      return {
        k: "BinOp",
        op: "*",
        left,
        right: parseExpr(PREC_MUL)
      };
    }
    if (tok.t === 23) {
      adv();
      return {
        k: "BinOp",
        op: "/",
        left,
        right: parseExpr(PREC_MUL)
      };
    }
    if (tok.t === 24) {
      adv();
      return {
        k: "BinOp",
        op: "%",
        left,
        right: parseExpr(PREC_MUL)
      };
    }
    if (tok.t === 25) {
      adv();
      return {
        k: "BinOp",
        op: "==",
        left,
        right: parseExpr(PREC_EQ)
      };
    }
    if (tok.t === 26) {
      adv();
      return {
        k: "BinOp",
        op: "!=",
        left,
        right: parseExpr(PREC_EQ)
      };
    }
    if (tok.t === 27) {
      adv();
      return {
        k: "BinOp",
        op: ">",
        left,
        right: parseExpr(PREC_CMP)
      };
    }
    if (tok.t === 28) {
      adv();
      return {
        k: "BinOp",
        op: "<",
        left,
        right: parseExpr(PREC_CMP)
      };
    }
    if (tok.t === 29) {
      adv();
      return {
        k: "BinOp",
        op: ">=",
        left,
        right: parseExpr(PREC_CMP)
      };
    }
    if (tok.t === 30) {
      adv();
      return {
        k: "BinOp",
        op: "<=",
        left,
        right: parseExpr(PREC_CMP)
      };
    }
    if (tok.t === 31) {
      adv();
      return {
        k: "BinOp",
        op: "&&",
        left,
        right: parseExpr(PREC_AND)
      };
    }
    if (tok.t === 32) {
      adv();
      return {
        k: "BinOp",
        op: "||",
        left,
        right: parseExpr(PREC_OR)
      };
    }
    if (tok.t === 34) {
      adv();
      const then = parseExpr(0);
      eat(8);
      return {
        k: "Ternary",
        cond: left,
        then,
        else: parseExpr(0)
      };
    }
    if (tok.t === 19) {
      adv();
      const fieldTok = cur();
      return {
        k: "Member",
        obj: left,
        field: fieldTok.t === 16 || fieldTok.t === 17 || fieldTok.t === 14 || fieldTok.t === 15 ? (adv(), String(fieldTok.v)) : fieldTok.t === 18 ? (adv(), fieldTok.v.replace(/^\$/, "")) : (adv(), "?")
      };
    }
    if (tok.t === 3) {
      adv();
      const index = parseExpr(0);
      eat(4);
      return {
        k: "Index",
        obj: left,
        index
      };
    }
    return left;
  }
  function parseComp() {
    const name = cur().v;
    adv();
    eat(1);
    const args = [];
    while (cur().t !== 2 && cur().t !== 13) {
      args.push(parseExpr(0));
      if (cur().t === 7)
        adv();
    }
    eat(2);
    return {
      k: "Comp",
      name,
      args
    };
  }
  function parseArr() {
    adv();
    const els = [];
    while (cur().t !== 4 && cur().t !== 13) {
      els.push(parseExpr(0));
      if (cur().t === 7)
        adv();
    }
    eat(4);
    return {
      k: "Arr",
      els
    };
  }
  function parseObj() {
    adv();
    const entries = [];
    while (cur().t !== 6 && cur().t !== 13) {
      const kt = cur();
      const key = kt.t === 16 || kt.t === 14 || kt.t === 17 || kt.t === 15 ? (adv(), String(kt.v)) : kt.t === 18 ? (adv(), kt.v.replace(/^\$/, "")) : (adv(), "?");
      eat(8);
      entries.push([key, parseExpr(0)]);
      if (cur().t === 7)
        adv();
    }
    eat(6);
    return {
      k: "Obj",
      entries
    };
  }
  return parseExpr(0);
}
function tokenize(src) {
  const tokens = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    while (i < n && (src[i] === " " || src[i] === "\t" || src[i] === "\r"))
      i++;
    if (i >= n)
      break;
    const c = src[i];
    if (c === `
`) {
      tokens.push({ t: 0 });
      i++;
      continue;
    }
    if (c === "(") {
      tokens.push({ t: 1 });
      i++;
      continue;
    }
    if (c === ")") {
      tokens.push({ t: 2 });
      i++;
      continue;
    }
    if (c === "[") {
      tokens.push({ t: 3 });
      i++;
      continue;
    }
    if (c === "]") {
      tokens.push({ t: 4 });
      i++;
      continue;
    }
    if (c === "{") {
      tokens.push({ t: 5 });
      i++;
      continue;
    }
    if (c === "}") {
      tokens.push({ t: 6 });
      i++;
      continue;
    }
    if (c === ",") {
      tokens.push({ t: 7 });
      i++;
      continue;
    }
    if (c === ":") {
      tokens.push({ t: 8 });
      i++;
      continue;
    }
    if (c === "=") {
      if (i + 1 < n && src[i + 1] === "=") {
        tokens.push({ t: 25 });
        i += 2;
      } else {
        tokens.push({ t: 9 });
        i++;
      }
      continue;
    }
    if (c === "!") {
      if (i + 1 < n && src[i + 1] === "=") {
        tokens.push({ t: 26 });
        i += 2;
      } else {
        tokens.push({ t: 33 });
        i++;
      }
      continue;
    }
    if (c === ">") {
      if (i + 1 < n && src[i + 1] === "=") {
        tokens.push({ t: 29 });
        i += 2;
      } else {
        tokens.push({ t: 27 });
        i++;
      }
      continue;
    }
    if (c === "<") {
      if (i + 1 < n && src[i + 1] === "=") {
        tokens.push({ t: 30 });
        i += 2;
      } else {
        tokens.push({ t: 28 });
        i++;
      }
      continue;
    }
    if (c === "&") {
      if (i + 1 < n && src[i + 1] === "&") {
        tokens.push({ t: 31 });
        i += 2;
      } else {
        tokens.push({ t: 31 });
        i++;
      }
      continue;
    }
    if (c === "|") {
      if (i + 1 < n && src[i + 1] === "|") {
        tokens.push({ t: 32 });
        i += 2;
      } else {
        tokens.push({ t: 32 });
        i++;
      }
      continue;
    }
    if (c === ".") {
      tokens.push({ t: 19 });
      i++;
      continue;
    }
    if (c === "?") {
      tokens.push({ t: 34 });
      i++;
      continue;
    }
    if (c === "+") {
      tokens.push({ t: 20 });
      i++;
      continue;
    }
    if (c === "*") {
      tokens.push({ t: 22 });
      i++;
      continue;
    }
    if (c === "/") {
      tokens.push({ t: 23 });
      i++;
      continue;
    }
    if (c === "%") {
      tokens.push({ t: 24 });
      i++;
      continue;
    }
    if (c === '"') {
      const start = i;
      i++;
      let isClosed = false;
      while (i < n)
        if (src[i] === "\\")
          i += 2;
        else if (src[i] === '"') {
          i++;
          isClosed = true;
          break;
        } else
          i++;
      const rawString = src.slice(start, i);
      try {
        const validJsonString = isClosed ? rawString : rawString + '"';
        tokens.push({
          t: 14,
          v: JSON.parse(validJsonString)
        });
      } catch {
        const stripped = rawString.replace(/^"|"$/g, "");
        tokens.push({
          t: 14,
          v: stripped
        });
      }
      continue;
    }
    if (c === "'") {
      i++;
      let result = "";
      while (i < n)
        if (src[i] === "\\") {
          i++;
          if (i < n) {
            const esc2 = src[i];
            if (esc2 === "'")
              result += "'";
            else if (esc2 === "\\")
              result += "\\";
            else if (esc2 === "n")
              result += `
`;
            else if (esc2 === "t")
              result += "\t";
            else
              result += esc2;
            i++;
          }
        } else if (src[i] === "'") {
          i++;
          break;
        } else {
          result += src[i];
          i++;
        }
      tokens.push({
        t: 14,
        v: result
      });
      continue;
    }
    if (c === "-") {
      const prev = tokens.length > 0 ? tokens[tokens.length - 1] : null;
      if (!(prev != null && (prev.t === 15 || prev.t === 14 || prev.t === 16 || prev.t === 17 || prev.t === 2 || prev.t === 4 || prev.t === 10 || prev.t === 11 || prev.t === 12 || prev.t === 18 || prev.t === 35)) && i + 1 < n && src[i + 1] >= "0" && src[i + 1] <= "9") {} else {
        tokens.push({ t: 21 });
        i++;
        continue;
      }
    }
    const isDigit = c >= "0" && c <= "9";
    const isNegDigit = c === "-" && i + 1 < n && src[i + 1] >= "0" && src[i + 1] <= "9";
    if (isDigit || isNegDigit) {
      const start = i;
      if (src[i] === "-")
        i++;
      while (i < n && src[i] >= "0" && src[i] <= "9")
        i++;
      if (i < n && src[i] === "." && i + 1 < n && src[i + 1] >= "0" && src[i + 1] <= "9") {
        i++;
        while (i < n && src[i] >= "0" && src[i] <= "9")
          i++;
      }
      if (i < n && (src[i] === "e" || src[i] === "E")) {
        i++;
        if (i < n && (src[i] === "+" || src[i] === "-"))
          i++;
        while (i < n && src[i] >= "0" && src[i] <= "9")
          i++;
      }
      tokens.push({
        t: 15,
        v: +src.slice(start, i)
      });
      continue;
    }
    if (c === "$" && i + 1 < n && (src[i + 1] >= "a" && src[i + 1] <= "z" || src[i + 1] >= "A" && src[i + 1] <= "Z" || src[i + 1] === "_")) {
      const start = i;
      i++;
      while (i < n && (src[i] >= "a" && src[i] <= "z" || src[i] >= "A" && src[i] <= "Z" || src[i] >= "0" && src[i] <= "9" || src[i] === "_"))
        i++;
      tokens.push({
        t: 18,
        v: src.slice(start, i)
      });
      continue;
    }
    if (c >= "a" && c <= "z" || c >= "A" && c <= "Z" || c === "_") {
      const start = i;
      while (i < n && (src[i] >= "a" && src[i] <= "z" || src[i] >= "A" && src[i] <= "Z" || src[i] >= "0" && src[i] <= "9" || src[i] === "_"))
        i++;
      const word = src.slice(start, i);
      if (word === "true") {
        tokens.push({ t: 10 });
        continue;
      }
      if (word === "false") {
        tokens.push({ t: 11 });
        continue;
      }
      if (word === "null") {
        tokens.push({ t: 12 });
        continue;
      }
      const kind = c >= "A" && c <= "Z" ? 17 : 16;
      tokens.push({
        t: kind,
        v: word
      });
      continue;
    }
    if (c === "@" && i + 1 < n && (src[i + 1] >= "a" && src[i + 1] <= "z" || src[i + 1] >= "A" && src[i + 1] <= "Z" || src[i + 1] === "_")) {
      i++;
      const start = i;
      while (i < n && (src[i] >= "a" && src[i] <= "z" || src[i] >= "A" && src[i] <= "Z" || src[i] >= "0" && src[i] <= "9" || src[i] === "_"))
        i++;
      tokens.push({
        t: 35,
        v: src.slice(start, i)
      });
      continue;
    }
    i++;
  }
  tokens.push({ t: 13 });
  return tokens;
}
var SCALAR_TYPEOFS = [
  "string",
  "number",
  "boolean"
];
var NO_PROPS = {};
var NO_REQUIRED = [];
function jsType(value) {
  return Array.isArray(value) ? "array" : typeof value;
}
function refName(s) {
  return typeof s["$ref"] === "string" ? s["$ref"].split("/").pop() : undefined;
}
function isCompositeSchema(s) {
  return "$ref" in s || "anyOf" in s || "oneOf" in s || "allOf" in s;
}
function getScalarTypeInfo(s) {
  if (Array.isArray(s["enum"]))
    return { enumValues: s["enum"] };
  if ("const" in s)
    return { enumValues: [s["const"]] };
  switch (s["type"]) {
    case "string":
      return { expectedType: "string" };
    case "number":
    case "integer":
      return { expectedType: "number" };
    case "boolean":
      return { expectedType: "boolean" };
    default:
      return {};
  }
}
function getSchemaDefaultValue(property) {
  if (!property || typeof property !== "object" || Array.isArray(property))
    return;
  return property.default;
}
function getTypeFromSchema(property) {
  if (!property || typeof property !== "object" || Array.isArray(property))
    return;
  const p = property;
  const ref = refName(p);
  if (ref)
    return ref;
  const leaf = getScalarTypeInfo(p);
  if (leaf.enumValues)
    return leaf.enumValues.map((v) => JSON.stringify(v)).join("|");
  if (leaf.expectedType)
    return leaf.expectedType;
  return typeof p.type === "string" ? p.type : undefined;
}
function buildParamsSignature(component, params) {
  return `${component}(${params.map((p) => {
    const type = getTypeFromSchema(p.schema);
    const marked = p.required ? `${p.name}*` : p.name;
    return type ? `${marked}: ${type}` : marked;
  }).join(", ")})`;
}
function checkTypeMismatch(value, info) {
  const actual = typeof value;
  if (info.enumValues) {
    if (!SCALAR_TYPEOFS.includes(actual))
      return null;
    if (info.enumValues.includes(value))
      return null;
    return {
      expected: `one of [${info.enumValues.map((v) => JSON.stringify(v)).join(", ")}]`,
      actual: JSON.stringify(value)
    };
  }
  if (info.expectedType && info.expectedType !== actual)
    return {
      expected: info.expectedType,
      actual: jsType(value)
    };
  return null;
}
function validationMessage(component, path, issue2) {
  switch (issue2.code) {
    case "type-mismatch":
      return `field "${path}" expects ${issue2.expected} but got ${issue2.actual}`;
    case "missing-required":
      return `missing required field "${path}"${issue2.signature ? ` — signature: ${issue2.signature}` : ""}`;
    case "null-required":
      return `required field "${path}" cannot be null${issue2.signature ? ` — signature: ${issue2.signature}` : ""}`;
    case "unknown-component":
      return `Unknown component "${component}" — not found in catalog or builtins${issue2.available?.length ? `. Available components: ${issue2.available.join(", ")}` : ""}`;
    case "inline-reserved":
      return `${component}() must be declared as a top-level statement, not used inline as a value`;
    case "excess-args":
      return `${component} takes ${issue2.declared} arg(s), got ${issue2.got} (${issue2.got - issue2.declared} excess dropped)`;
    case "unknown-function":
      return `Unknown function "@${component}": not a built-in or action step. The call evaluates to null`;
    case "no-root":
      if (issue2.reason === "not-component")
        return "root does not evaluate to a component";
      if (issue2.reason === "fallback")
        return `No root statement. Rendering the first statement that calls the root component ${component}`;
      return component ? `No root statement, and no statement calls the root component ${component}` : "No root statement";
  }
}
function pushValidationIssue(ctx, component, path, issue2) {
  ctx.errors.push({
    code: issue2.code,
    component,
    path,
    message: validationMessage(component, path, issue2),
    statementId: ctx.currentStatementId,
    ...issue2.code === "no-root" && issue2.reason === "fallback" && { severity: "warning" }
  });
}
var INVALID = Symbol("invalid");
function resolveInvalidValue(required2, defaultValue) {
  if (defaultValue !== undefined)
    return defaultValue;
  return required2 ? INVALID : undefined;
}
function validateElementPosition(element, s, component, path, ctx) {
  if (isCompositeSchema(s))
    return false;
  if (typeof s["type"] === "string" || Array.isArray(s["enum"]) || "const" in s) {
    pushValidationIssue(ctx, component, path, {
      code: "type-mismatch",
      expected: typeof s["type"] === "string" ? s["type"] : "a literal value",
      actual: `component "${element.typeName}"`
    });
    return true;
  }
  return false;
}
function slotRefNames(s) {
  return (s["anyOf"] ?? s["oneOf"] ?? [s]).map(refName);
}
function isOnlyComponentSlot(s, ctx) {
  const names = slotRefNames(s);
  return names.length > 0 && names.every((n) => n !== undefined && ctx.cat?.has(n));
}
function validateObjectValue(value, s, component, path, ctx) {
  if (typeof value !== "object" || Array.isArray(value)) {
    pushValidationIssue(ctx, component, path, {
      code: "type-mismatch",
      expected: "object",
      actual: jsType(value)
    });
    return INVALID;
  }
  const obj = value;
  let out;
  const props = s["properties"] && typeof s["properties"] === "object" ? s["properties"] : NO_PROPS;
  const required2 = Array.isArray(s["required"]) ? s["required"] : NO_REQUIRED;
  let invalid = false;
  if (!ctx.partial)
    for (const key of required2) {
      const present = key in obj;
      if (!present || obj[key] == null) {
        const fallback = getSchemaDefaultValue(props[key]);
        if (fallback !== undefined) {
          (out ??= { ...obj })[key] = fallback;
          continue;
        }
        pushValidationIssue(ctx, component, `${path}/${key}`, { code: present ? "null-required" : "missing-required" });
        invalid = true;
      }
    }
  for (const key of Object.keys(props)) {
    if (!(key in obj))
      continue;
    const sub = props[key];
    let next = validateSchemaValue(obj[key], sub, component, `${path}/${key}`, ctx);
    if (next === INVALID) {
      next = resolveInvalidValue(required2.includes(key), getSchemaDefaultValue(sub));
      if (next === INVALID) {
        invalid = true;
        continue;
      }
    }
    if (next === obj[key])
      continue;
    out ??= { ...obj };
    if (next === undefined)
      delete out[key];
    else
      out[key] = next;
  }
  return invalid ? INVALID : out ?? obj;
}
function validateArrayValue(value, s, component, path, ctx) {
  if (!Array.isArray(value)) {
    pushValidationIssue(ctx, component, path, {
      code: "type-mismatch",
      expected: "array",
      actual: jsType(value)
    });
    return INVALID;
  }
  const items = s["items"];
  if (!items || typeof items !== "object" || Array.isArray(items))
    return value;
  let out;
  for (let i = 0;i < value.length; i++) {
    const next = validateSchemaValue(value[i], items, component, `${path}/${i}`, ctx);
    if (next !== value[i] && !out)
      out = value.slice(0, i);
    if (out && next !== INVALID)
      out.push(next);
  }
  return out ?? value;
}
function validateLeafValue(value, s, component, path, ctx) {
  const leaf = getScalarTypeInfo(s);
  if (leaf.expectedType == null && leaf.enumValues == null)
    return false;
  if (leaf.enumValues && ctx.partial)
    return false;
  const mismatch = checkTypeMismatch(value, leaf);
  if (mismatch) {
    pushValidationIssue(ctx, component, path, {
      code: "type-mismatch",
      ...mismatch
    });
    return true;
  }
  return false;
}
function validateSchemaValue(value, schema, component, path, ctx) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema))
    return value;
  const s = schema;
  if (value == null)
    return value;
  if (isASTNode(value))
    return value;
  if (isElementNode(value))
    return validateElementPosition(value, s, component, path, ctx) ? INVALID : value;
  if (isCompositeSchema(s)) {
    if (!isOnlyComponentSlot(s, ctx))
      return value;
    pushValidationIssue(ctx, component, path, {
      code: "type-mismatch",
      expected: slotRefNames(s).join(" | "),
      actual: Array.isArray(value) ? "array" : typeof value === "object" ? "plain object" : typeof value
    });
    return INVALID;
  }
  const type = s["type"];
  if (type === "object")
    return validateObjectValue(value, s, component, path, ctx);
  if (type === "array")
    return validateArrayValue(value, s, component, path, ctx);
  return validateLeafValue(value, s, component, path, ctx) ? INVALID : value;
}
function containsDynamicValue(v) {
  if (v == null || typeof v !== "object")
    return false;
  if (isASTNode(v))
    return true;
  if (Array.isArray(v))
    return v.some(containsDynamicValue);
  if (isElementNode(v))
    return Object.values(v.props).some(containsDynamicValue);
  const obj = v;
  if (Array.isArray(obj.steps))
    return true;
  return Object.values(obj).some(containsDynamicValue);
}
function resolveRef(name, ctx, mode) {
  if (ctx.visited.has(name)) {
    ctx.unres.push(name);
    return mode === "expr" ? {
      k: "Ph",
      n: name
    } : null;
  }
  if (!ctx.syms.has(name)) {
    ctx.unres.push(name);
    return mode === "expr" ? {
      k: "Ph",
      n: name
    } : null;
  }
  const target = ctx.syms.get(name);
  ctx.unreached?.delete(name);
  if (target.k === "Comp" && isReservedCall(target.name))
    return {
      k: "RuntimeRef",
      n: name,
      refType: target.name === RESERVED_CALLS.Mutation ? "mutation" : "query"
    };
  ctx.visited.add(name);
  const prevStatementId = ctx.currentStatementId;
  ctx.currentStatementId = name;
  try {
    const result = mode === "value" ? materializeValue(target, ctx) : materializeExpr(target, ctx);
    if (mode === "value" && isElementNode(result))
      result.statementId = name;
    return result;
  } finally {
    ctx.currentStatementId = prevStatementId;
    ctx.visited.delete(name);
  }
}
function isRuntimeCall(name, ctx) {
  return getCallDefs(ctx.cat).has(name) || isReservedCall(name);
}
function nameArgs(args, params) {
  const named2 = {};
  for (let i = 0;i < params.length && i < args.length; i++)
    named2[params[i].name] = args[i];
  return named2;
}
function mapCallArgs(name, args, def, ctx) {
  const { params } = def;
  if (args.length > params.length)
    pushValidationIssue(ctx, name, "", {
      code: "excess-args",
      declared: params.length,
      got: args.length
    });
  const mapped = nameArgs(args, params);
  let invalid = false;
  const errorsBefore = ctx.errors.length;
  for (const p of params) {
    const arg = mapped[p.name];
    const lit = arg ? literalValue(arg) : { v: undefined };
    if (!lit)
      continue;
    if (lit.v == null) {
      if (!p.required || p.defaultValue !== undefined)
        continue;
      pushValidationIssue(ctx, name, `/${p.name}`, {
        code: arg ? "null-required" : "missing-required",
        signature: buildParamsSignature(name, params)
      });
      invalid = true;
      continue;
    }
    let next = validateSchemaValue(lit.v, p.schema, name, `/${p.name}`, ctx);
    if (next === INVALID)
      next = resolveInvalidValue(p.required, p.defaultValue);
    if (next === INVALID)
      invalid = true;
    else if (next === undefined)
      delete mapped[p.name];
    else if (next !== lit.v)
      mapped[p.name] = toLiteralAST(next);
  }
  if (def.kind === "action" && ctx.errors.length > errorsBefore)
    invalid = true;
  return invalid ? null : mapped;
}
function materializeCall(node, ctx, materializeArg) {
  const args = node.args.map(materializeArg);
  const def = getCallDefs(ctx.cat).get(node.name);
  if (!def || def.lazy)
    return {
      ...node,
      args
    };
  const mappedProps = def.builtin ? nameArgs(args, def.params) : mapCallArgs(node.name, args, def, ctx);
  if (mappedProps)
    return {
      ...node,
      args,
      mappedProps
    };
  return def.kind === "action" ? {
    k: "Comp",
    name: "Action",
    args: [{
      k: "Arr",
      els: []
    }]
  } : { k: "Null" };
}
function nameRawCallArgs(args, ctx, statementId) {
  const prevStatementId = ctx.currentStatementId;
  ctx.currentStatementId = statementId;
  const seen = /* @__PURE__ */ new Set;
  for (const arg of args)
    walkAST(arg, (node) => {
      if (node.k !== "Comp" || seen.has(node))
        return;
      seen.add(node);
      const def = getCallDefs(ctx.cat).get(node.name);
      if (!def || def.lazy)
        return;
      node.mappedProps = (def.builtin ? null : mapCallArgs(node.name, node.args, def, ctx)) ?? nameArgs(node.args, def.params);
    });
  ctx.currentStatementId = prevStatementId;
}
function materializeLazyBuiltin(node, ctx, scopedRefs) {
  const def = getCallDefs(ctx.cat).get(node.name);
  if (def?.kind !== "function" || !def.lazy || node.args.length < 3)
    return null;
  const varArg = node.args[1];
  const varName = varArg.k === "Ref" ? varArg.n : varArg.k === "Str" ? varArg.v : null;
  if (!varName)
    return null;
  const nextScopedRefs = new Set(scopedRefs);
  nextScopedRefs.add(varName);
  const recursedArgs = node.args.map((a, i) => i === 1 ? a : materializeExprInternal(a, ctx, nextScopedRefs));
  return {
    ...node,
    args: recursedArgs
  };
}
function materializeExprInternal(node, ctx, scopedRefs) {
  switch (node.k) {
    case "Ref":
      return scopedRefs.has(node.n) ? node : resolveRef(node.n, ctx, "expr");
    case "Ph":
      return node;
    case "Comp": {
      if (node.fn && !isRuntimeCall(node.name, ctx)) {
        pushValidationIssue(ctx, node.name, "", { code: "unknown-function" });
        return { k: "Null" };
      }
      const lazy2 = materializeLazyBuiltin(node, ctx, scopedRefs);
      if (lazy2)
        return lazy2;
      if (isRuntimeCall(node.name, ctx))
        return materializeCall(node, ctx, (a) => materializeExprInternal(a, ctx, scopedRefs));
      const recursedArgs = node.args.map((a) => materializeExprInternal(a, ctx, scopedRefs));
      const def = ctx.cat?.get(node.name);
      if (def) {
        const mappedProps = {};
        for (let i = 0;i < def.params.length && i < recursedArgs.length; i++)
          mappedProps[def.params[i].name] = recursedArgs[i];
        return {
          ...node,
          args: recursedArgs,
          mappedProps
        };
      }
      pushValidationIssue(ctx, node.name, "", {
        code: "unknown-component",
        available: ctx.cat && [...ctx.cat.keys()]
      });
      return {
        ...node,
        args: recursedArgs
      };
    }
    case "Arr":
      return {
        ...node,
        els: node.els.map((e) => materializeExprInternal(e, ctx, scopedRefs))
      };
    case "Obj":
      return {
        ...node,
        entries: node.entries.map(([k, v]) => [k, materializeExprInternal(v, ctx, scopedRefs)])
      };
    case "BinOp":
      return {
        ...node,
        left: materializeExprInternal(node.left, ctx, scopedRefs),
        right: materializeExprInternal(node.right, ctx, scopedRefs)
      };
    case "UnaryOp":
      return {
        ...node,
        operand: materializeExprInternal(node.operand, ctx, scopedRefs)
      };
    case "Ternary":
      return {
        ...node,
        cond: materializeExprInternal(node.cond, ctx, scopedRefs),
        then: materializeExprInternal(node.then, ctx, scopedRefs),
        else: materializeExprInternal(node.else, ctx, scopedRefs)
      };
    case "Member":
      return {
        ...node,
        obj: materializeExprInternal(node.obj, ctx, scopedRefs)
      };
    case "Index":
      return {
        ...node,
        obj: materializeExprInternal(node.obj, ctx, scopedRefs),
        index: materializeExprInternal(node.index, ctx, scopedRefs)
      };
    case "Assign":
      return {
        ...node,
        value: materializeExprInternal(node.value, ctx, scopedRefs)
      };
    default:
      return node;
  }
}
function materializeExpr(node, ctx) {
  return materializeExprInternal(node, ctx, /* @__PURE__ */ new Set);
}
function materializeValue(node, ctx) {
  switch (node.k) {
    case "Ref":
      return resolveRef(node.n, ctx, "value");
    case "Str":
      return node.v;
    case "Num":
      return node.v;
    case "Bool":
      return node.v;
    case "Null":
      return null;
    case "Ph":
      return null;
    case "Arr": {
      const items = [];
      for (const e of node.els) {
        if (e.k === "Ph")
          continue;
        const value = materializeValue(e, ctx);
        if (value === null && (e.k === "Comp" || e.k === "Ref"))
          continue;
        items.push(value);
      }
      return items;
    }
    case "Obj": {
      const o = {};
      for (const [k, v] of node.entries)
        o[k] = materializeValue(v, ctx);
      return o;
    }
    case "Comp": {
      const { name, args } = node;
      if (node.fn && !isRuntimeCall(name, ctx)) {
        pushValidationIssue(ctx, name, "", { code: "unknown-function" });
        return null;
      }
      if (isReservedCall(name)) {
        pushValidationIssue(ctx, name, "", { code: "inline-reserved" });
        return null;
      }
      if (isRuntimeCall(name, ctx)) {
        const lazy2 = materializeLazyBuiltin(node, ctx, /* @__PURE__ */ new Set);
        if (lazy2)
          return lazy2;
        return materializeCall(node, ctx, (a) => materializeExpr(a, ctx));
      }
      const def = ctx.cat?.get(name);
      const props = {};
      if (def) {
        let dropComponent = false;
        for (let i = 0;i < def.params.length && i < args.length; i++) {
          const param = def.params[i];
          const value = materializeValue(args[i], ctx);
          props[param.name] = value;
          if (param.schema === undefined)
            continue;
          let next = validateSchemaValue(value, param.schema, name, `/${param.name}`, ctx);
          if (next === INVALID) {
            next = resolveInvalidValue(param.required, param.defaultValue);
            if (next === INVALID)
              dropComponent = true;
            else if (next === undefined)
              delete props[param.name];
          }
          if (next !== INVALID && next !== undefined)
            props[param.name] = next;
        }
        if (args.length > def.params.length)
          pushValidationIssue(ctx, name, "", {
            code: "excess-args",
            declared: def.params.length,
            got: args.length
          });
        const missingRequired = def.params.filter((p) => p.required && (!(p.name in props) || props[p.name] === null));
        if (missingRequired.length) {
          const stillInvalid = missingRequired.filter((p) => {
            if (p.defaultValue !== undefined) {
              props[p.name] = p.defaultValue;
              return false;
            }
            return true;
          });
          if (stillInvalid.length) {
            for (const p of stillInvalid)
              pushValidationIssue(ctx, name, `/${p.name}`, {
                code: p.name in props ? "null-required" : "missing-required",
                signature: buildParamsSignature(name, def.params)
              });
            return null;
          }
        }
        if (dropComponent)
          return null;
      } else {
        pushValidationIssue(ctx, name, "", {
          code: "unknown-component",
          available: ctx.cat && [...ctx.cat.keys()]
        });
        return null;
      }
      const hasDynamicProps = Object.values(props).some((v) => containsDynamicValue(v));
      return {
        type: "element",
        typeName: name,
        props,
        partial: ctx.partial,
        hasDynamicProps
      };
    }
    default:
      if (isRuntimeExpr(node))
        return materializeExpr(node, ctx);
      return node;
  }
}
function autoClose(input) {
  const stack = [];
  let inStr = false;
  let esc2 = false;
  for (let i = 0;i < input.length; i++) {
    const c = input[i];
    if (esc2) {
      esc2 = false;
      continue;
    }
    if (c === "\\" && inStr) {
      esc2 = true;
      continue;
    }
    if (inStr) {
      if (c === inStr)
        inStr = false;
      continue;
    }
    if (c === '"' || c === "'") {
      inStr = c;
      continue;
    }
    if (c === "(" || c === "[" || c === "{")
      stack.push(c);
    else if (c === ")" && stack[stack.length - 1] === "(")
      stack.pop();
    else if (c === "]" && stack[stack.length - 1] === "[")
      stack.pop();
    else if (c === "}" && stack[stack.length - 1] === "{")
      stack.pop();
  }
  if (!(!!inStr || stack.length > 0))
    return {
      text: input,
      wasIncomplete: false
    };
  let out = input;
  if (inStr) {
    if (esc2)
      out += "\\";
    out += inStr;
  }
  for (let j = stack.length - 1;j >= 0; j--)
    out += stack[j] === "(" ? ")" : stack[j] === "[" ? "]" : "}";
  return {
    text: out,
    wasIncomplete: true
  };
}
function split(tokens) {
  const stmts = [];
  let pos = 0;
  while (pos < tokens.length) {
    while (pos < tokens.length && tokens[pos].t === 0)
      pos++;
    if (pos >= tokens.length || tokens[pos].t === 13)
      break;
    const tok = tokens[pos];
    if (tok.t !== 16 && tok.t !== 17 && tok.t !== 18) {
      while (pos < tokens.length && tokens[pos].t !== 0 && tokens[pos].t !== 13)
        pos++;
      continue;
    }
    const id = tok.v;
    const idTokenType = tok.t;
    pos++;
    if (pos >= tokens.length || tokens[pos].t !== 9) {
      while (pos < tokens.length && tokens[pos].t !== 0 && tokens[pos].t !== 13)
        pos++;
      continue;
    }
    pos++;
    const expr = [];
    let depth = 0;
    let ternaryDepth = 0;
    while (pos < tokens.length && tokens[pos].t !== 13) {
      const tt = tokens[pos].t;
      if (tt === 0 && depth <= 0 && ternaryDepth <= 0) {
        let peek = pos + 1;
        while (peek < tokens.length && tokens[peek].t === 0)
          peek++;
        const nextT = peek < tokens.length ? tokens[peek].t : 13;
        if (nextT === 34 || nextT === 8 && ternaryDepth > 0) {
          pos++;
          continue;
        }
        break;
      }
      if (tt === 0) {
        pos++;
        continue;
      }
      if (tt === 1 || tt === 3 || tt === 5)
        depth++;
      else if ((tt === 2 || tt === 4 || tt === 6) && depth > 0)
        depth--;
      else if (tt === 34 && depth === 0)
        ternaryDepth++;
      else if (tt === 8 && depth === 0 && ternaryDepth > 0)
        ternaryDepth--;
      expr.push(tokens[pos++]);
    }
    if (expr.length)
      stmts.push({
        id,
        idTokenType,
        tokens: expr
      });
  }
  return stmts;
}
function emptyResult(incomplete = true) {
  return {
    root: null,
    meta: {
      incomplete,
      unresolved: [],
      orphaned: [],
      statementCount: 0,
      errors: []
    },
    stateDeclarations: {},
    queryStatements: [],
    mutationStatements: []
  };
}
function collectQueryDeps(node) {
  if (!isASTNode(node))
    return [];
  const refs = /* @__PURE__ */ new Set;
  walkAST(node, (current) => {
    if (current.k === "StateRef")
      refs.add(current.n);
  });
  return [...refs];
}
function classifyStatement(raw, expr) {
  if (expr.k === "Comp" && expr.name === RESERVED_CALLS.Query) {
    const deps = collectQueryDeps(expr.args[1]);
    return {
      kind: "query",
      id: raw.id,
      call: {
        callee: RESERVED_CALLS.Query,
        args: expr.args
      },
      expr,
      deps: deps.length > 0 ? deps : undefined
    };
  }
  if (expr.k === "Comp" && expr.name === RESERVED_CALLS.Mutation)
    return {
      kind: "mutation",
      id: raw.id,
      call: {
        callee: RESERVED_CALLS.Mutation,
        args: expr.args
      },
      expr
    };
  if (raw.idTokenType === 18)
    return {
      kind: "state",
      id: raw.id,
      init: expr
    };
  return {
    kind: "value",
    id: raw.id,
    expr
  };
}
function extractStatements(stmts, ctx, partialRef) {
  const stateDeclarations = {};
  const queryStatements = [];
  const mutationStatements = [];
  for (const stmt of stmts)
    switch (stmt.kind) {
      case "state":
        stateDeclarations[stmt.id] = materializeValue(stmt.init, ctx);
        break;
      case "query":
        nameRawCallArgs(stmt.call.args, ctx, stmt.id);
        queryStatements.push({
          statementId: stmt.id,
          toolAST: stmt.call.args[0] ?? null,
          argsAST: stmt.call.args[1] ?? null,
          defaultsAST: stmt.call.args[2] ?? null,
          refreshAST: stmt.call.args[3] ?? null,
          deps: stmt.deps,
          complete: true
        });
        break;
      case "mutation":
        nameRawCallArgs(stmt.call.args, ctx, stmt.id);
        mutationStatements.push({
          statementId: stmt.id,
          toolAST: stmt.call.args[0] ?? null,
          argsAST: stmt.call.args[1] ?? null
        });
        break;
    }
  for (const stmt of stmts) {
    const nodes = stmt.kind === "state" ? [stmt.init] : stmt.kind === "value" ? [stmt.expr] : stmt.kind === "query" || stmt.kind === "mutation" ? stmt.call.args : [];
    for (const node of nodes)
      for (const dep of collectQueryDeps(node)) {
        if (dep === partialRef?.name && partialRef.stmts.has(stmt))
          continue;
        if (!(dep in stateDeclarations))
          stateDeclarations[dep] = null;
      }
  }
  return {
    stateDeclarations,
    queryStatements,
    mutationStatements
  };
}
var DEFAULT_ROOT_STATEMENT_ID = "root";
function isComponentCall(node) {
  return node?.k === "Comp" && !node.fn && !isBuiltin(node.name) && !isReservedCall(node.name);
}
function pickEntry(stmtMap, rootName) {
  if (stmtMap.has(DEFAULT_ROOT_STATEMENT_ID))
    return {
      id: DEFAULT_ROOT_STATEMENT_ID,
      fallback: false
    };
  for (const stmt of stmtMap.values())
    if (stmt.kind === "value" && isComponentCall(stmt.expr) && stmt.expr.name === rootName)
      return {
        id: stmt.id,
        fallback: true
      };
  return null;
}
function resolvesToComponentCall(node, syms) {
  const seen = /* @__PURE__ */ new Set;
  while (node?.k === "Ref" && !seen.has(node.n)) {
    seen.add(node.n);
    node = syms.get(node.n);
  }
  return isComponentCall(node);
}
function containsComponent(node) {
  let found = false;
  walkAST(node, (current) => {
    if (isComponentCall(current))
      found = true;
  });
  return found;
}
function buildResult(stmtMap, typedStmts, wasIncomplete, stmtCount, cat, rootName, partialRef) {
  const entry = pickEntry(stmtMap, rootName);
  const syms = /* @__PURE__ */ new Map;
  for (const [id, stmt] of stmtMap)
    syms.set(id, stmt.kind === "state" ? stmt.init : stmt.expr);
  const unres = [];
  const errors3 = [];
  const unreached = /* @__PURE__ */ new Set;
  for (const [id, stmt] of stmtMap) {
    if (id === entry?.id)
      continue;
    if (stmt.kind === "state" || stmt.kind === "query" || stmt.kind === "mutation")
      continue;
    unreached.add(id);
  }
  const ctx = {
    syms,
    cat,
    errors: errors3,
    unres,
    visited: /* @__PURE__ */ new Set,
    partial: wasIncomplete,
    currentStatementId: entry?.id,
    unreached
  };
  let root = null;
  let rootExpression;
  if (entry) {
    const materialized = materializeValue(syms.get(entry.id), ctx);
    if (isElementNode(materialized)) {
      root = materialized;
      root.statementId = entry.id;
    } else if (isASTNode(materialized) && containsComponent(materialized))
      rootExpression = materialized;
  }
  const { stateDeclarations, queryStatements, mutationStatements } = extractStatements(typedStmts, ctx, partialRef);
  ctx.currentStatementId = entry?.id;
  const component = rootName ?? "";
  if (!entry)
    pushValidationIssue(ctx, component, "", {
      code: "no-root",
      reason: "missing"
    });
  else if (!root && !rootExpression && !resolvesToComponentCall(syms.get(entry.id), syms))
    pushValidationIssue(ctx, component, "", {
      code: "no-root",
      reason: "not-component"
    });
  else if (entry.fallback)
    pushValidationIssue(ctx, component, "", {
      code: "no-root",
      reason: root ? "fallback" : "missing"
    });
  const orphaned = entry ? [...unreached] : [];
  return {
    root,
    ...rootExpression ? { rootExpression } : {},
    meta: {
      incomplete: wasIncomplete,
      unresolved: unres,
      orphaned,
      statementCount: stmtCount,
      errors: errors3
    },
    stateDeclarations,
    queryStatements,
    mutationStatements
  };
}
function skipString(input, start) {
  if (input[start] !== '"')
    return start;
  let i = start + 1;
  while (i < input.length) {
    const c = input[i];
    if (c === "\\")
      i += 2;
    else if (c === '"')
      return i + 1;
    else
      i++;
  }
  return i;
}
function stripFences(input) {
  const blocks = [];
  let i = 0;
  while (i < input.length) {
    let fenceStart = -1;
    while (i < input.length) {
      const nextI = skipString(input, i);
      if (nextI > i) {
        i = nextI;
        continue;
      }
      if (input[i] === "`" && i + 1 < input.length && input[i + 1] === "`" && i + 2 < input.length && input[i + 2] === "`") {
        fenceStart = i;
        break;
      }
      i++;
    }
    if (fenceStart === -1)
      break;
    let j = fenceStart + 3;
    while (j < input.length && input[j] !== `
`)
      j++;
    if (j >= input.length) {
      blocks.push(input.slice(fenceStart + 3).replace(/^[^\n]*\n?/, ""));
      i = input.length;
      break;
    }
    j++;
    let closePos = -1;
    let k = j;
    while (k < input.length) {
      const nextK = skipString(input, k);
      if (nextK > k) {
        k = nextK;
        continue;
      }
      if (input[k] === "`" && k + 1 < input.length && input[k + 1] === "`" && k + 2 < input.length && input[k + 2] === "`") {
        closePos = k;
        break;
      }
      k++;
    }
    if (closePos !== -1) {
      blocks.push(input.slice(j, closePos));
      i = closePos + 3;
    } else {
      blocks.push(input.slice(j));
      i = input.length;
    }
  }
  if (blocks.length > 0)
    return blocks.join(`
`);
  if (input.startsWith("```")) {
    let j = 3;
    while (j < input.length && input[j] !== `
`)
      j++;
    const start = j < input.length ? j + 1 : 3;
    const body = input.slice(start);
    const trailingFence = body.lastIndexOf("```");
    if (trailingFence !== -1)
      return body.slice(0, trailingFence);
    return body;
  }
  return input;
}
function stripComments(input) {
  let inStr = false;
  return input.split(`
`).map((line) => {
    for (let i = 0;i < line.length; i++) {
      const c = line[i];
      if (inStr) {
        if (c === "\\" && i + 1 < line.length) {
          i++;
          continue;
        }
        if (c === inStr)
          inStr = false;
        continue;
      }
      if (c === '"' || c === "'") {
        inStr = c;
        continue;
      }
      if (c === "/" && line[i + 1] === "/")
        return line.substring(0, i).trimEnd();
      if (c === "#")
        return line.substring(0, i).trimEnd();
    }
    return line;
  }).join(`
`);
}
function preprocess2(input) {
  return stripComments(stripFences(input.trim())).trim();
}
function parse5(input, cat, rootName) {
  const trimmed = preprocess2(input);
  if (!trimmed)
    return emptyResult();
  const { text, wasIncomplete } = autoClose(trimmed);
  const stmts = split(tokenize(text));
  if (!stmts.length)
    return emptyResult(wasIncomplete);
  const stmtMap = /* @__PURE__ */ new Map;
  for (const s of stmts) {
    const stmt = classifyStatement(s, parseExpression(s.tokens));
    stmtMap.set(s.id, stmt);
  }
  return buildResult(stmtMap, [...stmtMap.values()], wasIncomplete, stmtMap.size, cat, rootName);
}
function inlineActionRefs(node, defs) {
  if (!node || typeof node !== "object")
    return node;
  const ref = node.$ref;
  if (typeof ref === "string")
    return defs.has(ref) ? inlineActionRefs(defs.get(ref), defs) : node;
  const copy = Array.isArray(node) ? [...node] : { ...node };
  let changed = false;
  for (const [key, value] of Object.entries(copy)) {
    copy[key] = inlineActionRefs(value, defs);
    changed ||= copy[key] !== value;
  }
  return changed ? copy : node;
}
function compileParams(def, defs) {
  const properties = def.properties ?? {};
  const required2 = def.required ?? [];
  return Object.keys(properties).map((key) => ({
    name: key,
    required: required2.includes(key),
    defaultValue: getSchemaDefaultValue(properties[key]),
    schema: defs.size ? inlineActionRefs(properties[key], defs) : properties[key]
  }));
}
function compileSchema(schema) {
  const map2 = /* @__PURE__ */ new Map;
  const components = schema.properties && new Set(Object.keys(schema.properties));
  const defs = /* @__PURE__ */ new Map;
  for (const name of [...Object.keys(ACTION_DEFS), ...Object.keys(schema.actions ?? {})]) {
    const body = schema.$defs?.[name];
    if (body && !components?.has(name))
      defs.set(`#/$defs/${name}`, body);
  }
  for (const [name, def] of Object.entries(schema.$defs ?? {})) {
    if (components ? !components.has(name) : defs.has(`#/$defs/${name}`))
      continue;
    map2.set(name, { params: compileParams(def, defs) });
  }
  map2.callDefs = new Map(BUILTIN_CALLS);
  for (const [name, fn] of Object.entries(schema.functions ?? {}))
    map2.callDefs.set(name, {
      kind: "function",
      params: compileParams(fn.params, defs)
    });
  for (const [name, action] of Object.entries(schema.actions ?? {}))
    map2.callDefs.set(name, {
      kind: "action",
      params: compileParams(action.params, defs)
    });
  return map2;
}
function createParser(schema, rootName) {
  const paramMap = compileSchema(schema);
  return { parse(input) {
    const telemetry = prepareParserParseTelemetry();
    try {
      const result = parse5(input, paramMap, rootName);
      captureParserParseResult(telemetry, result);
      return result;
    } catch (error46) {
      captureParserParseException(telemetry);
      throw error46;
    }
  } };
}
function isReactiveAssign(value) {
  return typeof value === "object" && value !== null && value.__reactive === "assign";
}
function evaluate(node, context, schemaCtx) {
  switch (node.k) {
    case "Str":
      return node.v;
    case "Num":
      return node.v;
    case "Bool":
      return node.v;
    case "Null":
      return null;
    case "Ph":
      return null;
    case "StateRef":
      return context.extraScope?.[node.n] ?? context.getState(node.n);
    case "Ref":
    case "RuntimeRef":
      return context.resolveRef(node.n);
    case "Arr":
      return node.els.map((el) => evaluate(el, context));
    case "Obj":
      return Object.fromEntries(node.entries.map(([k, v]) => [k, evaluate(v, context)]));
    case "Comp": {
      const builtin = BUILTINS[node.name];
      if (builtin) {
        if (builtin.lazy)
          return evaluateLazyBuiltin(node.name, node.args, context, schemaCtx);
        return builtin.fn(evaluateArgs(node, context));
      }
      if (isStep(node.name))
        return evaluateActionCall(node, context);
      const fns = context.functions;
      if (fns && Object.prototype.hasOwnProperty.call(fns, node.name))
        return callFunction(node.name, fns[node.name], node, context);
      const acts = context.actions;
      if (acts && Object.prototype.hasOwnProperty.call(acts, node.name)) {
        const def = acts[node.name];
        const args = callArgs(node, context, def.params);
        if (missesRequired(args, def.params))
          return { steps: [] };
        const params = checkValue(args, def.params, node.name, "", context, true);
        if (params === INVALID)
          return { steps: [] };
        const step = {
          type: "custom_action",
          name: node.name,
          params
        };
        customSteps.add(step);
        return { steps: [step] };
      }
      if (node.mappedProps) {
        const def = schemaCtx?.library.components[node.name];
        const props = {};
        for (const [key, val] of Object.entries(node.mappedProps)) {
          const propSchema = def?.props?.shape?.[key];
          if (val.k === "StateRef" && propSchema && isReactiveSchema(propSchema))
            props[key] = {
              __reactive: "assign",
              target: val.n,
              expr: {
                k: "StateRef",
                n: "$value"
              }
            };
          else if (val.k === "StateRef")
            props[key] = schemaCtx ? context.getState(val.n) : val;
          else
            props[key] = evaluate(val, context, schemaCtx);
        }
        const result = {
          type: "element",
          typeName: node.name,
          props,
          partial: false,
          hasDynamicProps: true
        };
        if (schemaCtx) {
          for (const [key, val] of Object.entries(props))
            if (isElementNode(val))
              props[key] = evaluateElementInline(val, context, schemaCtx);
            else if (Array.isArray(val))
              props[key] = val.map((item) => isElementNode(item) ? evaluateElementInline(item, context, schemaCtx) : item);
        }
        return result;
      }
      console.warn(`[openui] Unexpected unmapped Comp node: ${node.name}`);
      return null;
    }
    case "BinOp": {
      if (node.op === "&&") {
        const left2 = evaluate(node.left, context);
        return left2 ? evaluate(node.right, context) : left2;
      }
      if (node.op === "||") {
        const left2 = evaluate(node.left, context);
        return left2 ? left2 : evaluate(node.right, context);
      }
      const left = evaluate(node.left, context);
      const right = evaluate(node.right, context);
      switch (node.op) {
        case "+":
          if (typeof left === "string" || typeof right === "string")
            return String(left ?? "") + String(right ?? "");
          return toNumber(left) + toNumber(right);
        case "-":
          return toNumber(left) - toNumber(right);
        case "*":
          return toNumber(left) * toNumber(right);
        case "/":
          return toNumber(right) === 0 ? 0 : toNumber(left) / toNumber(right);
        case "%":
          return toNumber(right) === 0 ? 0 : toNumber(left) % toNumber(right);
        case "==":
          return left == right;
        case "!=":
          return left != right;
        case ">":
          return toNumber(left) > toNumber(right);
        case "<":
          return toNumber(left) < toNumber(right);
        case ">=":
          return toNumber(left) >= toNumber(right);
        case "<=":
          return toNumber(left) <= toNumber(right);
        default:
          return null;
      }
    }
    case "UnaryOp":
      if (node.op === "!")
        return !evaluate(node.operand, context);
      if (node.op === "-")
        return -toNumber(evaluate(node.operand, context));
      return null;
    case "Ternary":
      return evaluate(node.cond, context) ? evaluate(node.then, context) : evaluate(node.else, context);
    case "Member": {
      const obj = evaluate(node.obj, context);
      if (obj == null)
        return null;
      if (Array.isArray(obj)) {
        if (node.field === "length")
          return obj.length;
        return obj.map((item) => item?.[node.field] ?? null);
      }
      return obj[node.field];
    }
    case "Index": {
      const obj = evaluate(node.obj, context);
      const idx = evaluate(node.index, context);
      if (obj == null || idx == null)
        return null;
      if (Array.isArray(obj))
        return obj[toNumber(idx)];
      return obj[String(idx)];
    }
    case "Assign":
      return {
        __reactive: "assign",
        target: node.target,
        expr: node.value
      };
  }
}
function evaluateElementInline(el, context, schemaCtx) {
  if (el.hasDynamicProps === false)
    return el;
  const def = schemaCtx.library.components[el.typeName];
  const evaluated = {};
  for (const [key, value] of Object.entries(el.props)) {
    const propSchema = def?.props?.shape?.[key];
    evaluated[key] = evaluatePropInline(value, context, schemaCtx, propSchema);
  }
  return {
    ...el,
    props: evaluated
  };
}
function evaluatePropInline(value, context, schemaCtx, reactiveSchema) {
  return evaluatePropCore(value, context, schemaCtx, reactiveSchema, {
    recurseElement: (el) => evaluateElementInline(el, context, schemaCtx),
    recurse: (v, rs) => evaluatePropInline(v, context, schemaCtx, rs)
  });
}
function evaluateArgs(node, context, params = BUILTIN_CALLS.get(node.name)?.params ?? []) {
  const named2 = node.mappedProps ?? nameArgs(node.args, params);
  const args = {};
  for (const key in named2)
    args[key] = evaluate(named2[key], context);
  return args;
}
function callArgs(node, context, params) {
  const args = evaluateArgs(node, context, Object.keys(params.properties ?? {}).map((name) => ({
    name,
    required: false
  })));
  for (const key in args)
    if (args[key] === null && !params.required?.includes(key))
      delete args[key];
  return args;
}
function checkValue(value, schema, name, path, context, strict = false) {
  const ctx = {
    errors: [],
    partial: false
  };
  const checked = validateSchemaValue(value, schema, name, path, ctx);
  for (const e of ctx.errors)
    context.reportError?.(`@${name}: ${e.message}`);
  return strict && ctx.errors.length > 0 ? INVALID : checked;
}
function missesRequired(args, params) {
  return !!params.required?.some((key) => args[key] == null && getSchemaDefaultValue(params.properties?.[key]) === undefined);
}
function callFunction(name, def, node, context) {
  const raw = callArgs(node, context, def.params);
  if (missesRequired(raw, def.params))
    return null;
  const args = checkValue(raw, def.params, name, "", context);
  if (args === INVALID)
    return null;
  let result;
  try {
    result = def.fn(args);
  } catch (e) {
    context.reportError?.(`@${name} threw: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
  if (!def.returns)
    return result;
  const checked = checkValue(result, def.returns, name, "/returns", context);
  return checked === INVALID ? null : checked ?? null;
}
function isActionPlan(value) {
  return typeof value === "object" && value !== null && Array.isArray(value.steps);
}
function flattenPlans(values) {
  return ownSteps({ steps: values.flatMap((v) => {
    if (isActionPlan(v))
      return v.steps;
    return v != null && typeof v === "object" && "type" in v ? [v] : [];
  }) });
}
var customSteps = /* @__PURE__ */ new WeakSet;
function ownSteps(plan) {
  const own = (s) => s?.type !== "custom_action" || customSteps.has(s);
  return plan.steps.every(own) ? plan : {
    ...plan,
    steps: plan.steps.filter(own)
  };
}
function evaluateActionCall(node, context) {
  const { name, args } = node;
  if (name === "Action") {
    const list = args.length > 0 ? evaluate(args[0], context) : [];
    return flattenPlans(Array.isArray(list) ? list : []);
  }
  const def = BUILTIN_STEPS[name];
  const step = def.step ? def.step(evaluateArgs(node, context)) : evaluateLazyStep(name, args);
  return { steps: step ? [step] : [] };
}
function evaluateLazyStep(name, args) {
  switch (name) {
    case "Run": {
      const refNode = args[0];
      if (refNode?.k !== "RuntimeRef")
        return null;
      return {
        type: ACTION_STEPS.Run,
        statementId: refNode.n,
        refType: refNode.refType
      };
    }
    case "Set":
      if (args.length < 2 || args[0].k !== "StateRef")
        return null;
      return {
        type: ACTION_STEPS.Set,
        target: args[0].n,
        valueAST: args[1]
      };
    case "Reset": {
      const targets = args.filter((a) => a.k === "StateRef").map((a) => a.n);
      if (targets.length === 0)
        return null;
      return {
        type: ACTION_STEPS.Reset,
        targets
      };
    }
    default:
      return null;
  }
}
function substituteRef(node, varName, value) {
  switch (node.k) {
    case "Ref":
      return node.n === varName ? toLiteralAST(value) : node;
    case "Member":
      if (isASTNode(node.obj)) {
        const subObj = substituteRef(node.obj, varName, value);
        if (subObj.k === "Obj") {
          const entry = subObj.entries.find(([k]) => k === node.field);
          if (entry)
            return entry[1];
        }
        return {
          ...node,
          obj: subObj
        };
      }
      return node;
    case "Index":
      return {
        ...node,
        obj: isASTNode(node.obj) ? substituteRef(node.obj, varName, value) : node.obj,
        index: isASTNode(node.index) ? substituteRef(node.index, varName, value) : node.index
      };
    case "BinOp":
      return {
        ...node,
        left: substituteRef(node.left, varName, value),
        right: substituteRef(node.right, varName, value)
      };
    case "UnaryOp":
      return {
        ...node,
        operand: substituteRef(node.operand, varName, value)
      };
    case "Ternary":
      return {
        ...node,
        cond: substituteRef(node.cond, varName, value),
        then: substituteRef(node.then, varName, value),
        else: substituteRef(node.else, varName, value)
      };
    case "Arr":
      return {
        ...node,
        els: node.els.map((e) => substituteRef(e, varName, value))
      };
    case "Obj":
      return {
        ...node,
        entries: node.entries.map(([k, v]) => [k, substituteRef(v, varName, value)])
      };
    case "Comp": {
      const sub = (a) => substituteRef(a, varName, value);
      const result = {
        ...node,
        args: node.args.map(sub)
      };
      if (node.mappedProps)
        result.mappedProps = mapValues(node.mappedProps, sub);
      return result;
    }
    case "Assign":
      return {
        ...node,
        value: substituteRef(node.value, varName, value)
      };
    default:
      return node;
  }
}
function mapValues(record2, fn) {
  const out = {};
  for (const key in record2)
    out[key] = fn(record2[key]);
  return out;
}
function evaluateLazyBuiltin(name, args, context, schemaCtx) {
  if (name === "Each") {
    if (args.length < 3)
      return [];
    const arr = evaluate(args[0], context);
    if (!Array.isArray(arr))
      return [];
    const varName = args[1].k === "Ref" ? args[1].n : args[1].k === "Str" ? args[1].v : null;
    if (!varName)
      return [];
    const template = args[2];
    return arr.map((item, _idx) => {
      const substituted = substituteRef(template, varName, item);
      const childCtx = {
        ...context,
        resolveRef: (refName2) => {
          if (refName2 === varName)
            return item;
          return context.resolveRef(refName2);
        }
      };
      const result = evaluate(substituted, childCtx, schemaCtx);
      if (schemaCtx && isElementNode(result))
        return evaluateElementInline(result, childCtx, schemaCtx);
      return result;
    });
  }
  return null;
}
function evaluatePropCore(value, context, schemaCtx, reactiveSchema, callbacks) {
  const result = evaluatePropValue$1(value, context, schemaCtx, reactiveSchema, callbacks);
  return isActionPlan(result) ? ownSteps(result) : result;
}
function evaluatePropValue$1(value, context, schemaCtx, reactiveSchema, callbacks) {
  if (value == null)
    return value;
  if (typeof value !== "object")
    return value;
  if (isASTNode(value)) {
    if (value.k === "StateRef" && reactiveSchema && isReactiveSchema(reactiveSchema))
      return {
        __reactive: "assign",
        target: value.n,
        expr: {
          k: "StateRef",
          n: "$value"
        }
      };
    const result = evaluate(value, context, schemaCtx);
    if (isElementNode(result))
      return callbacks.recurseElement(result);
    if (Array.isArray(result))
      return result.map((item) => isElementNode(item) ? callbacks.recurseElement(item) : item);
    if (isReactiveAssign(result) && !(reactiveSchema && isReactiveSchema(reactiveSchema)))
      return context.getState(result.target) ?? null;
    return result;
  }
  if (typeof value === "string" && reactiveSchema && isReactiveSchema(reactiveSchema))
    return value;
  if (Array.isArray(value))
    return value.map((v) => callbacks.recurse(v, reactiveSchema));
  if (isElementNode(value))
    return callbacks.recurseElement(value);
  if (isActionPlan(value))
    return value;
  const obj = value;
  let needsEval = false;
  for (const val of Object.values(obj))
    if (typeof val === "object" && val !== null) {
      needsEval = true;
      break;
    }
  if (needsEval) {
    const result = {};
    for (const [k, v] of Object.entries(obj))
      result[k] = callbacks.recurse(v, reactiveSchema);
    return result;
  }
  return value;
}
var NUMERIC_RULES = new Set([
  "min",
  "max",
  "minLength",
  "maxLength"
]);
// node_modules/@byteowlz/oqto-openui/schema/catalog.json
var catalog_default = {
  root: "Stack",
  groups: [
    {
      name: "Layout",
      components: [
        "Stack",
        "Tabs",
        "TabItem",
        "Accordion",
        "AccordionItem",
        "Steps",
        "StepsItem",
        "Carousel",
        "Separator",
        "Modal"
      ],
      notes: [
        '- For grid-like layouts, use Stack with direction "row" and wrap set to true.',
        '- Prefer justify "start" (or omit justify) with wrap=true for stable columns instead of uneven gutters.',
        "- Use nested Stacks when you need explicit rows/sections.",
        '- Show/hide sections: $editId != "" ? Card([editForm]) : null',
        '- Modal: Modal("Title", $showModal, [content]) — $showModal is boolean, X/Escape auto-closes. Put Form with its own buttons inside children.',
        "- Use Tabs for alternative views (chart types, data sections) — no $variable needed",
        "- Shared filter across Tabs: same $days binding in Query args works across all TabItems"
      ]
    },
    {
      name: "Content",
      components: [
        "Card",
        "CardHeader",
        "TextContent",
        "MarkDownRenderer",
        "Callout",
        "TextCallout",
        "Image",
        "ImageBlock",
        "ImageGallery",
        "CodeBlock",
        "InlineHeader"
      ],
      notes: [
        "- InlineHeader is a compact heading + description pair for labelling a block (lighter than CardHeader).",
        '- Use Cards to group related KPIs or sections. Stack with direction "row" for side-by-side layouts.',
        '- Success toast: Callout("success", "Saved", "Done.", $showSuccess) — use @Set($showSuccess, true) in save action, auto-dismisses after 3s. For errors: result.status == "error" ? Callout("error", "Failed", result.error) : null',
        '- KPI card: Card([TextContent("Label", "small"), TextContent("" + @Count(@Filter(data.rows, "field", "==", "value")), "large-heavy")])'
      ]
    },
    {
      name: "Tables",
      components: [
        "Table",
        "Col",
        "EditableTable"
      ],
      notes: [
        "- EditableTable lets the user edit cells inline. Give it a unique name, columns of { type, key, header } with type one of text | number | date-single | select | url (select also needs options: [{ value, label }]).",
        "- data is an array of { id, values } rows where values are ordered positionally to match columns. Edited data is submitted when the user clicks Save Changes.",
        '- Table is COLUMN-oriented: Table([Col("Label", dataArray), Col("Count", countArray, "number")]). Use array pluck for data: data.rows.fieldName',
        '- Col data can be component arrays for styled cells: Col("Status", @Each(data.rows, "item", Tag(item.status, null, "sm", item.status == "open" ? "success" : "danger")))',
        '- Row actions: Col("Actions", @Each(data.rows, "t", Button("Edit", Action([@Set($showEdit, true), @Set($editId, t.id)]))))',
        '- Sortable: sorted = @Sort(data.rows, $sortField, "desc"). Bind $sortField to Select. Use sorted.fieldName for Col data',
        '- Searchable: filtered = @Filter(data.rows, "title", "contains", $search). Bind $search to Input',
        "- Chain sort + filter: filtered = @Filter(...) then sorted = @Sort(filtered, ...) — use sorted for both Table and Charts",
        '- Empty state: @Count(data.rows) > 0 ? Table([...]) : TextContent("No data yet")'
      ]
    },
    {
      name: "Charts (2D)",
      components: [
        "BarChart",
        "LineChart",
        "AreaChart",
        "RadarChart",
        "HorizontalBarChart",
        "Series"
      ],
      notes: [
        '- Charts accept column arrays: LineChart(labels, [Series("Name", values)]). Use array pluck: LineChart(data.rows.day, [Series("Views", data.rows.views)])',
        "- Use Cards to wrap charts with CardHeader for titled sections",
        "- Chart + Table from same source: use @Sort or @Filter result for both LineChart and Table Col data",
        '- Multiple chart views: use Tabs — Tabs([TabItem("line", "Line", [LineChart(...)]), TabItem("bar", "Bar", [BarChart(...)])])'
      ]
    },
    {
      name: "Charts (1D)",
      components: [
        "PieChart",
        "RadialChart",
        "SingleStackedBarChart",
        "Slice"
      ],
      notes: [
        "- PieChart and BarChart need NUMBERS, not objects. For list data, use @Count(@Filter(...)) to aggregate:",
        '- PieChart from list: `PieChart(["Low", "Med", "High"], [@Count(@Filter(data.rows, "priority", "==", "low")), @Count(@Filter(data.rows, "priority", "==", "medium")), @Count(@Filter(data.rows, "priority", "==", "high"))], "donut")`',
        '- KPI from count: `TextContent("" + @Count(@Filter(data.rows, "status", "==", "open")), "large-heavy")`'
      ]
    },
    {
      name: "Charts (Scatter)",
      components: [
        "ScatterChart",
        "ScatterSeries",
        "Point"
      ]
    },
    {
      name: "Forms",
      components: [
        "Form",
        "FormControl",
        "Label",
        "Input",
        "TextArea",
        "Select",
        "SelectItem",
        "DatePicker",
        "Slider",
        "CheckBoxGroup",
        "CheckBoxItem",
        "RadioGroup",
        "RadioItem",
        "SwitchGroup",
        "SwitchItem",
        "Chips",
        "ChipItem",
        "OptionCards",
        "OptionCard"
      ],
      notes: [
        "- Chips: compact single/multiple selection pills. Use ChipItem references for each option.",
        "- OptionCards: larger selectable cards with title, subtitle and an optional Icon or Image on top. Use OptionCard references for each option.",
        "- For Form fields, define EACH FormControl as its own reference — do NOT inline all controls in one array. This allows progressive field-by-field streaming.",
        "- NEVER nest Form inside Form — each Form should be a standalone container.",
        "- Form requires explicit buttons. Always pass a Buttons(...) reference as the third Form argument.",
        "- rules is an optional object: {required: true, email: true, minLength: 8, maxLength: 100}",
        "- Available rules: required, email, min, max, minLength, maxLength, pattern, url, numeric",
        "- The renderer shows error messages automatically — do NOT generate error text in the UI",
        '- Conditional fields: $country == "US" ? stateField : $country == "UK" ? postcodeField : addressField',
        '- Edit form in Modal: Modal("Edit", $showEdit, [Form("edit", Buttons([saveBtn, cancelBtn]), [fields...])]). Save button should include @Set($showEdit, false) to close modal.'
      ]
    },
    {
      name: "Buttons",
      components: [
        "Button",
        "Buttons",
        "IconButton"
      ],
      notes: [
        "- Icon renders a lucide icon by kebab-case name; it is also used as the icon of IconButton, IconText and OptionCard.",
        '- Toggle in @Each: @Each(rows, "t", Button(t.status == "open" ? "Close" : "Reopen", Action([...])))'
      ]
    },
    {
      name: "Data Display",
      components: [
        "TagBlock",
        "Tag",
        "Icon",
        "EntityList",
        "ListBlock",
        "ListItem"
      ],
      notes: [
        '- Color-mapped Tag: Tag(value, null, "sm", value == "high" ? "danger" : value == "medium" ? "warning" : "neutral")',
        "- EntityList is a compact two-column list of { left, right } rows (e.g. name / value). size='default' also supports a header and footer row; size='small' does not.",
        "- ListBlock is a numbered or image list of ListItem references. An action on ListItem is optional."
      ]
    },
    {
      name: "Cards",
      components: [
        "SnippetCardBlock",
        "SnippetCardItem",
        "OverviewCardBlock",
        "OverviewCardItem",
        "ContextCardBlock",
        "ContextCardItem",
        "CompositeCardBlock",
        "CompositeCardItem",
        "VisualCardBlock",
        "VisualCardItem",
        "Text",
        "BoldText",
        "IconText",
        "ImageText",
        "ImageTextLarge",
        "MetricIndicatorInline",
        "MetricIndicatorWithStrikethrough"
      ],
      notes: [
        "- Card blocks lay out 2+ items in a responsive grid (or carousel where supported). Every item in a block must have the same structure.",
        "- SnippetCardItem: small card with lhs (IconText | ImageText) and optional rhs (Text | BoldText) — good for key/value facts.",
        "- OverviewCardItem: small card with top (IconText | ImageText | Text) and optional bottom MetricIndicatorInline — good for KPIs.",
        "- ContextCardItem: medium card with a title (string or Tag), body text and optional background image — good for summaries.",
        "- CompositeCardItem: rich card with header, body array (Text, BoldText, MetricIndicatorInline, IconText, Image, charts, ListBlock, TagBlock, EntityList) and footer (price + Button) — good for products/offers.",
        "- VisualCardItem: image-first card with a BoldText body and optional Tag.",
        "- Text / BoldText / IconText / ImageText / ImageTextLarge / MetricIndicator* are the inline building blocks used INSIDE card items; do not place them directly in the root Card."
      ]
    }
  ],
  components: {
    Accordion: {
      signature: "Accordion(items: AccordionItem[])",
      description: "Collapsible sections"
    },
    AccordionItem: {
      signature: "AccordionItem(value: string, trigger: string, content: (TextContent | MarkDownRenderer | CardHeader | Callout | TextCallout | CodeBlock | Image | ImageBlock | ImageGallery | Separator | HorizontalBarChart | RadarChart | PieChart | RadialChart | SingleStackedBarChart | ScatterChart | AreaChart | BarChart | LineChart | Table | TagBlock | Form | Buttons | IconButton | Steps | InlineHeader | EntityList | EditableTable | SnippetCardBlock | OverviewCardBlock | ContextCardBlock | CompositeCardBlock | VisualCardBlock)[])",
      description: "value is unique id, trigger is section title"
    },
    AreaChart: {
      signature: 'AreaChart(labels: string[], series: Series[], variant?: "linear" | "natural" | "step", xLabel?: string, yLabel?: string, height?: number)',
      description: "Filled area under lines; use for cumulative totals or volume trends over time"
    },
    BarChart: {
      signature: 'BarChart(labels: string[], series: Series[], variant?: "grouped" | "stacked", xLabel?: string, yLabel?: string, height?: number)',
      description: "Vertical bars; use for comparing values across categories with one or more series"
    },
    BoldText: {
      signature: 'BoldText(variant?: "text" | "number", value: string, subtext?: string, subtextVariant?: "text" | "number" | "metric", size?: "xs" | "sm" | "md" | "lg")',
      description: "Emphasized (bold) text line with optional subtext. variant 'number' uses tabular number styling; subtextVariant 'metric' colors a leading +/- subtext green/red."
    },
    Button: {
      signature: 'Button(label: string, action?: ActionExpression, variant?: "primary" | "secondary" | "tertiary", type?: "normal" | "destructive", size?: "extra-small" | "small" | "medium" | "large")',
      description: "Clickable button"
    },
    Buttons: {
      signature: 'Buttons(buttons: Button[], direction?: "row" | "column")',
      description: 'Group of Button components. direction: "row" (default) | "column".'
    },
    Callout: {
      signature: 'Callout(variant: "info" | "warning" | "error" | "success" | "neutral", title: string, description: string, visible?: $binding<boolean>)',
      description: "Callout banner. Optional visible is a reactive $boolean — auto-dismisses after 3s by setting $visible to false."
    },
    Card: {
      signature: 'Card(children: (TextContent | MarkDownRenderer | CardHeader | Callout | TextCallout | CodeBlock | Image | ImageBlock | ImageGallery | Separator | HorizontalBarChart | RadarChart | PieChart | RadialChart | SingleStackedBarChart | ScatterChart | AreaChart | BarChart | LineChart | Table | TagBlock | Form | Buttons | IconButton | Steps | InlineHeader | EntityList | EditableTable | SnippetCardBlock | OverviewCardBlock | ContextCardBlock | CompositeCardBlock | VisualCardBlock | Tabs | Carousel | Stack)[], variant?: "card" | "sunk" | "clear", direction?: "row" | "column", gap?: "none" | "xs" | "s" | "m" | "l" | "xl" | "2xl", align?: "start" | "center" | "end" | "stretch" | "baseline", justify?: "start" | "center" | "end" | "between" | "around" | "evenly", wrap?: boolean)',
      description: 'Styled container. variant: "card" (default, elevated) | "sunk" (recessed) | "clear" (transparent). Always full width. Accepts all Stack flex params (default: direction "column"). Cards flex to share space in row/wrap layouts.'
    },
    CardHeader: {
      signature: "CardHeader(title?: string, subtitle?: string)",
      description: "Header with optional title and subtitle"
    },
    Carousel: {
      signature: 'Carousel(children: (TextContent | MarkDownRenderer | CardHeader | Callout | TextCallout | CodeBlock | Image | ImageBlock | ImageGallery | Separator | HorizontalBarChart | RadarChart | PieChart | RadialChart | SingleStackedBarChart | ScatterChart | AreaChart | BarChart | LineChart | Table | TagBlock | Form | Buttons | IconButton | Steps | InlineHeader | EntityList | EditableTable | SnippetCardBlock | OverviewCardBlock | ContextCardBlock | CompositeCardBlock | VisualCardBlock)[][], variant?: "card" | "sunk")',
      description: "Horizontal scrollable carousel"
    },
    CheckBoxGroup: {
      signature: "CheckBoxGroup(name: string, items: CheckBoxItem[], rules?: {required?: boolean, email?: boolean, url?: boolean, numeric?: boolean, min?: number, max?: number, minLength?: number, maxLength?: number, pattern?: string}, value?: $binding<Record<string, boolean>>)",
      description: ""
    },
    CheckBoxItem: {
      signature: "CheckBoxItem(label: string, description: string, name: string, defaultChecked?: boolean)",
      description: ""
    },
    ChipItem: {
      signature: "ChipItem(value: string, label: string, icon?: Icon, disabled?: boolean)",
      description: "A single selectable chip inside a Chips group, with a value, label and optional icon."
    },
    Chips: {
      signature: 'Chips(name: string, type?: "single" | "multiple", items?: ChipItem[], rules?: {required?: boolean, email?: boolean, url?: boolean, numeric?: boolean, min?: number, max?: number, minLength?: number, maxLength?: number, pattern?: string}, defaultValue?: string | string[])',
      description: "A form field of compact selectable chips for choosing one or many short options; the selection is stored under `name`."
    },
    CodeBlock: {
      signature: "CodeBlock(language: string, codeString: string)",
      description: "Syntax-highlighted code block"
    },
    Col: {
      signature: 'Col(label: string, data: any, type?: "string" | "number" | "action")',
      description: "Column definition — holds label + data array"
    },
    CompositeCardBlock: {
      signature: 'CompositeCardBlock(items: CompositeCardItem[], layout?: "grid" | "carousel", responsive?: boolean, action?: ActionExpression, gap?: number | string)',
      description: "A two-per-row grid or carousel of rich cards, each with an optional header, stacked body content (text, metrics, charts, lists, tags) and a price/button footer; an optional action makes every card clickable."
    },
    CompositeCardItem: {
      signature: "CompositeCardItem(id?: string, header?: IconText | ImageText | ImageTextLarge | Text | Image, body?: (Text | BoldText | MetricIndicatorInline | IconText | Image | AreaChart | BarChart | LineChart | ListBlock | TagBlock | EntityList)[], footer?: {price?: BoldText | MetricIndicatorWithStrikethrough, button?: Button})",
      description: "A single card inside a CompositeCardBlock: an optional header (icon/image/text), a stack of body elements (text, metrics, charts, lists, tags), and an optional price/button footer."
    },
    ContextCardBlock: {
      signature: 'ContextCardBlock(items: ContextCardItem[], layout?: "grid" | "carousel", responsive?: boolean, action?: ActionExpression, gap?: number | string)',
      description: "A grid or carousel of compact tinted context cards (title or tag plus a short bold body); an optional action makes every card clickable."
    },
    ContextCardItem: {
      signature: 'ContextCardItem(id?: string, title: string | Tag, body?: string, bgColor?: "gray", bgImageSrc?: string, bgImageAlt?: string)',
      description: "A single card inside a ContextCardBlock: a title (plain string or Tag), an optional markdown body, and an optional gray tint or background image."
    },
    DatePicker: {
      signature: 'DatePicker(name: string, mode?: "single" | "range", rules?: {required?: boolean, email?: boolean, url?: boolean, numeric?: boolean, min?: number, max?: number, minLength?: number, maxLength?: number, pattern?: string}, value?: $binding<any>)',
      description: ""
    },
    EditableTable: {
      signature: 'EditableTable(name?: string, columns?: {type: "text" | "number" | "date-single" | "select" | "url", key?: string, header?: string, width?: number, options?: {value: string, label: string}[]}[], data?: {id: string, values: (string | number)[]}[])',
      description: "Spreadsheet-like table whose cells the user can edit inline (text, number, url, date, select columns); edits are saved back as a form field"
    },
    EntityList: {
      signature: 'EntityList(rows?: {left: string, right: string, rightVariant?: "text" | "number"}[], size?: "small" | "default", header?: {left: string, right: string, rightVariant?: "text" | "number"}, footer?: {left: string, right: string, rightVariant?: "text" | "number"})',
      description: "Two-column key/value rows (left label, right value). size 'default' supports optional header and footer rows; rightVariant 'number' uses tabular numbers."
    },
    Form: {
      signature: "Form(name: string, buttons: Buttons, fields?: FormControl[])",
      description: "Form container with fields and explicit action buttons"
    },
    FormControl: {
      signature: "FormControl(label: string, input: Input | TextArea | Select | DatePicker | Slider | CheckBoxGroup | RadioGroup | Chips | OptionCards, hint?: string)",
      description: "Field with label, input component, and optional hint text"
    },
    HorizontalBarChart: {
      signature: 'HorizontalBarChart(labels: string[], series: Series[], variant?: "grouped" | "stacked", xLabel?: string, yLabel?: string)',
      description: "Horizontal bars; prefer when category labels are long or for ranked lists"
    },
    Icon: {
      signature: "Icon(name: string, category?: string)",
      description: "A lucide icon by kebab-case name (e.g. 'circle-check'). Optional category picks a topical fallback when the name doesn't resolve."
    },
    IconButton: {
      signature: 'IconButton(name: string, icon: Icon, action?: ActionExpression, variant?: "primary" | "secondary" | "tertiary", size?: "extra-small" | "small" | "medium" | "large", shape?: "square" | "circle")',
      description: "Icon-only button. name is the accessible label and the action label; icon is an Icon; action fires on click."
    },
    IconText: {
      signature: 'IconText(icon: Icon, iconVariant?: "neutral" | "info" | "success" | "warning" | "danger" | "inverted" | "filled" | "soft", iconSize?: "xs" | "s" | "m" | "l" | "xl" | "sm" | "md" | "lg", title: string, subtitle?: string, bold?: boolean, layout?: "horizontal" | "vertical")',
      description: "An icon badge with a title and optional subtitle, laid out horizontally or vertically. iconVariant sets the badge color."
    },
    Image: {
      signature: "Image(alt: string, src?: string)",
      description: "Image with alt text and optional URL"
    },
    ImageBlock: {
      signature: "ImageBlock(src: string, alt?: string)",
      description: "Image block with loading state"
    },
    ImageGallery: {
      signature: "ImageGallery(images: {src: string, alt?: string, details?: string}[])",
      description: "Gallery grid of images with modal preview"
    },
    ImageText: {
      signature: 'ImageText(src: string, alt?: string, title: string, subtitle?: string, bold?: boolean, layout?: "horizontal" | "vertical", imageSize?: number)',
      description: "A small square image (thumbnail/avatar) with a title and optional subtitle. src must be a real image URL."
    },
    ImageTextLarge: {
      signature: "ImageTextLarge(src: string, alt?: string, title: string, subtitle?: string, bold?: boolean)",
      description: "A full-width banner image above a bold title and optional subtitle. src must be a real image URL."
    },
    InlineHeader: {
      signature: "InlineHeader(heading: string, description?: string)",
      description: "Compact section heading with an optional one-line description, for use inside cards."
    },
    Input: {
      signature: 'Input(name: string, placeholder?: string, type?: "text" | "email" | "password" | "number" | "url", rules?: {required?: boolean, email?: boolean, url?: boolean, numeric?: boolean, min?: number, max?: number, minLength?: number, maxLength?: number, pattern?: string}, value?: $binding<string>)',
      description: ""
    },
    Label: {
      signature: "Label(text: string)",
      description: "Text label"
    },
    LineChart: {
      signature: 'LineChart(labels: string[], series: Series[], variant?: "linear" | "natural" | "step", xLabel?: string, yLabel?: string, height?: number)',
      description: "Lines over categories; use for trends and continuous data over time"
    },
    ListBlock: {
      signature: 'ListBlock(items: ListItem[], variant?: "number" | "image", size?: "default" | "small")',
      description: "A list of items with number or image indicators. Each item can optionally have an action. size small renders a compact list."
    },
    ListItem: {
      signature: "ListItem(title: string, subtitle?: string, image?: {src: string, alt: string}, actionLabel?: string, action?: ActionExpression)",
      description: "Item in a ListBlock — displays a title with an optional subtitle and image. When action is provided, the item becomes clickable."
    },
    MarkDownRenderer: {
      signature: 'MarkDownRenderer(textMarkdown: string, variant?: "clear" | "card" | "sunk")',
      description: "Renders markdown text with optional container variant"
    },
    MetricIndicatorInline: {
      signature: 'MetricIndicatorInline(value: string, subtext?: string, trend?: {direction: "up" | "down", value: number})',
      description: "Headline metric value with an optional +/- percentage trend and subtext, all on one line."
    },
    MetricIndicatorWithStrikethrough: {
      signature: 'MetricIndicatorWithStrikethrough(value: string, subtext?: string, previousValue?: string, trend?: {direction: "up" | "down", value: number})',
      description: "Headline metric value with an optional struck-through previousValue, a +/- percentage trend, and subtext below."
    },
    Modal: {
      signature: 'Modal(title: string, open?: $binding<boolean>, children: (TextContent | MarkDownRenderer | CardHeader | Callout | TextCallout | CodeBlock | Image | ImageBlock | ImageGallery | Separator | HorizontalBarChart | RadarChart | PieChart | RadialChart | SingleStackedBarChart | ScatterChart | AreaChart | BarChart | LineChart | Table | TagBlock | Form | Buttons | IconButton | Steps | InlineHeader | EntityList | EditableTable | SnippetCardBlock | OverviewCardBlock | ContextCardBlock | CompositeCardBlock | VisualCardBlock)[], size?: "sm" | "md" | "lg")',
      description: "Modal dialog. open is a reactive $boolean binding — set to true to open, X/Escape/backdrop auto-closes. Put Form with buttons inside children."
    },
    OptionCard: {
      signature: "OptionCard(value: string, title: string, subtitle?: string, topContent?: Icon | Image, disabled?: boolean)",
      description: "A single selectable card inside an OptionCards group, with a value, title, optional subtitle and an optional Icon or Image on top."
    },
    OptionCards: {
      signature: 'OptionCards(name: string, type?: "single" | "multiple", items?: OptionCard[], rules?: {required?: boolean, email?: boolean, url?: boolean, numeric?: boolean, min?: number, max?: number, minLength?: number, maxLength?: number, pattern?: string}, defaultValue?: string | string[])',
      description: "A form field of selectable cards (title, optional subtitle, optional icon or image) laid out in a responsive grid for choosing one or many options; the selection is stored under `name`."
    },
    OverviewCardBlock: {
      signature: 'OverviewCardBlock(items: OverviewCardItem[], layout?: "grid" | "carousel", responsive?: boolean, action?: ActionExpression, gap?: number | string)',
      description: "A grid or horizontal carousel of compact overview cards, each with a heading (icon/image/text) on top and an inline metric below; optionally clickable with a shared action."
    },
    OverviewCardItem: {
      signature: "OverviewCardItem(id?: string, top: IconText | ImageText | Text, bottom?: MetricIndicatorInline)",
      description: "One overview card: a heading slot at the top (IconText, ImageText or Text) and an optional MetricIndicatorInline at the bottom."
    },
    PieChart: {
      signature: 'PieChart(labels: string[], values: number[], variant?: "pie" | "donut", appearance?: "circular" | "semiCircular")',
      description: "Circular slices; use plucked arrays: PieChart(data.categories, data.values)"
    },
    Point: {
      signature: "Point(x: number, y: number, z?: number)",
      description: "Data point with numeric coordinates"
    },
    RadarChart: {
      signature: "RadarChart(labels: string[], series: Series[])",
      description: "Spider/web chart; use for comparing multiple variables across one or more entities"
    },
    RadialChart: {
      signature: "RadialChart(labels: string[], values: number[])",
      description: "Radial bars; use plucked arrays: RadialChart(data.categories, data.values)"
    },
    RadioGroup: {
      signature: "RadioGroup(name: string, items: RadioItem[], defaultValue?: string, rules?: {required?: boolean, email?: boolean, url?: boolean, numeric?: boolean, min?: number, max?: number, minLength?: number, maxLength?: number, pattern?: string}, value?: $binding<string>)",
      description: ""
    },
    RadioItem: {
      signature: "RadioItem(label: string, description: string, value: string)",
      description: ""
    },
    ScatterChart: {
      signature: "ScatterChart(datasets: ScatterSeries[], xLabel?: string, yLabel?: string)",
      description: "X/Y scatter plot; use for correlations, distributions, and clustering"
    },
    ScatterSeries: {
      signature: "ScatterSeries(name: string, points: Point[])",
      description: "Named dataset"
    },
    Select: {
      signature: 'Select(name: string, items: SelectItem[], placeholder?: string, rules?: {required?: boolean, email?: boolean, url?: boolean, numeric?: boolean, min?: number, max?: number, minLength?: number, maxLength?: number, pattern?: string}, value?: $binding<string>, size?: "small" | "medium" | "large")',
      description: ""
    },
    SelectItem: {
      signature: "SelectItem(value: string, label: string)",
      description: "Option for Select"
    },
    Separator: {
      signature: 'Separator(orientation?: "horizontal" | "vertical", decorative?: boolean)',
      description: "Visual divider between content sections"
    },
    Series: {
      signature: "Series(category: string, values: number[])",
      description: "One data series"
    },
    SingleStackedBarChart: {
      signature: "SingleStackedBarChart(labels: string[], values: number[])",
      description: "Single horizontal stacked bar; use plucked arrays: SingleStackedBarChart(data.categories, data.values)"
    },
    Slice: {
      signature: "Slice(category: string, value: number)",
      description: "One slice with label and numeric value"
    },
    Slider: {
      signature: 'Slider(name: string, variant: "continuous" | "discrete", min: number, max: number, step?: number, defaultValue?: number[], label?: string, rules?: {required?: boolean, email?: boolean, url?: boolean, numeric?: boolean, min?: number, max?: number, minLength?: number, maxLength?: number, pattern?: string}, value?: $binding<number[]>)',
      description: "Numeric slider input; supports continuous and discrete (stepped) variants"
    },
    SnippetCardBlock: {
      signature: 'SnippetCardBlock(items: SnippetCardItem[], layout?: "grid", responsive?: boolean, action?: ActionExpression, gap?: number | string)',
      description: "A responsive grid of compact label/value cards (2 per row) for showing several short facts side by side; optionally clickable with a shared action."
    },
    SnippetCardItem: {
      signature: "SnippetCardItem(id?: string, lhs: IconText | ImageText, rhs?: Text | BoldText)",
      description: "One row-style snippet card: a label on the left (IconText or ImageText) and an optional value on the right (Text or BoldText)."
    },
    Stack: {
      signature: 'Stack(children: any[], direction?: "row" | "column", gap?: "none" | "xs" | "s" | "m" | "l" | "xl" | "2xl", align?: "start" | "center" | "end" | "stretch" | "baseline", justify?: "start" | "center" | "end" | "between" | "around" | "evenly", wrap?: boolean)',
      description: 'Flex container. direction: "row"|"column" (default "column"). gap: "none"|"xs"|"s"|"m"|"l"|"xl"|"2xl" (default "m"). align: "start"|"center"|"end"|"stretch"|"baseline". justify: "start"|"center"|"end"|"between"|"around"|"evenly".'
    },
    Steps: {
      signature: "Steps(items: StepsItem[])",
      description: "Step-by-step guide"
    },
    StepsItem: {
      signature: "StepsItem(title: string, details: string)",
      description: "title and details text for one step"
    },
    SwitchGroup: {
      signature: 'SwitchGroup(name: string, items: SwitchItem[], variant?: "clear" | "card" | "sunk", value?: $binding<Record<string, boolean>>)',
      description: "Group of switch toggles"
    },
    SwitchItem: {
      signature: "SwitchItem(label?: string, description?: string, name: string, defaultChecked?: boolean)",
      description: "Individual switch toggle"
    },
    TabItem: {
      signature: "TabItem(value: string, trigger: string, content: (TextContent | MarkDownRenderer | CardHeader | Callout | TextCallout | CodeBlock | Image | ImageBlock | ImageGallery | Separator | HorizontalBarChart | RadarChart | PieChart | RadialChart | SingleStackedBarChart | ScatterChart | AreaChart | BarChart | LineChart | Table | TagBlock | Form | Buttons | IconButton | Steps | InlineHeader | EntityList | EditableTable | SnippetCardBlock | OverviewCardBlock | ContextCardBlock | CompositeCardBlock | VisualCardBlock)[])",
      description: "value is unique id, trigger is tab label, content is array of components"
    },
    Table: {
      signature: "Table(columns: Col[])",
      description: "Data table — column-oriented. Each Col holds its own data array."
    },
    Tabs: {
      signature: "Tabs(items: TabItem[])",
      description: "Tabbed container"
    },
    Tag: {
      signature: 'Tag(text: string, icon?: Icon, size?: "sm" | "md" | "lg", variant?: "neutral" | "info" | "success" | "warning" | "danger")',
      description: "Styled tag/badge with optional Icon and variant"
    },
    TagBlock: {
      signature: 'TagBlock(tags: string[], size?: "sm" | "md" | "lg")',
      description: "tags is an array of strings; optional size sm | md | lg"
    },
    Text: {
      signature: 'Text(variant?: "text" | "number", value: string, subtext?: string, subtextVariant?: "text" | "number" | "metric", size?: "xs" | "sm" | "md" | "lg")',
      description: "Plain text line with optional subtext. variant 'number' uses tabular number styling; subtextVariant 'metric' colors a leading +/- subtext green/red."
    },
    TextArea: {
      signature: "TextArea(name: string, placeholder?: string, rows?: number, rules?: {required?: boolean, email?: boolean, url?: boolean, numeric?: boolean, min?: number, max?: number, minLength?: number, maxLength?: number, pattern?: string}, value?: $binding<string>)",
      description: ""
    },
    TextCallout: {
      signature: 'TextCallout(variant?: "neutral" | "info" | "warning" | "success" | "danger", title?: string, description?: string)',
      description: "Text callout with variant, title, and description"
    },
    TextContent: {
      signature: 'TextContent(text: string, size?: "small" | "default" | "large" | "small-heavy" | "large-heavy")',
      description: 'Text block. Supports markdown. Optional size: "small" | "default" | "large" | "small-heavy" | "large-heavy".'
    },
    VisualCardBlock: {
      signature: 'VisualCardBlock(items: VisualCardItem[], layout?: "grid" | "carousel", responsive?: boolean, action?: ActionExpression, gap?: number | string)',
      description: "A grid or carousel of photo-first cards: a full-bleed background image with a tag on top and a bold text panel at the bottom; an optional action makes every card clickable."
    },
    VisualCardItem: {
      signature: "VisualCardItem(body: BoldText, id?: string, bgImageSrc?: string, tag?: Tag, bgImageAlt?: string)",
      description: "A single photo-first card inside a VisualCardBlock: a BoldText body panel, an optional Tag, and a background image (bgImageSrc must be a real URL; bgImageAlt is its alt text)."
    }
  },
  actions: [
    "Answer",
    "ToAssistant",
    "OpenUrl",
    "Set",
    "Reset",
    "Run"
  ]
};
// node_modules/@byteowlz/oqto-openui/schema/library.json
var library_default = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  properties: {
    Card: {
      $ref: "#/$defs/Card"
    },
    CardHeader: {
      $ref: "#/$defs/CardHeader"
    },
    TextContent: {
      $ref: "#/$defs/TextContent"
    },
    MarkDownRenderer: {
      $ref: "#/$defs/MarkDownRenderer"
    },
    Callout: {
      $ref: "#/$defs/Callout"
    },
    TextCallout: {
      $ref: "#/$defs/TextCallout"
    },
    Image: {
      $ref: "#/$defs/Image"
    },
    ImageBlock: {
      $ref: "#/$defs/ImageBlock"
    },
    ImageGallery: {
      $ref: "#/$defs/ImageGallery"
    },
    CodeBlock: {
      $ref: "#/$defs/CodeBlock"
    },
    InlineHeader: {
      $ref: "#/$defs/InlineHeader"
    },
    Table: {
      $ref: "#/$defs/Table"
    },
    Col: {
      $ref: "#/$defs/Col"
    },
    EditableTable: {
      $ref: "#/$defs/EditableTable"
    },
    BarChart: {
      $ref: "#/$defs/BarChart"
    },
    LineChart: {
      $ref: "#/$defs/LineChart"
    },
    AreaChart: {
      $ref: "#/$defs/AreaChart"
    },
    RadarChart: {
      $ref: "#/$defs/RadarChart"
    },
    HorizontalBarChart: {
      $ref: "#/$defs/HorizontalBarChart"
    },
    Series: {
      $ref: "#/$defs/Series"
    },
    PieChart: {
      $ref: "#/$defs/PieChart"
    },
    RadialChart: {
      $ref: "#/$defs/RadialChart"
    },
    SingleStackedBarChart: {
      $ref: "#/$defs/SingleStackedBarChart"
    },
    Slice: {
      $ref: "#/$defs/Slice"
    },
    ScatterChart: {
      $ref: "#/$defs/ScatterChart"
    },
    ScatterSeries: {
      $ref: "#/$defs/ScatterSeries"
    },
    Point: {
      $ref: "#/$defs/Point"
    },
    Form: {
      $ref: "#/$defs/Form"
    },
    FormControl: {
      $ref: "#/$defs/FormControl"
    },
    Label: {
      $ref: "#/$defs/Label"
    },
    Input: {
      $ref: "#/$defs/Input"
    },
    TextArea: {
      $ref: "#/$defs/TextArea"
    },
    Select: {
      $ref: "#/$defs/Select"
    },
    SelectItem: {
      $ref: "#/$defs/SelectItem"
    },
    DatePicker: {
      $ref: "#/$defs/DatePicker"
    },
    Slider: {
      $ref: "#/$defs/Slider"
    },
    CheckBoxGroup: {
      $ref: "#/$defs/CheckBoxGroup"
    },
    CheckBoxItem: {
      $ref: "#/$defs/CheckBoxItem"
    },
    RadioGroup: {
      $ref: "#/$defs/RadioGroup"
    },
    RadioItem: {
      $ref: "#/$defs/RadioItem"
    },
    SwitchGroup: {
      $ref: "#/$defs/SwitchGroup"
    },
    SwitchItem: {
      $ref: "#/$defs/SwitchItem"
    },
    ChipItem: {
      $ref: "#/$defs/ChipItem"
    },
    Chips: {
      $ref: "#/$defs/Chips"
    },
    OptionCard: {
      $ref: "#/$defs/OptionCard"
    },
    OptionCards: {
      $ref: "#/$defs/OptionCards"
    },
    Button: {
      $ref: "#/$defs/Button"
    },
    Buttons: {
      $ref: "#/$defs/Buttons"
    },
    IconButton: {
      $ref: "#/$defs/IconButton"
    },
    Stack: {
      $ref: "#/$defs/Stack"
    },
    Tabs: {
      $ref: "#/$defs/Tabs"
    },
    TabItem: {
      $ref: "#/$defs/TabItem"
    },
    Accordion: {
      $ref: "#/$defs/Accordion"
    },
    AccordionItem: {
      $ref: "#/$defs/AccordionItem"
    },
    Steps: {
      $ref: "#/$defs/Steps"
    },
    StepsItem: {
      $ref: "#/$defs/StepsItem"
    },
    Carousel: {
      $ref: "#/$defs/Carousel"
    },
    Separator: {
      $ref: "#/$defs/Separator"
    },
    TagBlock: {
      $ref: "#/$defs/TagBlock"
    },
    Tag: {
      $ref: "#/$defs/Tag"
    },
    Icon: {
      $ref: "#/$defs/Icon"
    },
    EntityList: {
      $ref: "#/$defs/EntityList"
    },
    ListBlock: {
      $ref: "#/$defs/ListBlock"
    },
    ListItem: {
      $ref: "#/$defs/ListItem"
    },
    Text: {
      $ref: "#/$defs/Text"
    },
    BoldText: {
      $ref: "#/$defs/BoldText"
    },
    IconText: {
      $ref: "#/$defs/IconText"
    },
    ImageText: {
      $ref: "#/$defs/ImageText"
    },
    ImageTextLarge: {
      $ref: "#/$defs/ImageTextLarge"
    },
    MetricIndicatorInline: {
      $ref: "#/$defs/MetricIndicatorInline"
    },
    MetricIndicatorWithStrikethrough: {
      $ref: "#/$defs/MetricIndicatorWithStrikethrough"
    },
    SnippetCardItem: {
      $ref: "#/$defs/SnippetCardItem"
    },
    SnippetCardBlock: {
      $ref: "#/$defs/SnippetCardBlock"
    },
    OverviewCardItem: {
      $ref: "#/$defs/OverviewCardItem"
    },
    OverviewCardBlock: {
      $ref: "#/$defs/OverviewCardBlock"
    },
    ContextCardItem: {
      $ref: "#/$defs/ContextCardItem"
    },
    ContextCardBlock: {
      $ref: "#/$defs/ContextCardBlock"
    },
    CompositeCardItem: {
      $ref: "#/$defs/CompositeCardItem"
    },
    CompositeCardBlock: {
      $ref: "#/$defs/CompositeCardBlock"
    },
    VisualCardItem: {
      $ref: "#/$defs/VisualCardItem"
    },
    VisualCardBlock: {
      $ref: "#/$defs/VisualCardBlock"
    },
    Modal: {
      $ref: "#/$defs/Modal"
    }
  },
  required: [
    "Card",
    "CardHeader",
    "TextContent",
    "MarkDownRenderer",
    "Callout",
    "TextCallout",
    "Image",
    "ImageBlock",
    "ImageGallery",
    "CodeBlock",
    "InlineHeader",
    "Table",
    "Col",
    "EditableTable",
    "BarChart",
    "LineChart",
    "AreaChart",
    "RadarChart",
    "HorizontalBarChart",
    "Series",
    "PieChart",
    "RadialChart",
    "SingleStackedBarChart",
    "Slice",
    "ScatterChart",
    "ScatterSeries",
    "Point",
    "Form",
    "FormControl",
    "Label",
    "Input",
    "TextArea",
    "Select",
    "SelectItem",
    "DatePicker",
    "Slider",
    "CheckBoxGroup",
    "CheckBoxItem",
    "RadioGroup",
    "RadioItem",
    "SwitchGroup",
    "SwitchItem",
    "ChipItem",
    "Chips",
    "OptionCard",
    "OptionCards",
    "Button",
    "Buttons",
    "IconButton",
    "Stack",
    "Tabs",
    "TabItem",
    "Accordion",
    "AccordionItem",
    "Steps",
    "StepsItem",
    "Carousel",
    "Separator",
    "TagBlock",
    "Tag",
    "Icon",
    "EntityList",
    "ListBlock",
    "ListItem",
    "Text",
    "BoldText",
    "IconText",
    "ImageText",
    "ImageTextLarge",
    "MetricIndicatorInline",
    "MetricIndicatorWithStrikethrough",
    "SnippetCardItem",
    "SnippetCardBlock",
    "OverviewCardItem",
    "OverviewCardBlock",
    "ContextCardItem",
    "ContextCardBlock",
    "CompositeCardItem",
    "CompositeCardBlock",
    "VisualCardItem",
    "VisualCardBlock",
    "Modal"
  ],
  additionalProperties: false,
  $defs: {
    Card: {
      type: "object",
      properties: {
        children: {
          type: "array",
          items: {
            anyOf: [
              {
                $ref: "#/$defs/TextContent"
              },
              {
                $ref: "#/$defs/MarkDownRenderer"
              },
              {
                $ref: "#/$defs/CardHeader"
              },
              {
                $ref: "#/$defs/Callout"
              },
              {
                $ref: "#/$defs/TextCallout"
              },
              {
                $ref: "#/$defs/CodeBlock"
              },
              {
                $ref: "#/$defs/Image"
              },
              {
                $ref: "#/$defs/ImageBlock"
              },
              {
                $ref: "#/$defs/ImageGallery"
              },
              {
                $ref: "#/$defs/Separator"
              },
              {
                $ref: "#/$defs/HorizontalBarChart"
              },
              {
                $ref: "#/$defs/RadarChart"
              },
              {
                $ref: "#/$defs/PieChart"
              },
              {
                $ref: "#/$defs/RadialChart"
              },
              {
                $ref: "#/$defs/SingleStackedBarChart"
              },
              {
                $ref: "#/$defs/ScatterChart"
              },
              {
                $ref: "#/$defs/AreaChart"
              },
              {
                $ref: "#/$defs/BarChart"
              },
              {
                $ref: "#/$defs/LineChart"
              },
              {
                $ref: "#/$defs/Table"
              },
              {
                $ref: "#/$defs/TagBlock"
              },
              {
                $ref: "#/$defs/Form"
              },
              {
                $ref: "#/$defs/Buttons"
              },
              {
                $ref: "#/$defs/IconButton"
              },
              {
                $ref: "#/$defs/Steps"
              },
              {
                $ref: "#/$defs/InlineHeader"
              },
              {
                $ref: "#/$defs/EntityList"
              },
              {
                $ref: "#/$defs/EditableTable"
              },
              {
                $ref: "#/$defs/SnippetCardBlock"
              },
              {
                $ref: "#/$defs/OverviewCardBlock"
              },
              {
                $ref: "#/$defs/ContextCardBlock"
              },
              {
                $ref: "#/$defs/CompositeCardBlock"
              },
              {
                $ref: "#/$defs/VisualCardBlock"
              },
              {
                $ref: "#/$defs/Tabs"
              },
              {
                $ref: "#/$defs/Carousel"
              },
              {
                $ref: "#/$defs/Stack"
              }
            ]
          }
        },
        variant: {
          type: "string",
          enum: [
            "card",
            "sunk",
            "clear"
          ]
        },
        direction: {
          type: "string",
          enum: [
            "row",
            "column"
          ]
        },
        gap: {
          type: "string",
          enum: [
            "none",
            "xs",
            "s",
            "m",
            "l",
            "xl",
            "2xl"
          ]
        },
        align: {
          type: "string",
          enum: [
            "start",
            "center",
            "end",
            "stretch",
            "baseline"
          ]
        },
        justify: {
          type: "string",
          enum: [
            "start",
            "center",
            "end",
            "between",
            "around",
            "evenly"
          ]
        },
        wrap: {
          type: "boolean"
        }
      },
      required: [
        "children"
      ],
      additionalProperties: false,
      id: "Card",
      description: 'Styled container. variant: "card" (default, elevated) | "sunk" (recessed) | "clear" (transparent). Always full width. Accepts all Stack flex params (default: direction "column"). Cards flex to share space in row/wrap layouts.'
    },
    TextContent: {
      type: "object",
      properties: {
        text: {
          type: "string"
        },
        size: {
          type: "string",
          enum: [
            "small",
            "default",
            "large",
            "small-heavy",
            "large-heavy"
          ]
        }
      },
      required: [
        "text"
      ],
      additionalProperties: false,
      id: "TextContent",
      description: 'Text block. Supports markdown. Optional size: "small" | "default" | "large" | "small-heavy" | "large-heavy".'
    },
    MarkDownRenderer: {
      type: "object",
      properties: {
        textMarkdown: {
          type: "string"
        },
        variant: {
          type: "string",
          enum: [
            "clear",
            "card",
            "sunk"
          ]
        }
      },
      required: [
        "textMarkdown"
      ],
      additionalProperties: false,
      id: "MarkDownRenderer",
      description: "Renders markdown text with optional container variant"
    },
    CardHeader: {
      type: "object",
      properties: {
        title: {
          type: "string"
        },
        subtitle: {
          type: "string"
        }
      },
      additionalProperties: false,
      id: "CardHeader",
      description: "Header with optional title and subtitle"
    },
    Callout: {
      type: "object",
      properties: {
        variant: {
          type: "string",
          enum: [
            "info",
            "warning",
            "error",
            "success",
            "neutral"
          ]
        },
        title: {
          type: "string"
        },
        description: {
          type: "string"
        },
        visible: {
          type: "boolean"
        }
      },
      required: [
        "variant",
        "title",
        "description"
      ],
      additionalProperties: false,
      id: "Callout",
      description: "Callout banner. Optional visible is a reactive $boolean — auto-dismisses after 3s by setting $visible to false."
    },
    TextCallout: {
      type: "object",
      properties: {
        variant: {
          type: "string",
          enum: [
            "neutral",
            "info",
            "warning",
            "success",
            "danger"
          ]
        },
        title: {
          type: "string"
        },
        description: {
          type: "string"
        }
      },
      additionalProperties: false,
      id: "TextCallout",
      description: "Text callout with variant, title, and description"
    },
    CodeBlock: {
      type: "object",
      properties: {
        language: {
          type: "string"
        },
        codeString: {
          type: "string"
        }
      },
      required: [
        "language",
        "codeString"
      ],
      additionalProperties: false,
      id: "CodeBlock",
      description: "Syntax-highlighted code block"
    },
    Image: {
      type: "object",
      properties: {
        alt: {
          type: "string"
        },
        src: {
          type: "string"
        }
      },
      required: [
        "alt"
      ],
      additionalProperties: false,
      id: "Image",
      description: "Image with alt text and optional URL"
    },
    ImageBlock: {
      type: "object",
      properties: {
        src: {
          type: "string"
        },
        alt: {
          type: "string"
        }
      },
      required: [
        "src"
      ],
      additionalProperties: false,
      id: "ImageBlock",
      description: "Image block with loading state"
    },
    ImageGallery: {
      type: "object",
      properties: {
        images: {
          type: "array",
          items: {
            type: "object",
            properties: {
              src: {
                type: "string"
              },
              alt: {
                type: "string"
              },
              details: {
                type: "string"
              }
            },
            required: [
              "src"
            ],
            additionalProperties: false
          }
        }
      },
      required: [
        "images"
      ],
      additionalProperties: false,
      id: "ImageGallery",
      description: "Gallery grid of images with modal preview"
    },
    Separator: {
      type: "object",
      properties: {
        orientation: {
          type: "string",
          enum: [
            "horizontal",
            "vertical"
          ]
        },
        decorative: {
          type: "boolean"
        }
      },
      additionalProperties: false,
      id: "Separator",
      description: "Visual divider between content sections"
    },
    HorizontalBarChart: {
      type: "object",
      properties: {
        labels: {
          type: "array",
          items: {
            type: "string"
          }
        },
        series: {
          type: "array",
          items: {
            $ref: "#/$defs/Series"
          }
        },
        variant: {
          type: "string",
          enum: [
            "grouped",
            "stacked"
          ]
        },
        xLabel: {
          type: "string"
        },
        yLabel: {
          type: "string"
        }
      },
      required: [
        "labels",
        "series"
      ],
      additionalProperties: false,
      id: "HorizontalBarChart",
      description: "Horizontal bars; prefer when category labels are long or for ranked lists"
    },
    Series: {
      type: "object",
      properties: {
        category: {
          type: "string"
        },
        values: {
          type: "array",
          items: {
            type: "number"
          }
        }
      },
      required: [
        "category",
        "values"
      ],
      additionalProperties: false,
      id: "Series",
      description: "One data series"
    },
    RadarChart: {
      type: "object",
      properties: {
        labels: {
          type: "array",
          items: {
            type: "string"
          }
        },
        series: {
          type: "array",
          items: {
            $ref: "#/$defs/Series"
          }
        }
      },
      required: [
        "labels",
        "series"
      ],
      additionalProperties: false,
      id: "RadarChart",
      description: "Spider/web chart; use for comparing multiple variables across one or more entities"
    },
    PieChart: {
      type: "object",
      properties: {
        labels: {
          type: "array",
          items: {
            type: "string"
          }
        },
        values: {
          type: "array",
          items: {
            type: "number"
          }
        },
        variant: {
          type: "string",
          enum: [
            "pie",
            "donut"
          ]
        },
        appearance: {
          type: "string",
          enum: [
            "circular",
            "semiCircular"
          ]
        }
      },
      required: [
        "labels",
        "values"
      ],
      additionalProperties: false,
      id: "PieChart",
      description: "Circular slices; use plucked arrays: PieChart(data.categories, data.values)"
    },
    RadialChart: {
      type: "object",
      properties: {
        labels: {
          type: "array",
          items: {
            type: "string"
          }
        },
        values: {
          type: "array",
          items: {
            type: "number"
          }
        }
      },
      required: [
        "labels",
        "values"
      ],
      additionalProperties: false,
      id: "RadialChart",
      description: "Radial bars; use plucked arrays: RadialChart(data.categories, data.values)"
    },
    SingleStackedBarChart: {
      type: "object",
      properties: {
        labels: {
          type: "array",
          items: {
            type: "string"
          }
        },
        values: {
          type: "array",
          items: {
            type: "number"
          }
        }
      },
      required: [
        "labels",
        "values"
      ],
      additionalProperties: false,
      id: "SingleStackedBarChart",
      description: "Single horizontal stacked bar; use plucked arrays: SingleStackedBarChart(data.categories, data.values)"
    },
    ScatterChart: {
      type: "object",
      properties: {
        datasets: {
          type: "array",
          items: {
            $ref: "#/$defs/ScatterSeries"
          }
        },
        xLabel: {
          type: "string"
        },
        yLabel: {
          type: "string"
        }
      },
      required: [
        "datasets"
      ],
      additionalProperties: false,
      id: "ScatterChart",
      description: "X/Y scatter plot; use for correlations, distributions, and clustering"
    },
    ScatterSeries: {
      type: "object",
      properties: {
        name: {
          type: "string"
        },
        points: {
          type: "array",
          items: {
            $ref: "#/$defs/Point"
          }
        }
      },
      required: [
        "name",
        "points"
      ],
      additionalProperties: false,
      id: "ScatterSeries",
      description: "Named dataset"
    },
    Point: {
      type: "object",
      properties: {
        x: {
          type: "number"
        },
        y: {
          type: "number"
        },
        z: {
          type: "number"
        }
      },
      required: [
        "x",
        "y"
      ],
      additionalProperties: false,
      id: "Point",
      description: "Data point with numeric coordinates"
    },
    AreaChart: {
      type: "object",
      properties: {
        labels: {
          type: "array",
          items: {
            type: "string"
          }
        },
        series: {
          type: "array",
          items: {
            $ref: "#/$defs/Series"
          }
        },
        variant: {
          type: "string",
          enum: [
            "linear",
            "natural",
            "step"
          ]
        },
        xLabel: {
          type: "string"
        },
        yLabel: {
          type: "string"
        },
        height: {
          type: "number"
        }
      },
      required: [
        "labels",
        "series"
      ],
      additionalProperties: false,
      id: "AreaChart",
      description: "Filled area under lines; use for cumulative totals or volume trends over time"
    },
    BarChart: {
      type: "object",
      properties: {
        labels: {
          type: "array",
          items: {
            type: "string"
          }
        },
        series: {
          type: "array",
          items: {
            $ref: "#/$defs/Series"
          }
        },
        variant: {
          type: "string",
          enum: [
            "grouped",
            "stacked"
          ]
        },
        xLabel: {
          type: "string"
        },
        yLabel: {
          type: "string"
        },
        height: {
          type: "number"
        }
      },
      required: [
        "labels",
        "series"
      ],
      additionalProperties: false,
      id: "BarChart",
      description: "Vertical bars; use for comparing values across categories with one or more series"
    },
    LineChart: {
      type: "object",
      properties: {
        labels: {
          type: "array",
          items: {
            type: "string"
          }
        },
        series: {
          type: "array",
          items: {
            $ref: "#/$defs/Series"
          }
        },
        variant: {
          type: "string",
          enum: [
            "linear",
            "natural",
            "step"
          ]
        },
        xLabel: {
          type: "string"
        },
        yLabel: {
          type: "string"
        },
        height: {
          type: "number"
        }
      },
      required: [
        "labels",
        "series"
      ],
      additionalProperties: false,
      id: "LineChart",
      description: "Lines over categories; use for trends and continuous data over time"
    },
    Table: {
      type: "object",
      properties: {
        columns: {
          type: "array",
          items: {
            $ref: "#/$defs/Col"
          }
        }
      },
      required: [
        "columns"
      ],
      additionalProperties: false,
      id: "Table",
      description: "Data table — column-oriented. Each Col holds its own data array."
    },
    Col: {
      type: "object",
      properties: {
        label: {
          type: "string"
        },
        data: {},
        type: {
          type: "string",
          enum: [
            "string",
            "number",
            "action"
          ]
        }
      },
      required: [
        "label",
        "data"
      ],
      additionalProperties: false,
      id: "Col",
      description: "Column definition — holds label + data array"
    },
    TagBlock: {
      type: "object",
      properties: {
        tags: {
          type: "array",
          items: {
            type: "string"
          }
        },
        size: {
          type: "string",
          enum: [
            "sm",
            "md",
            "lg"
          ]
        }
      },
      required: [
        "tags"
      ],
      additionalProperties: false,
      id: "TagBlock",
      description: "tags is an array of strings; optional size sm | md | lg"
    },
    Form: {
      type: "object",
      properties: {
        name: {
          type: "string"
        },
        buttons: {
          $ref: "#/$defs/Buttons"
        },
        fields: {
          default: [],
          type: "array",
          items: {
            $ref: "#/$defs/FormControl"
          }
        }
      },
      required: [
        "name",
        "buttons",
        "fields"
      ],
      additionalProperties: false,
      id: "Form",
      description: "Form container with fields and explicit action buttons"
    },
    Buttons: {
      type: "object",
      properties: {
        buttons: {
          type: "array",
          items: {
            $ref: "#/$defs/Button"
          }
        },
        direction: {
          type: "string",
          enum: [
            "row",
            "column"
          ]
        }
      },
      required: [
        "buttons"
      ],
      additionalProperties: false,
      id: "Buttons",
      description: 'Group of Button components. direction: "row" (default) | "column".'
    },
    Button: {
      type: "object",
      properties: {
        label: {
          type: "string"
        },
        action: {
          $ref: "#/$defs/ActionExpression"
        },
        variant: {
          type: "string",
          enum: [
            "primary",
            "secondary",
            "tertiary"
          ]
        },
        type: {
          type: "string",
          enum: [
            "normal",
            "destructive"
          ]
        },
        size: {
          type: "string",
          enum: [
            "extra-small",
            "small",
            "medium",
            "large"
          ]
        }
      },
      required: [
        "label"
      ],
      additionalProperties: false,
      id: "Button",
      description: "Clickable button"
    },
    ActionExpression: {
      anyOf: [
        {
          type: "object",
          properties: {
            type: {
              type: "string",
              const: "open_url"
            },
            url: {
              type: "string"
            }
          },
          required: [
            "type",
            "url"
          ],
          additionalProperties: false
        },
        {
          type: "object",
          properties: {
            type: {
              type: "string",
              const: "continue_conversation"
            },
            context: {
              type: "string"
            }
          },
          required: [
            "type"
          ],
          additionalProperties: false
        },
        {
          type: "object",
          properties: {
            type: {
              type: "string"
            },
            params: {
              type: "object",
              propertyNames: {
                type: "string"
              },
              additionalProperties: {}
            }
          },
          required: [
            "type"
          ],
          additionalProperties: false
        }
      ],
      id: "ActionExpression"
    },
    FormControl: {
      type: "object",
      properties: {
        label: {
          type: "string"
        },
        input: {
          anyOf: [
            {
              $ref: "#/$defs/Input"
            },
            {
              $ref: "#/$defs/TextArea"
            },
            {
              $ref: "#/$defs/Select"
            },
            {
              $ref: "#/$defs/DatePicker"
            },
            {
              $ref: "#/$defs/Slider"
            },
            {
              $ref: "#/$defs/CheckBoxGroup"
            },
            {
              $ref: "#/$defs/RadioGroup"
            },
            {
              $ref: "#/$defs/Chips"
            },
            {
              $ref: "#/$defs/OptionCards"
            }
          ]
        },
        hint: {
          type: "string"
        }
      },
      required: [
        "label",
        "input"
      ],
      additionalProperties: false,
      id: "FormControl",
      description: "Field with label, input component, and optional hint text"
    },
    Input: {
      type: "object",
      properties: {
        name: {
          type: "string"
        },
        placeholder: {
          type: "string"
        },
        type: {
          type: "string",
          enum: [
            "text",
            "email",
            "password",
            "number",
            "url"
          ]
        },
        rules: {
          type: "object",
          properties: {
            required: {
              type: "boolean"
            },
            email: {
              type: "boolean"
            },
            url: {
              type: "boolean"
            },
            numeric: {
              type: "boolean"
            },
            min: {
              type: "number"
            },
            max: {
              type: "number"
            },
            minLength: {
              type: "number"
            },
            maxLength: {
              type: "number"
            },
            pattern: {
              type: "string"
            }
          },
          additionalProperties: false
        },
        value: {
          type: "string"
        }
      },
      required: [
        "name"
      ],
      additionalProperties: false,
      id: "Input"
    },
    TextArea: {
      type: "object",
      properties: {
        name: {
          type: "string"
        },
        placeholder: {
          type: "string"
        },
        rows: {
          type: "number"
        },
        rules: {
          type: "object",
          properties: {
            required: {
              type: "boolean"
            },
            email: {
              type: "boolean"
            },
            url: {
              type: "boolean"
            },
            numeric: {
              type: "boolean"
            },
            min: {
              type: "number"
            },
            max: {
              type: "number"
            },
            minLength: {
              type: "number"
            },
            maxLength: {
              type: "number"
            },
            pattern: {
              type: "string"
            }
          },
          additionalProperties: false
        },
        value: {
          type: "string"
        }
      },
      required: [
        "name"
      ],
      additionalProperties: false,
      id: "TextArea"
    },
    Select: {
      type: "object",
      properties: {
        name: {
          type: "string"
        },
        items: {
          type: "array",
          items: {
            $ref: "#/$defs/SelectItem"
          }
        },
        placeholder: {
          type: "string"
        },
        rules: {
          type: "object",
          properties: {
            required: {
              type: "boolean"
            },
            email: {
              type: "boolean"
            },
            url: {
              type: "boolean"
            },
            numeric: {
              type: "boolean"
            },
            min: {
              type: "number"
            },
            max: {
              type: "number"
            },
            minLength: {
              type: "number"
            },
            maxLength: {
              type: "number"
            },
            pattern: {
              type: "string"
            }
          },
          additionalProperties: false
        },
        value: {
          type: "string"
        },
        size: {
          type: "string",
          enum: [
            "small",
            "medium",
            "large"
          ]
        }
      },
      required: [
        "name",
        "items"
      ],
      additionalProperties: false,
      id: "Select"
    },
    SelectItem: {
      type: "object",
      properties: {
        value: {
          type: "string"
        },
        label: {
          type: "string"
        }
      },
      required: [
        "value",
        "label"
      ],
      additionalProperties: false,
      id: "SelectItem",
      description: "Option for Select"
    },
    DatePicker: {
      type: "object",
      properties: {
        name: {
          type: "string"
        },
        mode: {
          type: "string",
          enum: [
            "single",
            "range"
          ]
        },
        rules: {
          type: "object",
          properties: {
            required: {
              type: "boolean"
            },
            email: {
              type: "boolean"
            },
            url: {
              type: "boolean"
            },
            numeric: {
              type: "boolean"
            },
            min: {
              type: "number"
            },
            max: {
              type: "number"
            },
            minLength: {
              type: "number"
            },
            maxLength: {
              type: "number"
            },
            pattern: {
              type: "string"
            }
          },
          additionalProperties: false
        },
        value: {}
      },
      required: [
        "name"
      ],
      additionalProperties: false,
      id: "DatePicker"
    },
    Slider: {
      type: "object",
      properties: {
        name: {
          type: "string"
        },
        variant: {
          type: "string",
          enum: [
            "continuous",
            "discrete"
          ]
        },
        min: {
          type: "number"
        },
        max: {
          type: "number"
        },
        step: {
          type: "number"
        },
        defaultValue: {
          type: "array",
          items: {
            type: "number"
          }
        },
        label: {
          type: "string"
        },
        rules: {
          type: "object",
          properties: {
            required: {
              type: "boolean"
            },
            email: {
              type: "boolean"
            },
            url: {
              type: "boolean"
            },
            numeric: {
              type: "boolean"
            },
            min: {
              type: "number"
            },
            max: {
              type: "number"
            },
            minLength: {
              type: "number"
            },
            maxLength: {
              type: "number"
            },
            pattern: {
              type: "string"
            }
          },
          additionalProperties: false
        },
        value: {
          type: "array",
          items: {
            type: "number"
          }
        }
      },
      required: [
        "name",
        "variant",
        "min",
        "max"
      ],
      additionalProperties: false,
      id: "Slider",
      description: "Numeric slider input; supports continuous and discrete (stepped) variants"
    },
    CheckBoxGroup: {
      type: "object",
      properties: {
        name: {
          type: "string"
        },
        items: {
          type: "array",
          items: {
            $ref: "#/$defs/CheckBoxItem"
          }
        },
        rules: {
          type: "object",
          properties: {
            required: {
              type: "boolean"
            },
            email: {
              type: "boolean"
            },
            url: {
              type: "boolean"
            },
            numeric: {
              type: "boolean"
            },
            min: {
              type: "number"
            },
            max: {
              type: "number"
            },
            minLength: {
              type: "number"
            },
            maxLength: {
              type: "number"
            },
            pattern: {
              type: "string"
            }
          },
          additionalProperties: false
        },
        value: {
          type: "object",
          propertyNames: {
            type: "string"
          },
          additionalProperties: {
            type: "boolean"
          }
        }
      },
      required: [
        "name",
        "items"
      ],
      additionalProperties: false,
      id: "CheckBoxGroup"
    },
    CheckBoxItem: {
      type: "object",
      properties: {
        label: {
          type: "string"
        },
        description: {
          type: "string"
        },
        name: {
          type: "string"
        },
        defaultChecked: {
          type: "boolean"
        }
      },
      required: [
        "label",
        "description",
        "name"
      ],
      additionalProperties: false,
      id: "CheckBoxItem"
    },
    RadioGroup: {
      type: "object",
      properties: {
        name: {
          type: "string"
        },
        items: {
          type: "array",
          items: {
            $ref: "#/$defs/RadioItem"
          }
        },
        defaultValue: {
          type: "string"
        },
        rules: {
          type: "object",
          properties: {
            required: {
              type: "boolean"
            },
            email: {
              type: "boolean"
            },
            url: {
              type: "boolean"
            },
            numeric: {
              type: "boolean"
            },
            min: {
              type: "number"
            },
            max: {
              type: "number"
            },
            minLength: {
              type: "number"
            },
            maxLength: {
              type: "number"
            },
            pattern: {
              type: "string"
            }
          },
          additionalProperties: false
        },
        value: {
          type: "string"
        }
      },
      required: [
        "name",
        "items"
      ],
      additionalProperties: false,
      id: "RadioGroup"
    },
    RadioItem: {
      type: "object",
      properties: {
        label: {
          type: "string"
        },
        description: {
          type: "string"
        },
        value: {
          type: "string"
        }
      },
      required: [
        "label",
        "description",
        "value"
      ],
      additionalProperties: false,
      id: "RadioItem"
    },
    Chips: {
      type: "object",
      properties: {
        name: {
          type: "string"
        },
        type: {
          default: "multiple",
          type: "string",
          enum: [
            "single",
            "multiple"
          ]
        },
        items: {
          default: [],
          type: "array",
          items: {
            $ref: "#/$defs/ChipItem"
          }
        },
        rules: {
          type: "object",
          properties: {
            required: {
              type: "boolean"
            },
            email: {
              type: "boolean"
            },
            url: {
              type: "boolean"
            },
            numeric: {
              type: "boolean"
            },
            min: {
              type: "number"
            },
            max: {
              type: "number"
            },
            minLength: {
              type: "number"
            },
            maxLength: {
              type: "number"
            },
            pattern: {
              type: "string"
            }
          },
          additionalProperties: false
        },
        defaultValue: {
          anyOf: [
            {
              type: "string"
            },
            {
              type: "array",
              items: {
                type: "string"
              }
            }
          ]
        }
      },
      required: [
        "name",
        "type",
        "items"
      ],
      additionalProperties: false,
      id: "Chips",
      description: "A form field of compact selectable chips for choosing one or many short options; the selection is stored under `name`."
    },
    ChipItem: {
      type: "object",
      properties: {
        value: {
          type: "string"
        },
        label: {
          type: "string"
        },
        icon: {
          $ref: "#/$defs/Icon"
        },
        disabled: {
          type: "boolean"
        }
      },
      required: [
        "value",
        "label"
      ],
      additionalProperties: false,
      id: "ChipItem",
      description: "A single selectable chip inside a Chips group, with a value, label and optional icon."
    },
    Icon: {
      type: "object",
      properties: {
        name: {
          type: "string"
        },
        category: {
          type: "string"
        }
      },
      required: [
        "name"
      ],
      additionalProperties: false,
      id: "Icon",
      description: "A lucide icon by kebab-case name (e.g. 'circle-check'). Optional category picks a topical fallback when the name doesn't resolve."
    },
    OptionCards: {
      type: "object",
      properties: {
        name: {
          type: "string"
        },
        type: {
          default: "single",
          type: "string",
          enum: [
            "single",
            "multiple"
          ]
        },
        items: {
          default: [],
          type: "array",
          items: {
            $ref: "#/$defs/OptionCard"
          }
        },
        rules: {
          type: "object",
          properties: {
            required: {
              type: "boolean"
            },
            email: {
              type: "boolean"
            },
            url: {
              type: "boolean"
            },
            numeric: {
              type: "boolean"
            },
            min: {
              type: "number"
            },
            max: {
              type: "number"
            },
            minLength: {
              type: "number"
            },
            maxLength: {
              type: "number"
            },
            pattern: {
              type: "string"
            }
          },
          additionalProperties: false
        },
        defaultValue: {
          anyOf: [
            {
              type: "string"
            },
            {
              type: "array",
              items: {
                type: "string"
              }
            }
          ]
        }
      },
      required: [
        "name",
        "type",
        "items"
      ],
      additionalProperties: false,
      id: "OptionCards",
      description: "A form field of selectable cards (title, optional subtitle, optional icon or image) laid out in a responsive grid for choosing one or many options; the selection is stored under `name`."
    },
    OptionCard: {
      type: "object",
      properties: {
        value: {
          type: "string"
        },
        title: {
          type: "string"
        },
        subtitle: {
          type: "string"
        },
        topContent: {
          anyOf: [
            {
              $ref: "#/$defs/Icon"
            },
            {
              $ref: "#/$defs/Image"
            }
          ]
        },
        disabled: {
          type: "boolean"
        }
      },
      required: [
        "value",
        "title"
      ],
      additionalProperties: false,
      id: "OptionCard",
      description: "A single selectable card inside an OptionCards group, with a value, title, optional subtitle and an optional Icon or Image on top."
    },
    IconButton: {
      type: "object",
      properties: {
        name: {
          type: "string"
        },
        icon: {
          $ref: "#/$defs/Icon"
        },
        action: {
          $ref: "#/$defs/ActionExpression"
        },
        variant: {
          type: "string",
          enum: [
            "primary",
            "secondary",
            "tertiary"
          ]
        },
        size: {
          type: "string",
          enum: [
            "extra-small",
            "small",
            "medium",
            "large"
          ]
        },
        shape: {
          type: "string",
          enum: [
            "square",
            "circle"
          ]
        }
      },
      required: [
        "name",
        "icon"
      ],
      additionalProperties: false,
      id: "IconButton",
      description: "Icon-only button. name is the accessible label and the action label; icon is an Icon; action fires on click."
    },
    Steps: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            $ref: "#/$defs/StepsItem"
          }
        }
      },
      required: [
        "items"
      ],
      additionalProperties: false,
      id: "Steps",
      description: "Step-by-step guide"
    },
    StepsItem: {
      type: "object",
      properties: {
        title: {
          type: "string"
        },
        details: {
          type: "string"
        }
      },
      required: [
        "title",
        "details"
      ],
      additionalProperties: false,
      id: "StepsItem",
      description: "title and details text for one step"
    },
    InlineHeader: {
      type: "object",
      properties: {
        heading: {
          type: "string"
        },
        description: {
          type: "string"
        }
      },
      required: [
        "heading"
      ],
      additionalProperties: false,
      id: "InlineHeader",
      description: "Compact section heading with an optional one-line description, for use inside cards."
    },
    EntityList: {
      type: "object",
      properties: {
        rows: {
          default: [],
          type: "array",
          items: {
            type: "object",
            properties: {
              left: {
                type: "string"
              },
              right: {
                type: "string"
              },
              rightVariant: {
                default: "text",
                type: "string",
                enum: [
                  "text",
                  "number"
                ]
              }
            },
            required: [
              "left",
              "right",
              "rightVariant"
            ],
            additionalProperties: false
          }
        },
        size: {
          default: "default",
          type: "string",
          enum: [
            "small",
            "default"
          ]
        },
        header: {
          type: "object",
          properties: {
            left: {
              type: "string"
            },
            right: {
              type: "string"
            },
            rightVariant: {
              default: "text",
              type: "string",
              enum: [
                "text",
                "number"
              ]
            }
          },
          required: [
            "left",
            "right",
            "rightVariant"
          ],
          additionalProperties: false
        },
        footer: {
          type: "object",
          properties: {
            left: {
              type: "string"
            },
            right: {
              type: "string"
            },
            rightVariant: {
              default: "text",
              type: "string",
              enum: [
                "text",
                "number"
              ]
            }
          },
          required: [
            "left",
            "right",
            "rightVariant"
          ],
          additionalProperties: false
        }
      },
      required: [
        "rows",
        "size"
      ],
      additionalProperties: false,
      id: "EntityList",
      description: "Two-column key/value rows (left label, right value). size 'default' supports optional header and footer rows; rightVariant 'number' uses tabular numbers."
    },
    EditableTable: {
      type: "object",
      properties: {
        name: {
          default: "",
          type: "string"
        },
        columns: {
          default: [],
          type: "array",
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: [
                  "text",
                  "number",
                  "date-single",
                  "select",
                  "url"
                ]
              },
              key: {
                default: "default",
                type: "string"
              },
              header: {
                default: "",
                type: "string"
              },
              width: {
                type: "number"
              },
              options: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    value: {
                      type: "string"
                    },
                    label: {
                      type: "string"
                    }
                  },
                  required: [
                    "value",
                    "label"
                  ],
                  additionalProperties: false
                }
              }
            },
            required: [
              "type",
              "key",
              "header"
            ],
            additionalProperties: false
          }
        },
        data: {
          default: [],
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string"
              },
              values: {
                type: "array",
                items: {
                  anyOf: [
                    {
                      type: "string"
                    },
                    {
                      type: "number"
                    }
                  ]
                }
              }
            },
            required: [
              "id",
              "values"
            ],
            additionalProperties: false
          }
        }
      },
      required: [
        "name",
        "columns",
        "data"
      ],
      additionalProperties: false,
      id: "EditableTable",
      description: "Spreadsheet-like table whose cells the user can edit inline (text, number, url, date, select columns); edits are saved back as a form field"
    },
    SnippetCardBlock: {
      type: "object",
      properties: {
        items: {
          minItems: 2,
          type: "array",
          items: {
            $ref: "#/$defs/SnippetCardItem"
          }
        },
        layout: {
          default: "grid",
          type: "string",
          enum: [
            "grid"
          ]
        },
        responsive: {
          default: true,
          type: "boolean"
        },
        action: {
          $ref: "#/$defs/ActionExpression"
        },
        gap: {
          anyOf: [
            {
              type: "number"
            },
            {
              type: "string"
            }
          ]
        }
      },
      required: [
        "items",
        "layout",
        "responsive"
      ],
      additionalProperties: false,
      id: "SnippetCardBlock",
      description: "A responsive grid of compact label/value cards (2 per row) for showing several short facts side by side; optionally clickable with a shared action."
    },
    SnippetCardItem: {
      type: "object",
      properties: {
        id: {
          type: "string"
        },
        lhs: {
          anyOf: [
            {
              $ref: "#/$defs/IconText"
            },
            {
              $ref: "#/$defs/ImageText"
            }
          ]
        },
        rhs: {
          anyOf: [
            {
              $ref: "#/$defs/Text"
            },
            {
              $ref: "#/$defs/BoldText"
            }
          ]
        }
      },
      required: [
        "lhs"
      ],
      additionalProperties: false,
      id: "SnippetCardItem",
      description: "One row-style snippet card: a label on the left (IconText or ImageText) and an optional value on the right (Text or BoldText)."
    },
    IconText: {
      type: "object",
      properties: {
        icon: {
          $ref: "#/$defs/Icon"
        },
        iconVariant: {
          default: "neutral",
          type: "string",
          enum: [
            "neutral",
            "info",
            "success",
            "warning",
            "danger",
            "inverted",
            "filled",
            "soft"
          ]
        },
        iconSize: {
          default: "m",
          type: "string",
          enum: [
            "xs",
            "s",
            "m",
            "l",
            "xl",
            "sm",
            "md",
            "lg"
          ]
        },
        title: {
          type: "string"
        },
        subtitle: {
          type: "string"
        },
        bold: {
          default: false,
          type: "boolean"
        },
        layout: {
          default: "horizontal",
          type: "string",
          enum: [
            "horizontal",
            "vertical"
          ]
        }
      },
      required: [
        "icon",
        "iconVariant",
        "iconSize",
        "title",
        "bold",
        "layout"
      ],
      additionalProperties: false,
      id: "IconText",
      description: "An icon badge with a title and optional subtitle, laid out horizontally or vertically. iconVariant sets the badge color."
    },
    ImageText: {
      type: "object",
      properties: {
        src: {
          type: "string"
        },
        alt: {
          type: "string"
        },
        title: {
          type: "string"
        },
        subtitle: {
          type: "string"
        },
        bold: {
          default: false,
          type: "boolean"
        },
        layout: {
          default: "horizontal",
          type: "string",
          enum: [
            "horizontal",
            "vertical"
          ]
        },
        imageSize: {
          type: "number"
        }
      },
      required: [
        "src",
        "title",
        "bold",
        "layout"
      ],
      additionalProperties: false,
      id: "ImageText",
      description: "A small square image (thumbnail/avatar) with a title and optional subtitle. src must be a real image URL."
    },
    Text: {
      type: "object",
      properties: {
        variant: {
          default: "text",
          type: "string",
          enum: [
            "text",
            "number"
          ]
        },
        value: {
          type: "string"
        },
        subtext: {
          type: "string"
        },
        subtextVariant: {
          default: "text",
          type: "string",
          enum: [
            "text",
            "number",
            "metric"
          ]
        },
        size: {
          default: "sm",
          type: "string",
          enum: [
            "xs",
            "sm",
            "md",
            "lg"
          ]
        }
      },
      required: [
        "variant",
        "value",
        "subtextVariant",
        "size"
      ],
      additionalProperties: false,
      id: "Text",
      description: "Plain text line with optional subtext. variant 'number' uses tabular number styling; subtextVariant 'metric' colors a leading +/- subtext green/red."
    },
    BoldText: {
      type: "object",
      properties: {
        variant: {
          default: "text",
          type: "string",
          enum: [
            "text",
            "number"
          ]
        },
        value: {
          type: "string"
        },
        subtext: {
          type: "string"
        },
        subtextVariant: {
          default: "text",
          type: "string",
          enum: [
            "text",
            "number",
            "metric"
          ]
        },
        size: {
          default: "sm",
          type: "string",
          enum: [
            "xs",
            "sm",
            "md",
            "lg"
          ]
        }
      },
      required: [
        "variant",
        "value",
        "subtextVariant",
        "size"
      ],
      additionalProperties: false,
      id: "BoldText",
      description: "Emphasized (bold) text line with optional subtext. variant 'number' uses tabular number styling; subtextVariant 'metric' colors a leading +/- subtext green/red."
    },
    OverviewCardBlock: {
      type: "object",
      properties: {
        items: {
          minItems: 2,
          type: "array",
          items: {
            $ref: "#/$defs/OverviewCardItem"
          }
        },
        layout: {
          default: "grid",
          type: "string",
          enum: [
            "grid",
            "carousel"
          ]
        },
        responsive: {
          default: true,
          type: "boolean"
        },
        action: {
          $ref: "#/$defs/ActionExpression"
        },
        gap: {
          anyOf: [
            {
              type: "number"
            },
            {
              type: "string"
            }
          ]
        }
      },
      required: [
        "items",
        "layout",
        "responsive"
      ],
      additionalProperties: false,
      id: "OverviewCardBlock",
      description: "A grid or horizontal carousel of compact overview cards, each with a heading (icon/image/text) on top and an inline metric below; optionally clickable with a shared action."
    },
    OverviewCardItem: {
      type: "object",
      properties: {
        id: {
          type: "string"
        },
        top: {
          anyOf: [
            {
              $ref: "#/$defs/IconText"
            },
            {
              $ref: "#/$defs/ImageText"
            },
            {
              $ref: "#/$defs/Text"
            }
          ]
        },
        bottom: {
          $ref: "#/$defs/MetricIndicatorInline"
        }
      },
      required: [
        "top"
      ],
      additionalProperties: false,
      id: "OverviewCardItem",
      description: "One overview card: a heading slot at the top (IconText, ImageText or Text) and an optional MetricIndicatorInline at the bottom."
    },
    MetricIndicatorInline: {
      type: "object",
      properties: {
        value: {
          type: "string"
        },
        subtext: {
          type: "string"
        },
        trend: {
          type: "object",
          properties: {
            direction: {
              type: "string",
              enum: [
                "up",
                "down"
              ]
            },
            value: {
              type: "number"
            }
          },
          required: [
            "direction",
            "value"
          ],
          additionalProperties: false
        }
      },
      required: [
        "value"
      ],
      additionalProperties: false,
      id: "MetricIndicatorInline",
      description: "Headline metric value with an optional +/- percentage trend and subtext, all on one line."
    },
    ContextCardBlock: {
      type: "object",
      properties: {
        items: {
          minItems: 2,
          type: "array",
          items: {
            $ref: "#/$defs/ContextCardItem"
          }
        },
        layout: {
          default: "grid",
          type: "string",
          enum: [
            "grid",
            "carousel"
          ]
        },
        responsive: {
          default: true,
          type: "boolean"
        },
        action: {
          $ref: "#/$defs/ActionExpression"
        },
        gap: {
          anyOf: [
            {
              type: "number"
            },
            {
              type: "string"
            }
          ]
        }
      },
      required: [
        "items",
        "layout",
        "responsive"
      ],
      additionalProperties: false,
      id: "ContextCardBlock",
      description: "A grid or carousel of compact tinted context cards (title or tag plus a short bold body); an optional action makes every card clickable."
    },
    ContextCardItem: {
      type: "object",
      properties: {
        id: {
          type: "string"
        },
        title: {
          anyOf: [
            {
              type: "string"
            },
            {
              $ref: "#/$defs/Tag"
            }
          ]
        },
        body: {
          type: "string"
        },
        bgColor: {
          type: "string",
          enum: [
            "gray"
          ]
        },
        bgImageSrc: {
          type: "string"
        },
        bgImageAlt: {
          type: "string"
        }
      },
      required: [
        "title"
      ],
      additionalProperties: false,
      id: "ContextCardItem",
      description: "A single card inside a ContextCardBlock: a title (plain string or Tag), an optional markdown body, and an optional gray tint or background image."
    },
    Tag: {
      type: "object",
      properties: {
        text: {
          type: "string"
        },
        icon: {
          $ref: "#/$defs/Icon"
        },
        size: {
          type: "string",
          enum: [
            "sm",
            "md",
            "lg"
          ]
        },
        variant: {
          type: "string",
          enum: [
            "neutral",
            "info",
            "success",
            "warning",
            "danger"
          ]
        }
      },
      required: [
        "text"
      ],
      additionalProperties: false,
      id: "Tag",
      description: "Styled tag/badge with optional Icon and variant"
    },
    CompositeCardBlock: {
      type: "object",
      properties: {
        items: {
          minItems: 2,
          type: "array",
          items: {
            $ref: "#/$defs/CompositeCardItem"
          }
        },
        layout: {
          default: "grid",
          type: "string",
          enum: [
            "grid",
            "carousel"
          ]
        },
        responsive: {
          default: true,
          type: "boolean"
        },
        action: {
          $ref: "#/$defs/ActionExpression"
        },
        gap: {
          anyOf: [
            {
              type: "number"
            },
            {
              type: "string"
            }
          ]
        }
      },
      required: [
        "items",
        "layout",
        "responsive"
      ],
      additionalProperties: false,
      id: "CompositeCardBlock",
      description: "A two-per-row grid or carousel of rich cards, each with an optional header, stacked body content (text, metrics, charts, lists, tags) and a price/button footer; an optional action makes every card clickable."
    },
    CompositeCardItem: {
      type: "object",
      properties: {
        id: {
          type: "string"
        },
        header: {
          anyOf: [
            {
              $ref: "#/$defs/IconText"
            },
            {
              $ref: "#/$defs/ImageText"
            },
            {
              $ref: "#/$defs/ImageTextLarge"
            },
            {
              $ref: "#/$defs/Text"
            },
            {
              $ref: "#/$defs/Image"
            }
          ]
        },
        body: {
          default: [],
          type: "array",
          items: {
            anyOf: [
              {
                $ref: "#/$defs/Text"
              },
              {
                $ref: "#/$defs/BoldText"
              },
              {
                $ref: "#/$defs/MetricIndicatorInline"
              },
              {
                $ref: "#/$defs/IconText"
              },
              {
                $ref: "#/$defs/Image"
              },
              {
                $ref: "#/$defs/AreaChart"
              },
              {
                $ref: "#/$defs/BarChart"
              },
              {
                $ref: "#/$defs/LineChart"
              },
              {
                $ref: "#/$defs/ListBlock"
              },
              {
                $ref: "#/$defs/TagBlock"
              },
              {
                $ref: "#/$defs/EntityList"
              }
            ]
          }
        },
        footer: {
          type: "object",
          properties: {
            price: {
              anyOf: [
                {
                  $ref: "#/$defs/BoldText"
                },
                {
                  $ref: "#/$defs/MetricIndicatorWithStrikethrough"
                }
              ]
            },
            button: {
              $ref: "#/$defs/Button"
            }
          },
          additionalProperties: false
        }
      },
      required: [
        "body"
      ],
      additionalProperties: false,
      id: "CompositeCardItem",
      description: "A single card inside a CompositeCardBlock: an optional header (icon/image/text), a stack of body elements (text, metrics, charts, lists, tags), and an optional price/button footer."
    },
    ImageTextLarge: {
      type: "object",
      properties: {
        src: {
          type: "string"
        },
        alt: {
          type: "string"
        },
        title: {
          type: "string"
        },
        subtitle: {
          type: "string"
        },
        bold: {
          default: false,
          type: "boolean"
        }
      },
      required: [
        "src",
        "title",
        "bold"
      ],
      additionalProperties: false,
      id: "ImageTextLarge",
      description: "A full-width banner image above a bold title and optional subtitle. src must be a real image URL."
    },
    ListBlock: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            $ref: "#/$defs/ListItem"
          }
        },
        variant: {
          type: "string",
          enum: [
            "number",
            "image"
          ]
        },
        size: {
          type: "string",
          enum: [
            "default",
            "small"
          ]
        }
      },
      required: [
        "items"
      ],
      additionalProperties: false,
      id: "ListBlock",
      description: "A list of items with number or image indicators. Each item can optionally have an action. size small renders a compact list."
    },
    ListItem: {
      type: "object",
      properties: {
        title: {
          type: "string"
        },
        subtitle: {
          type: "string"
        },
        image: {
          type: "object",
          properties: {
            src: {
              type: "string"
            },
            alt: {
              type: "string"
            }
          },
          required: [
            "src",
            "alt"
          ],
          additionalProperties: false
        },
        actionLabel: {
          type: "string"
        },
        action: {
          $ref: "#/$defs/ActionExpression"
        }
      },
      required: [
        "title"
      ],
      additionalProperties: false,
      id: "ListItem",
      description: "Item in a ListBlock — displays a title with an optional subtitle and image. When action is provided, the item becomes clickable."
    },
    MetricIndicatorWithStrikethrough: {
      type: "object",
      properties: {
        value: {
          type: "string"
        },
        subtext: {
          type: "string"
        },
        previousValue: {
          type: "string"
        },
        trend: {
          type: "object",
          properties: {
            direction: {
              type: "string",
              enum: [
                "up",
                "down"
              ]
            },
            value: {
              type: "number"
            }
          },
          required: [
            "direction",
            "value"
          ],
          additionalProperties: false
        }
      },
      required: [
        "value"
      ],
      additionalProperties: false,
      id: "MetricIndicatorWithStrikethrough",
      description: "Headline metric value with an optional struck-through previousValue, a +/- percentage trend, and subtext below."
    },
    VisualCardBlock: {
      type: "object",
      properties: {
        items: {
          minItems: 2,
          type: "array",
          items: {
            $ref: "#/$defs/VisualCardItem"
          }
        },
        layout: {
          default: "grid",
          type: "string",
          enum: [
            "grid",
            "carousel"
          ]
        },
        responsive: {
          default: true,
          type: "boolean"
        },
        action: {
          $ref: "#/$defs/ActionExpression"
        },
        gap: {
          anyOf: [
            {
              type: "number"
            },
            {
              type: "string"
            }
          ]
        }
      },
      required: [
        "items",
        "layout",
        "responsive"
      ],
      additionalProperties: false,
      id: "VisualCardBlock",
      description: "A grid or carousel of photo-first cards: a full-bleed background image with a tag on top and a bold text panel at the bottom; an optional action makes every card clickable."
    },
    VisualCardItem: {
      type: "object",
      properties: {
        body: {
          $ref: "#/$defs/BoldText"
        },
        id: {
          type: "string"
        },
        bgImageSrc: {
          type: "string"
        },
        tag: {
          $ref: "#/$defs/Tag"
        },
        bgImageAlt: {
          type: "string"
        }
      },
      required: [
        "body"
      ],
      additionalProperties: false,
      id: "VisualCardItem",
      description: "A single photo-first card inside a VisualCardBlock: a BoldText body panel, an optional Tag, and a background image (bgImageSrc must be a real URL; bgImageAlt is its alt text)."
    },
    Tabs: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            $ref: "#/$defs/TabItem"
          }
        }
      },
      required: [
        "items"
      ],
      additionalProperties: false,
      id: "Tabs",
      description: "Tabbed container"
    },
    TabItem: {
      type: "object",
      properties: {
        value: {
          type: "string"
        },
        trigger: {
          type: "string"
        },
        content: {
          type: "array",
          items: {
            anyOf: [
              {
                $ref: "#/$defs/TextContent"
              },
              {
                $ref: "#/$defs/MarkDownRenderer"
              },
              {
                $ref: "#/$defs/CardHeader"
              },
              {
                $ref: "#/$defs/Callout"
              },
              {
                $ref: "#/$defs/TextCallout"
              },
              {
                $ref: "#/$defs/CodeBlock"
              },
              {
                $ref: "#/$defs/Image"
              },
              {
                $ref: "#/$defs/ImageBlock"
              },
              {
                $ref: "#/$defs/ImageGallery"
              },
              {
                $ref: "#/$defs/Separator"
              },
              {
                $ref: "#/$defs/HorizontalBarChart"
              },
              {
                $ref: "#/$defs/RadarChart"
              },
              {
                $ref: "#/$defs/PieChart"
              },
              {
                $ref: "#/$defs/RadialChart"
              },
              {
                $ref: "#/$defs/SingleStackedBarChart"
              },
              {
                $ref: "#/$defs/ScatterChart"
              },
              {
                $ref: "#/$defs/AreaChart"
              },
              {
                $ref: "#/$defs/BarChart"
              },
              {
                $ref: "#/$defs/LineChart"
              },
              {
                $ref: "#/$defs/Table"
              },
              {
                $ref: "#/$defs/TagBlock"
              },
              {
                $ref: "#/$defs/Form"
              },
              {
                $ref: "#/$defs/Buttons"
              },
              {
                $ref: "#/$defs/IconButton"
              },
              {
                $ref: "#/$defs/Steps"
              },
              {
                $ref: "#/$defs/InlineHeader"
              },
              {
                $ref: "#/$defs/EntityList"
              },
              {
                $ref: "#/$defs/EditableTable"
              },
              {
                $ref: "#/$defs/SnippetCardBlock"
              },
              {
                $ref: "#/$defs/OverviewCardBlock"
              },
              {
                $ref: "#/$defs/ContextCardBlock"
              },
              {
                $ref: "#/$defs/CompositeCardBlock"
              },
              {
                $ref: "#/$defs/VisualCardBlock"
              }
            ]
          }
        }
      },
      required: [
        "value",
        "trigger",
        "content"
      ],
      additionalProperties: false,
      id: "TabItem",
      description: "value is unique id, trigger is tab label, content is array of components"
    },
    Carousel: {
      type: "object",
      properties: {
        children: {
          type: "array",
          items: {
            type: "array",
            items: {
              anyOf: [
                {
                  $ref: "#/$defs/TextContent"
                },
                {
                  $ref: "#/$defs/MarkDownRenderer"
                },
                {
                  $ref: "#/$defs/CardHeader"
                },
                {
                  $ref: "#/$defs/Callout"
                },
                {
                  $ref: "#/$defs/TextCallout"
                },
                {
                  $ref: "#/$defs/CodeBlock"
                },
                {
                  $ref: "#/$defs/Image"
                },
                {
                  $ref: "#/$defs/ImageBlock"
                },
                {
                  $ref: "#/$defs/ImageGallery"
                },
                {
                  $ref: "#/$defs/Separator"
                },
                {
                  $ref: "#/$defs/HorizontalBarChart"
                },
                {
                  $ref: "#/$defs/RadarChart"
                },
                {
                  $ref: "#/$defs/PieChart"
                },
                {
                  $ref: "#/$defs/RadialChart"
                },
                {
                  $ref: "#/$defs/SingleStackedBarChart"
                },
                {
                  $ref: "#/$defs/ScatterChart"
                },
                {
                  $ref: "#/$defs/AreaChart"
                },
                {
                  $ref: "#/$defs/BarChart"
                },
                {
                  $ref: "#/$defs/LineChart"
                },
                {
                  $ref: "#/$defs/Table"
                },
                {
                  $ref: "#/$defs/TagBlock"
                },
                {
                  $ref: "#/$defs/Form"
                },
                {
                  $ref: "#/$defs/Buttons"
                },
                {
                  $ref: "#/$defs/IconButton"
                },
                {
                  $ref: "#/$defs/Steps"
                },
                {
                  $ref: "#/$defs/InlineHeader"
                },
                {
                  $ref: "#/$defs/EntityList"
                },
                {
                  $ref: "#/$defs/EditableTable"
                },
                {
                  $ref: "#/$defs/SnippetCardBlock"
                },
                {
                  $ref: "#/$defs/OverviewCardBlock"
                },
                {
                  $ref: "#/$defs/ContextCardBlock"
                },
                {
                  $ref: "#/$defs/CompositeCardBlock"
                },
                {
                  $ref: "#/$defs/VisualCardBlock"
                }
              ]
            }
          }
        },
        variant: {
          type: "string",
          enum: [
            "card",
            "sunk"
          ]
        }
      },
      required: [
        "children"
      ],
      additionalProperties: false,
      id: "Carousel",
      description: "Horizontal scrollable carousel"
    },
    Stack: {
      type: "object",
      properties: {
        children: {
          type: "array",
          items: {}
        },
        direction: {
          type: "string",
          enum: [
            "row",
            "column"
          ]
        },
        gap: {
          type: "string",
          enum: [
            "none",
            "xs",
            "s",
            "m",
            "l",
            "xl",
            "2xl"
          ]
        },
        align: {
          type: "string",
          enum: [
            "start",
            "center",
            "end",
            "stretch",
            "baseline"
          ]
        },
        justify: {
          type: "string",
          enum: [
            "start",
            "center",
            "end",
            "between",
            "around",
            "evenly"
          ]
        },
        wrap: {
          type: "boolean"
        }
      },
      required: [
        "children"
      ],
      additionalProperties: false,
      id: "Stack",
      description: 'Flex container. direction: "row"|"column" (default "column"). gap: "none"|"xs"|"s"|"m"|"l"|"xl"|"2xl" (default "m"). align: "start"|"center"|"end"|"stretch"|"baseline". justify: "start"|"center"|"end"|"between"|"around"|"evenly".'
    },
    Slice: {
      type: "object",
      properties: {
        category: {
          type: "string"
        },
        value: {
          type: "number"
        }
      },
      required: [
        "category",
        "value"
      ],
      additionalProperties: false,
      id: "Slice",
      description: "One slice with label and numeric value"
    },
    Label: {
      type: "object",
      properties: {
        text: {
          type: "string"
        }
      },
      required: [
        "text"
      ],
      additionalProperties: false,
      id: "Label",
      description: "Text label"
    },
    SwitchGroup: {
      type: "object",
      properties: {
        name: {
          type: "string"
        },
        items: {
          type: "array",
          items: {
            $ref: "#/$defs/SwitchItem"
          }
        },
        variant: {
          type: "string",
          enum: [
            "clear",
            "card",
            "sunk"
          ]
        },
        value: {
          type: "object",
          propertyNames: {
            type: "string"
          },
          additionalProperties: {
            type: "boolean"
          }
        }
      },
      required: [
        "name",
        "items"
      ],
      additionalProperties: false,
      id: "SwitchGroup",
      description: "Group of switch toggles"
    },
    SwitchItem: {
      type: "object",
      properties: {
        label: {
          type: "string"
        },
        description: {
          type: "string"
        },
        name: {
          type: "string"
        },
        defaultChecked: {
          type: "boolean"
        }
      },
      required: [
        "name"
      ],
      additionalProperties: false,
      id: "SwitchItem",
      description: "Individual switch toggle"
    },
    Accordion: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            $ref: "#/$defs/AccordionItem"
          }
        }
      },
      required: [
        "items"
      ],
      additionalProperties: false,
      id: "Accordion",
      description: "Collapsible sections"
    },
    AccordionItem: {
      type: "object",
      properties: {
        value: {
          type: "string"
        },
        trigger: {
          type: "string"
        },
        content: {
          type: "array",
          items: {
            anyOf: [
              {
                $ref: "#/$defs/TextContent"
              },
              {
                $ref: "#/$defs/MarkDownRenderer"
              },
              {
                $ref: "#/$defs/CardHeader"
              },
              {
                $ref: "#/$defs/Callout"
              },
              {
                $ref: "#/$defs/TextCallout"
              },
              {
                $ref: "#/$defs/CodeBlock"
              },
              {
                $ref: "#/$defs/Image"
              },
              {
                $ref: "#/$defs/ImageBlock"
              },
              {
                $ref: "#/$defs/ImageGallery"
              },
              {
                $ref: "#/$defs/Separator"
              },
              {
                $ref: "#/$defs/HorizontalBarChart"
              },
              {
                $ref: "#/$defs/RadarChart"
              },
              {
                $ref: "#/$defs/PieChart"
              },
              {
                $ref: "#/$defs/RadialChart"
              },
              {
                $ref: "#/$defs/SingleStackedBarChart"
              },
              {
                $ref: "#/$defs/ScatterChart"
              },
              {
                $ref: "#/$defs/AreaChart"
              },
              {
                $ref: "#/$defs/BarChart"
              },
              {
                $ref: "#/$defs/LineChart"
              },
              {
                $ref: "#/$defs/Table"
              },
              {
                $ref: "#/$defs/TagBlock"
              },
              {
                $ref: "#/$defs/Form"
              },
              {
                $ref: "#/$defs/Buttons"
              },
              {
                $ref: "#/$defs/IconButton"
              },
              {
                $ref: "#/$defs/Steps"
              },
              {
                $ref: "#/$defs/InlineHeader"
              },
              {
                $ref: "#/$defs/EntityList"
              },
              {
                $ref: "#/$defs/EditableTable"
              },
              {
                $ref: "#/$defs/SnippetCardBlock"
              },
              {
                $ref: "#/$defs/OverviewCardBlock"
              },
              {
                $ref: "#/$defs/ContextCardBlock"
              },
              {
                $ref: "#/$defs/CompositeCardBlock"
              },
              {
                $ref: "#/$defs/VisualCardBlock"
              }
            ]
          }
        }
      },
      required: [
        "value",
        "trigger",
        "content"
      ],
      additionalProperties: false,
      id: "AccordionItem",
      description: "value is unique id, trigger is section title"
    },
    Modal: {
      type: "object",
      properties: {
        title: {
          type: "string"
        },
        open: {
          type: "boolean"
        },
        children: {
          type: "array",
          items: {
            anyOf: [
              {
                $ref: "#/$defs/TextContent"
              },
              {
                $ref: "#/$defs/MarkDownRenderer"
              },
              {
                $ref: "#/$defs/CardHeader"
              },
              {
                $ref: "#/$defs/Callout"
              },
              {
                $ref: "#/$defs/TextCallout"
              },
              {
                $ref: "#/$defs/CodeBlock"
              },
              {
                $ref: "#/$defs/Image"
              },
              {
                $ref: "#/$defs/ImageBlock"
              },
              {
                $ref: "#/$defs/ImageGallery"
              },
              {
                $ref: "#/$defs/Separator"
              },
              {
                $ref: "#/$defs/HorizontalBarChart"
              },
              {
                $ref: "#/$defs/RadarChart"
              },
              {
                $ref: "#/$defs/PieChart"
              },
              {
                $ref: "#/$defs/RadialChart"
              },
              {
                $ref: "#/$defs/SingleStackedBarChart"
              },
              {
                $ref: "#/$defs/ScatterChart"
              },
              {
                $ref: "#/$defs/AreaChart"
              },
              {
                $ref: "#/$defs/BarChart"
              },
              {
                $ref: "#/$defs/LineChart"
              },
              {
                $ref: "#/$defs/Table"
              },
              {
                $ref: "#/$defs/TagBlock"
              },
              {
                $ref: "#/$defs/Form"
              },
              {
                $ref: "#/$defs/Buttons"
              },
              {
                $ref: "#/$defs/IconButton"
              },
              {
                $ref: "#/$defs/Steps"
              },
              {
                $ref: "#/$defs/InlineHeader"
              },
              {
                $ref: "#/$defs/EntityList"
              },
              {
                $ref: "#/$defs/EditableTable"
              },
              {
                $ref: "#/$defs/SnippetCardBlock"
              },
              {
                $ref: "#/$defs/OverviewCardBlock"
              },
              {
                $ref: "#/$defs/ContextCardBlock"
              },
              {
                $ref: "#/$defs/CompositeCardBlock"
              },
              {
                $ref: "#/$defs/VisualCardBlock"
              }
            ]
          }
        },
        size: {
          type: "string",
          enum: [
            "sm",
            "md",
            "lg"
          ]
        }
      },
      required: [
        "title",
        "children"
      ],
      additionalProperties: false,
      id: "Modal",
      description: "Modal dialog. open is a reactive $boolean binding — set to true to open, X/Escape/backdrop auto-closes. Put Form with buttons inside children."
    }
  },
  actions: {
    Answer: {
      description: "Submit the user's answer to the agent that asked and resume it. value is any JSON value, typically an object built from form state. Use for every choice, confirmation or form submit that the agent waits for.",
      params: {
        type: "object",
        properties: {
          value: {}
        },
        required: [
          "value"
        ],
        additionalProperties: false
      }
    }
  }
};
// node_modules/@byteowlz/oqto-openui/schema/profile.json
var profile_default = {
  id: "oqto",
  version: "0.2.1",
  root: "Stack",
  upstream: {
    "@openuidev/lang-core": "1.0.2",
    "@openuidev/react-ui": "0.18.1"
  },
  componentCount: 82
};

// node_modules/@byteowlz/oqto-openui/dist/profile.js
var PROFILE_ID = "oqto";
var PROFILE_VERSION = profile_default.version;
var ROOT = profile_default.root;
var librarySchema = library_default;
var componentNames = Object.keys(catalog_default.components);
var createOqtoParser = () => createParser(librarySchema, ROOT);
// node_modules/@byteowlz/oqto-openui/dist/envelope.js
var MAX_BODY_BYTES = 32 * 1024;
var MAX_FALLBACK_CHARS = 4000;
var Envelope = exports_external.object({
  schema: exports_external.literal("oqto.openui.part.v1"),
  partId: exports_external.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  profile: exports_external.object({ id: exports_external.literal(PROFILE_ID), version: exports_external.string().regex(/^\d+\.\d+\.\d+$/) }),
  body: exports_external.string().min(1).refine((s) => new TextEncoder().encode(s).length <= MAX_BODY_BYTES, "body too large"),
  fallback: exports_external.string().min(1).max(MAX_FALLBACK_CHARS),
  answer: exports_external.object({ schema: exports_external.record(exports_external.string(), exports_external.unknown()), timeoutSeconds: exports_external.number().int().min(1).max(86400) }).optional()
});
// node_modules/@byteowlz/oqto-openui/dist/fallback.js
var isElement = (v) => !!v && typeof v === "object" && v.type === "element" && typeof v.typeName === "string";
var isRef = (v) => !!v && typeof v === "object" && ("k" in v);
var str = (v) => v == null || isRef(v) ? "" : typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : "";
function table(header, rows) {
  const width = header.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)));
  const line = (cells) => cells.map((c, i) => c.padEnd(width[i] ?? 0)).join(" | ").trimEnd();
  return [line(header), width.map((w) => "-".repeat(w)).join("-|-"), ...rows.map(line)].join(`
`);
}
function series(labels, s) {
  const ls = Array.isArray(labels) ? labels.map(str) : [];
  return (Array.isArray(s) ? s : []).filter(isElement).map((e) => {
    const values = Array.isArray(e.props.values) ? e.props.values : [];
    return `${str(e.props.category)}: ${ls.map((l, i) => `${l}=${str(values[i])}`).join(", ")}`;
  }).join(`
`);
}
var PRESENTATION = new Set(["id", "name", "variant", "size", "layout", "type", "direction", "align", "justify", "gap", "wrap", "appearance", "icon", "iconVariant", "iconSize", "subtextVariant", "rightVariant", "responsive", "orientation", "decorative", "category", "mode", "rules", "value", "defaultValue", "defaultChecked", "disabled", "src"]);
function renderFallback(node) {
  if (node == null)
    return "";
  if (Array.isArray(node))
    return node.map(renderFallback).filter(Boolean).join(`
`);
  if (!isElement(node))
    return typeof node === "object" ? "" : str(node);
  const p = node.props;
  const kids = (v) => renderFallback(v);
  switch (node.typeName) {
    case "CardHeader":
      return [p.title ? `== ${str(p.title)} ==` : "", str(p.subtitle)].filter(Boolean).join(`
`);
    case "InlineHeader":
      return [`## ${str(p.heading)}`, str(p.description)].filter(Boolean).join(`
`);
    case "TextContent":
      return str(p.text);
    case "MarkDownRenderer":
      return str(p.textMarkdown);
    case "Callout":
    case "TextCallout":
      return `[${str(p.variant || "info").toUpperCase()}] ${[str(p.title), str(p.description)].filter(Boolean).join(": ")}`;
    case "CodeBlock":
      return `\`\`\`${str(p.language)}
${str(p.codeString)}
\`\`\``;
    case "Tabs":
    case "Accordion":
      return (Array.isArray(p.items) ? p.items : []).filter(isElement).map((i) => `-- ${str(i.props.trigger)} --
${kids(i.props.content)}`).join(`
`);
    case "Steps":
      return (Array.isArray(p.items) ? p.items : []).filter(isElement).map((i, n) => `${n + 1}. ${str(i.props.title)}${i.props.details ? ` - ${str(i.props.details)}` : ""}`).join(`
`);
    case "Table": {
      const cols = (Array.isArray(p.columns) ? p.columns : []).filter(isElement);
      const data = cols.map((c) => Array.isArray(c.props.data) ? c.props.data.map(str) : []);
      const n = Math.max(0, ...data.map((d) => d.length));
      return table(cols.map((c) => str(c.props.label)), Array.from({ length: n }, (_, r) => data.map((d) => d[r] ?? "")));
    }
    case "EditableTable": {
      const cols = Array.isArray(p.columns) ? p.columns : [];
      const rows = Array.isArray(p.data) ? p.data : [];
      return [p.name ? str(p.name) : "", table(cols.map((c) => str(c.header ?? c.key)), rows.map((r) => (r.values ?? []).map(str)))].filter(Boolean).join(`
`);
    }
    case "BarChart":
    case "LineChart":
    case "AreaChart":
    case "HorizontalBarChart":
    case "RadarChart":
      return series(p.labels, p.series);
    case "PieChart":
    case "RadialChart": {
      const ls = Array.isArray(p.labels) ? p.labels : [];
      const vs = Array.isArray(p.values) ? p.values : [];
      return ls.map((l, i) => `${str(l)}=${str(vs[i])}`).join(", ");
    }
    case "EntityList": {
      const row = (r) => {
        const o = r ?? {};
        return [str(o.left), str(o.right)];
      };
      const rows = (Array.isArray(p.rows) ? p.rows : []).map(row);
      return table(p.header ? row(p.header) : ["", ""], p.footer ? [...rows, row(p.footer)] : rows);
    }
    case "ListBlock":
      return (Array.isArray(p.items) ? p.items : []).filter(isElement).map((i, n) => `${p.variant === "number" ? `${n + 1}.` : "-"} ${str(i.props.title)}${i.props.subtitle ? ` - ${str(i.props.subtitle)}` : ""}`).join(`
`);
    case "ImageGallery":
      return (Array.isArray(p.images) ? p.images : []).map((i) => `[image: ${str(i.alt ?? i.details)}]`).join(`
`);
    case "ImageBlock":
    case "Image":
      return `[image: ${str(p.alt)}]`;
    case "TagBlock":
      return (Array.isArray(p.tags) ? p.tags.map(str) : []).map((t) => `#${t}`).join(" ");
    case "Tag":
      return `#${str(p.text)}`;
    case "MetricIndicatorInline":
      return [str(p.value), str(p.subtext), p.trend ? `(${p.trend.direction === "up" ? "+" : "-"}${str(p.trend.value)}%)` : ""].filter(Boolean).join(" ");
    case "Button":
      return `[${str(p.label)}]`;
    case "Buttons":
      return (Array.isArray(p.buttons) ? p.buttons : []).map(renderFallback).join(" ");
    case "Form":
      return [`== ${str(p.name)} ==`, kids(p.fields), kids(p.buttons)].filter(Boolean).join(`
`);
    case "FormControl":
      return `${str(p.label)}: ${kids(p.input) || "____"}`;
    case "Select":
    case "RadioGroup":
    case "Chips":
    case "OptionCards":
    case "CheckBoxGroup":
      return (Array.isArray(p.items) ? p.items : []).filter(isElement).map((i) => str(i.props.label ?? i.props.title)).join(" / ");
    case "SwitchGroup":
      return (Array.isArray(p.items) ? p.items : []).filter(isElement).map((i) => `[ ] ${str(i.props.label ?? i.props.name)}`).join(`
`);
    case "Input":
    case "TextArea":
    case "DatePicker":
    case "Slider":
      return "____";
    case "Text":
    case "BoldText":
      return [str(p.value), str(p.subtext)].filter(Boolean).join(" ");
    case "IconText":
    case "ImageText":
    case "ImageTextLarge":
      return [str(p.title), str(p.subtitle)].filter(Boolean).join(" ");
    case "OverviewCardItem":
      return [kids(p.top), kids(p.bottom)].filter(Boolean).join(": ");
    case "Separator":
      return "---";
    case "Icon":
      return "";
    default: {
      const parts = [];
      for (const [k, v] of Object.entries(p)) {
        if (PRESENTATION.has(k))
          continue;
        if (typeof v === "string")
          parts.push(v);
        else if (isElement(v) || Array.isArray(v))
          parts.push(kids(v));
      }
      return parts.filter(Boolean).join(node.typeName.endsWith("Item") ? " · " : `
`);
    }
  }
}
// node_modules/@byteowlz/oqto-openui/schema/prompt.txt
var prompt_default = 'You are an AI assistant that responds using openui-lang, a declarative UI language. Your ENTIRE response must be valid openui-lang code — no markdown, no explanations, just openui-lang.\n\n## Syntax Rules\n\n1. Each statement is on its own line: `identifier = Expression`\n2. `root` is the entry point — every program must define `root = Stack(...)`\n3. Expressions are: strings ("..."), numbers, booleans (true/false), null, arrays ([...]), objects ({...}), or component calls TypeName(arg1, arg2, ...)\n4. Use references for readability: define `name = ...` on one line, then use `name` later\n5. EVERY variable (except root) MUST be referenced by at least one other variable. Unreferenced variables are silently dropped and will NOT render. Always include defined variables in their parent\'s children/items array.\n6. Arguments are POSITIONAL (order matters, not names). Write `SomeComp([children], "row", "l")` NOT `SomeComp([children], direction: "row", gap: "l")` — colon syntax is NOT supported and silently breaks\n7. Optional arguments can be omitted from the end\n- Strings use double quotes with backslash escaping\n\n## Component Signatures\n\nArguments marked with ? are optional. Sub-components can be inline or referenced; prefer references for better streaming.\nProps typed `ActionExpression` accept one @step, or Action([@steps...]) for several. See the Action section for available steps (@ToAssistant, @OpenUrl, @Answer).\nProps marked `$binding<type>` accept a `$variable` reference for two-way binding.\n\n### Layout\nStack(children: any[], direction?: "row" | "column", gap?: "none" | "xs" | "s" | "m" | "l" | "xl" | "2xl", align?: "start" | "center" | "end" | "stretch" | "baseline", justify?: "start" | "center" | "end" | "between" | "around" | "evenly", wrap?: boolean) — Flex container. direction: "row"|"column" (default "column"). gap: "none"|"xs"|"s"|"m"|"l"|"xl"|"2xl" (default "m"). align: "start"|"center"|"end"|"stretch"|"baseline". justify: "start"|"center"|"end"|"between"|"around"|"evenly".\nTabs(items: TabItem[]) — Tabbed container\nTabItem(value: string, trigger: string, content: (TextContent | MarkDownRenderer | CardHeader | Callout | TextCallout | CodeBlock | Image | ImageBlock | ImageGallery | Separator | HorizontalBarChart | RadarChart | PieChart | RadialChart | SingleStackedBarChart | ScatterChart | AreaChart | BarChart | LineChart | Table | TagBlock | Form | Buttons | IconButton | Steps | InlineHeader | EntityList | EditableTable | SnippetCardBlock | OverviewCardBlock | ContextCardBlock | CompositeCardBlock | VisualCardBlock)[]) — value is unique id, trigger is tab label, content is array of components\nAccordion(items: AccordionItem[]) — Collapsible sections\nAccordionItem(value: string, trigger: string, content: (TextContent | MarkDownRenderer | CardHeader | Callout | TextCallout | CodeBlock | Image | ImageBlock | ImageGallery | Separator | HorizontalBarChart | RadarChart | PieChart | RadialChart | SingleStackedBarChart | ScatterChart | AreaChart | BarChart | LineChart | Table | TagBlock | Form | Buttons | IconButton | Steps | InlineHeader | EntityList | EditableTable | SnippetCardBlock | OverviewCardBlock | ContextCardBlock | CompositeCardBlock | VisualCardBlock)[]) — value is unique id, trigger is section title\nSteps(items: StepsItem[]) — Step-by-step guide\nStepsItem(title: string, details: string) — title and details text for one step\nCarousel(children: (TextContent | MarkDownRenderer | CardHeader | Callout | TextCallout | CodeBlock | Image | ImageBlock | ImageGallery | Separator | HorizontalBarChart | RadarChart | PieChart | RadialChart | SingleStackedBarChart | ScatterChart | AreaChart | BarChart | LineChart | Table | TagBlock | Form | Buttons | IconButton | Steps | InlineHeader | EntityList | EditableTable | SnippetCardBlock | OverviewCardBlock | ContextCardBlock | CompositeCardBlock | VisualCardBlock)[][], variant?: "card" | "sunk") — Horizontal scrollable carousel\nSeparator(orientation?: "horizontal" | "vertical", decorative?: boolean) — Visual divider between content sections\nModal(title: string, open?: $binding<boolean>, children: (TextContent | MarkDownRenderer | CardHeader | Callout | TextCallout | CodeBlock | Image | ImageBlock | ImageGallery | Separator | HorizontalBarChart | RadarChart | PieChart | RadialChart | SingleStackedBarChart | ScatterChart | AreaChart | BarChart | LineChart | Table | TagBlock | Form | Buttons | IconButton | Steps | InlineHeader | EntityList | EditableTable | SnippetCardBlock | OverviewCardBlock | ContextCardBlock | CompositeCardBlock | VisualCardBlock)[], size?: "sm" | "md" | "lg") — Modal dialog. open is a reactive $boolean binding — set to true to open, X/Escape/backdrop auto-closes. Put Form with buttons inside children.\n- For grid-like layouts, use Stack with direction "row" and wrap set to true.\n- Prefer justify "start" (or omit justify) with wrap=true for stable columns instead of uneven gutters.\n- Use nested Stacks when you need explicit rows/sections.\n- Show/hide sections: $editId != "" ? Card([editForm]) : null\n- Modal: Modal("Title", $showModal, [content]) — $showModal is boolean, X/Escape auto-closes. Put Form with its own buttons inside children.\n- Use Tabs for alternative views (chart types, data sections) — no $variable needed\n- Shared filter across Tabs: same $days binding in Query args works across all TabItems\n\n### Content\nCard(children: (TextContent | MarkDownRenderer | CardHeader | Callout | TextCallout | CodeBlock | Image | ImageBlock | ImageGallery | Separator | HorizontalBarChart | RadarChart | PieChart | RadialChart | SingleStackedBarChart | ScatterChart | AreaChart | BarChart | LineChart | Table | TagBlock | Form | Buttons | IconButton | Steps | InlineHeader | EntityList | EditableTable | SnippetCardBlock | OverviewCardBlock | ContextCardBlock | CompositeCardBlock | VisualCardBlock | Tabs | Carousel | Stack)[], variant?: "card" | "sunk" | "clear", direction?: "row" | "column", gap?: "none" | "xs" | "s" | "m" | "l" | "xl" | "2xl", align?: "start" | "center" | "end" | "stretch" | "baseline", justify?: "start" | "center" | "end" | "between" | "around" | "evenly", wrap?: boolean) — Styled container. variant: "card" (default, elevated) | "sunk" (recessed) | "clear" (transparent). Always full width. Accepts all Stack flex params (default: direction "column"). Cards flex to share space in row/wrap layouts.\nCardHeader(title?: string, subtitle?: string) — Header with optional title and subtitle\nTextContent(text: string, size?: "small" | "default" | "large" | "small-heavy" | "large-heavy") — Text block. Supports markdown. Optional size: "small" | "default" | "large" | "small-heavy" | "large-heavy".\nMarkDownRenderer(textMarkdown: string, variant?: "clear" | "card" | "sunk") — Renders markdown text with optional container variant\nCallout(variant: "info" | "warning" | "error" | "success" | "neutral", title: string, description: string, visible?: $binding<boolean>) — Callout banner. Optional visible is a reactive $boolean — auto-dismisses after 3s by setting $visible to false.\nTextCallout(variant?: "neutral" | "info" | "warning" | "success" | "danger", title?: string, description?: string) — Text callout with variant, title, and description\nImage(alt: string, src?: string) — Image with alt text and optional URL\nImageBlock(src: string, alt?: string) — Image block with loading state\nImageGallery(images: {src: string, alt?: string, details?: string}[]) — Gallery grid of images with modal preview\nCodeBlock(language: string, codeString: string) — Syntax-highlighted code block\nInlineHeader(heading: string, description?: string) — Compact section heading with an optional one-line description, for use inside cards.\n- InlineHeader is a compact heading + description pair for labelling a block (lighter than CardHeader).\n- Use Cards to group related KPIs or sections. Stack with direction "row" for side-by-side layouts.\n- Success toast: Callout("success", "Saved", "Done.", $showSuccess) — use @Set($showSuccess, true) in save action, auto-dismisses after 3s. For errors: result.status == "error" ? Callout("error", "Failed", result.error) : null\n- KPI card: Card([TextContent("Label", "small"), TextContent("" + @Count(@Filter(data.rows, "field", "==", "value")), "large-heavy")])\n\n### Tables\nTable(columns: Col[]) — Data table — column-oriented. Each Col holds its own data array.\nCol(label: string, data: any, type?: "string" | "number" | "action") — Column definition — holds label + data array\nEditableTable(name?: string, columns?: {type: "text" | "number" | "date-single" | "select" | "url", key?: string, header?: string, width?: number, options?: {value: string, label: string}[]}[], data?: {id: string, values: (string | number)[]}[]) — Spreadsheet-like table whose cells the user can edit inline (text, number, url, date, select columns); edits are saved back as a form field\n- EditableTable lets the user edit cells inline. Give it a unique name, columns of { type, key, header } with type one of text | number | date-single | select | url (select also needs options: [{ value, label }]).\n- data is an array of { id, values } rows where values are ordered positionally to match columns. Edited data is submitted when the user clicks Save Changes.\n- Table is COLUMN-oriented: Table([Col("Label", dataArray), Col("Count", countArray, "number")]). Use array pluck for data: data.rows.fieldName\n- Col data can be component arrays for styled cells: Col("Status", @Each(data.rows, "item", Tag(item.status, null, "sm", item.status == "open" ? "success" : "danger")))\n- Row actions: Col("Actions", @Each(data.rows, "t", Button("Edit", Action([@Set($showEdit, true), @Set($editId, t.id)]))))\n- Sortable: sorted = @Sort(data.rows, $sortField, "desc"). Bind $sortField to Select. Use sorted.fieldName for Col data\n- Searchable: filtered = @Filter(data.rows, "title", "contains", $search). Bind $search to Input\n- Chain sort + filter: filtered = @Filter(...) then sorted = @Sort(filtered, ...) — use sorted for both Table and Charts\n- Empty state: @Count(data.rows) > 0 ? Table([...]) : TextContent("No data yet")\n\n### Charts (2D)\nBarChart(labels: string[], series: Series[], variant?: "grouped" | "stacked", xLabel?: string, yLabel?: string, height?: number) — Vertical bars; use for comparing values across categories with one or more series\nLineChart(labels: string[], series: Series[], variant?: "linear" | "natural" | "step", xLabel?: string, yLabel?: string, height?: number) — Lines over categories; use for trends and continuous data over time\nAreaChart(labels: string[], series: Series[], variant?: "linear" | "natural" | "step", xLabel?: string, yLabel?: string, height?: number) — Filled area under lines; use for cumulative totals or volume trends over time\nRadarChart(labels: string[], series: Series[]) — Spider/web chart; use for comparing multiple variables across one or more entities\nHorizontalBarChart(labels: string[], series: Series[], variant?: "grouped" | "stacked", xLabel?: string, yLabel?: string) — Horizontal bars; prefer when category labels are long or for ranked lists\nSeries(category: string, values: number[]) — One data series\n- Charts accept column arrays: LineChart(labels, [Series("Name", values)]). Use array pluck: LineChart(data.rows.day, [Series("Views", data.rows.views)])\n- Use Cards to wrap charts with CardHeader for titled sections\n- Chart + Table from same source: use @Sort or @Filter result for both LineChart and Table Col data\n- Multiple chart views: use Tabs — Tabs([TabItem("line", "Line", [LineChart(...)]), TabItem("bar", "Bar", [BarChart(...)])])\n\n### Charts (1D)\nPieChart(labels: string[], values: number[], variant?: "pie" | "donut", appearance?: "circular" | "semiCircular") — Circular slices; use plucked arrays: PieChart(data.categories, data.values)\nRadialChart(labels: string[], values: number[]) — Radial bars; use plucked arrays: RadialChart(data.categories, data.values)\nSingleStackedBarChart(labels: string[], values: number[]) — Single horizontal stacked bar; use plucked arrays: SingleStackedBarChart(data.categories, data.values)\nSlice(category: string, value: number) — One slice with label and numeric value\n- PieChart and BarChart need NUMBERS, not objects. For list data, use @Count(@Filter(...)) to aggregate:\n- PieChart from list: `PieChart(["Low", "Med", "High"], [@Count(@Filter(data.rows, "priority", "==", "low")), @Count(@Filter(data.rows, "priority", "==", "medium")), @Count(@Filter(data.rows, "priority", "==", "high"))], "donut")`\n- KPI from count: `TextContent("" + @Count(@Filter(data.rows, "status", "==", "open")), "large-heavy")`\n\n### Charts (Scatter)\nScatterChart(datasets: ScatterSeries[], xLabel?: string, yLabel?: string) — X/Y scatter plot; use for correlations, distributions, and clustering\nScatterSeries(name: string, points: Point[]) — Named dataset\nPoint(x: number, y: number, z?: number) — Data point with numeric coordinates\n\n### Forms\nForm(name: string, buttons: Buttons, fields?: FormControl[]) — Form container with fields and explicit action buttons\nFormControl(label: string, input: Input | TextArea | Select | DatePicker | Slider | CheckBoxGroup | RadioGroup | Chips | OptionCards, hint?: string) — Field with label, input component, and optional hint text\nLabel(text: string) — Text label\nInput(name: string, placeholder?: string, type?: "text" | "email" | "password" | "number" | "url", rules?: {required?: boolean, email?: boolean, url?: boolean, numeric?: boolean, min?: number, max?: number, minLength?: number, maxLength?: number, pattern?: string}, value?: $binding<string>)\nTextArea(name: string, placeholder?: string, rows?: number, rules?: {required?: boolean, email?: boolean, url?: boolean, numeric?: boolean, min?: number, max?: number, minLength?: number, maxLength?: number, pattern?: string}, value?: $binding<string>)\nSelect(name: string, items: SelectItem[], placeholder?: string, rules?: {required?: boolean, email?: boolean, url?: boolean, numeric?: boolean, min?: number, max?: number, minLength?: number, maxLength?: number, pattern?: string}, value?: $binding<string>, size?: "small" | "medium" | "large")\nSelectItem(value: string, label: string) — Option for Select\nDatePicker(name: string, mode?: "single" | "range", rules?: {required?: boolean, email?: boolean, url?: boolean, numeric?: boolean, min?: number, max?: number, minLength?: number, maxLength?: number, pattern?: string}, value?: $binding<any>)\nSlider(name: string, variant: "continuous" | "discrete", min: number, max: number, step?: number, defaultValue?: number[], label?: string, rules?: {required?: boolean, email?: boolean, url?: boolean, numeric?: boolean, min?: number, max?: number, minLength?: number, maxLength?: number, pattern?: string}, value?: $binding<number[]>) — Numeric slider input; supports continuous and discrete (stepped) variants\nCheckBoxGroup(name: string, items: CheckBoxItem[], rules?: {required?: boolean, email?: boolean, url?: boolean, numeric?: boolean, min?: number, max?: number, minLength?: number, maxLength?: number, pattern?: string}, value?: $binding<Record<string, boolean>>)\nCheckBoxItem(label: string, description: string, name: string, defaultChecked?: boolean)\nRadioGroup(name: string, items: RadioItem[], defaultValue?: string, rules?: {required?: boolean, email?: boolean, url?: boolean, numeric?: boolean, min?: number, max?: number, minLength?: number, maxLength?: number, pattern?: string}, value?: $binding<string>)\nRadioItem(label: string, description: string, value: string)\nSwitchGroup(name: string, items: SwitchItem[], variant?: "clear" | "card" | "sunk", value?: $binding<Record<string, boolean>>) — Group of switch toggles\nSwitchItem(label?: string, description?: string, name: string, defaultChecked?: boolean) — Individual switch toggle\nChips(name: string, type?: "single" | "multiple", items?: ChipItem[], rules?: {required?: boolean, email?: boolean, url?: boolean, numeric?: boolean, min?: number, max?: number, minLength?: number, maxLength?: number, pattern?: string}, defaultValue?: string | string[]) — A form field of compact selectable chips for choosing one or many short options; the selection is stored under `name`.\nChipItem(value: string, label: string, icon?: Icon, disabled?: boolean) — A single selectable chip inside a Chips group, with a value, label and optional icon.\nOptionCards(name: string, type?: "single" | "multiple", items?: OptionCard[], rules?: {required?: boolean, email?: boolean, url?: boolean, numeric?: boolean, min?: number, max?: number, minLength?: number, maxLength?: number, pattern?: string}, defaultValue?: string | string[]) — A form field of selectable cards (title, optional subtitle, optional icon or image) laid out in a responsive grid for choosing one or many options; the selection is stored under `name`.\nOptionCard(value: string, title: string, subtitle?: string, topContent?: Icon | Image, disabled?: boolean) — A single selectable card inside an OptionCards group, with a value, title, optional subtitle and an optional Icon or Image on top.\n- Chips: compact single/multiple selection pills. Use ChipItem references for each option.\n- OptionCards: larger selectable cards with title, subtitle and an optional Icon or Image on top. Use OptionCard references for each option.\n- For Form fields, define EACH FormControl as its own reference — do NOT inline all controls in one array. This allows progressive field-by-field streaming.\n- NEVER nest Form inside Form — each Form should be a standalone container.\n- Form requires explicit buttons. Always pass a Buttons(...) reference as the third Form argument.\n- rules is an optional object: {required: true, email: true, minLength: 8, maxLength: 100}\n- Available rules: required, email, min, max, minLength, maxLength, pattern, url, numeric\n- The renderer shows error messages automatically — do NOT generate error text in the UI\n- Conditional fields: $country == "US" ? stateField : $country == "UK" ? postcodeField : addressField\n- Edit form in Modal: Modal("Edit", $showEdit, [Form("edit", Buttons([saveBtn, cancelBtn]), [fields...])]). Save button should include @Set($showEdit, false) to close modal.\n\n### Buttons\nButton(label: string, action?: ActionExpression, variant?: "primary" | "secondary" | "tertiary", type?: "normal" | "destructive", size?: "extra-small" | "small" | "medium" | "large") — Clickable button\nButtons(buttons: Button[], direction?: "row" | "column") — Group of Button components. direction: "row" (default) | "column".\nIconButton(name: string, icon: Icon, action?: ActionExpression, variant?: "primary" | "secondary" | "tertiary", size?: "extra-small" | "small" | "medium" | "large", shape?: "square" | "circle") — Icon-only button. name is the accessible label and the action label; icon is an Icon; action fires on click.\n- Icon renders a lucide icon by kebab-case name; it is also used as the icon of IconButton, IconText and OptionCard.\n- Toggle in @Each: @Each(rows, "t", Button(t.status == "open" ? "Close" : "Reopen", Action([...])))\n\n### Data Display\nTagBlock(tags: string[], size?: "sm" | "md" | "lg") — tags is an array of strings; optional size sm | md | lg\nTag(text: string, icon?: Icon, size?: "sm" | "md" | "lg", variant?: "neutral" | "info" | "success" | "warning" | "danger") — Styled tag/badge with optional Icon and variant\nIcon(name: string, category?: string) — A lucide icon by kebab-case name (e.g. \'circle-check\'). Optional category picks a topical fallback when the name doesn\'t resolve.\nEntityList(rows?: {left: string, right: string, rightVariant?: "text" | "number"}[], size?: "small" | "default", header?: {left: string, right: string, rightVariant?: "text" | "number"}, footer?: {left: string, right: string, rightVariant?: "text" | "number"}) — Two-column key/value rows (left label, right value). size \'default\' supports optional header and footer rows; rightVariant \'number\' uses tabular numbers.\nListBlock(items: ListItem[], variant?: "number" | "image", size?: "default" | "small") — A list of items with number or image indicators. Each item can optionally have an action. size small renders a compact list.\nListItem(title: string, subtitle?: string, image?: {src: string, alt: string}, actionLabel?: string, action?: ActionExpression) — Item in a ListBlock — displays a title with an optional subtitle and image. When action is provided, the item becomes clickable.\n- Color-mapped Tag: Tag(value, null, "sm", value == "high" ? "danger" : value == "medium" ? "warning" : "neutral")\n- EntityList is a compact two-column list of { left, right } rows (e.g. name / value). size=\'default\' also supports a header and footer row; size=\'small\' does not.\n- ListBlock is a numbered or image list of ListItem references. An action on ListItem is optional.\n\n### Cards\nSnippetCardBlock(items: SnippetCardItem[], layout?: "grid", responsive?: boolean, action?: ActionExpression, gap?: number | string) — A responsive grid of compact label/value cards (2 per row) for showing several short facts side by side; optionally clickable with a shared action.\nSnippetCardItem(id?: string, lhs: IconText | ImageText, rhs?: Text | BoldText) — One row-style snippet card: a label on the left (IconText or ImageText) and an optional value on the right (Text or BoldText).\nOverviewCardBlock(items: OverviewCardItem[], layout?: "grid" | "carousel", responsive?: boolean, action?: ActionExpression, gap?: number | string) — A grid or horizontal carousel of compact overview cards, each with a heading (icon/image/text) on top and an inline metric below; optionally clickable with a shared action.\nOverviewCardItem(id?: string, top: IconText | ImageText | Text, bottom?: MetricIndicatorInline) — One overview card: a heading slot at the top (IconText, ImageText or Text) and an optional MetricIndicatorInline at the bottom.\nContextCardBlock(items: ContextCardItem[], layout?: "grid" | "carousel", responsive?: boolean, action?: ActionExpression, gap?: number | string) — A grid or carousel of compact tinted context cards (title or tag plus a short bold body); an optional action makes every card clickable.\nContextCardItem(id?: string, title: string | Tag, body?: string, bgColor?: "gray", bgImageSrc?: string, bgImageAlt?: string) — A single card inside a ContextCardBlock: a title (plain string or Tag), an optional markdown body, and an optional gray tint or background image.\nCompositeCardBlock(items: CompositeCardItem[], layout?: "grid" | "carousel", responsive?: boolean, action?: ActionExpression, gap?: number | string) — A two-per-row grid or carousel of rich cards, each with an optional header, stacked body content (text, metrics, charts, lists, tags) and a price/button footer; an optional action makes every card clickable.\nCompositeCardItem(id?: string, header?: IconText | ImageText | ImageTextLarge | Text | Image, body?: (Text | BoldText | MetricIndicatorInline | IconText | Image | AreaChart | BarChart | LineChart | ListBlock | TagBlock | EntityList)[], footer?: {price?: BoldText | MetricIndicatorWithStrikethrough, button?: Button}) — A single card inside a CompositeCardBlock: an optional header (icon/image/text), a stack of body elements (text, metrics, charts, lists, tags), and an optional price/button footer.\nVisualCardBlock(items: VisualCardItem[], layout?: "grid" | "carousel", responsive?: boolean, action?: ActionExpression, gap?: number | string) — A grid or carousel of photo-first cards: a full-bleed background image with a tag on top and a bold text panel at the bottom; an optional action makes every card clickable.\nVisualCardItem(body: BoldText, id?: string, bgImageSrc?: string, tag?: Tag, bgImageAlt?: string) — A single photo-first card inside a VisualCardBlock: a BoldText body panel, an optional Tag, and a background image (bgImageSrc must be a real URL; bgImageAlt is its alt text).\nText(variant?: "text" | "number", value: string, subtext?: string, subtextVariant?: "text" | "number" | "metric", size?: "xs" | "sm" | "md" | "lg") — Plain text line with optional subtext. variant \'number\' uses tabular number styling; subtextVariant \'metric\' colors a leading +/- subtext green/red.\nBoldText(variant?: "text" | "number", value: string, subtext?: string, subtextVariant?: "text" | "number" | "metric", size?: "xs" | "sm" | "md" | "lg") — Emphasized (bold) text line with optional subtext. variant \'number\' uses tabular number styling; subtextVariant \'metric\' colors a leading +/- subtext green/red.\nIconText(icon: Icon, iconVariant?: "neutral" | "info" | "success" | "warning" | "danger" | "inverted" | "filled" | "soft", iconSize?: "xs" | "s" | "m" | "l" | "xl" | "sm" | "md" | "lg", title: string, subtitle?: string, bold?: boolean, layout?: "horizontal" | "vertical") — An icon badge with a title and optional subtitle, laid out horizontally or vertically. iconVariant sets the badge color.\nImageText(src: string, alt?: string, title: string, subtitle?: string, bold?: boolean, layout?: "horizontal" | "vertical", imageSize?: number) — A small square image (thumbnail/avatar) with a title and optional subtitle. src must be a real image URL.\nImageTextLarge(src: string, alt?: string, title: string, subtitle?: string, bold?: boolean) — A full-width banner image above a bold title and optional subtitle. src must be a real image URL.\nMetricIndicatorInline(value: string, subtext?: string, trend?: {direction: "up" | "down", value: number}) — Headline metric value with an optional +/- percentage trend and subtext, all on one line.\nMetricIndicatorWithStrikethrough(value: string, subtext?: string, previousValue?: string, trend?: {direction: "up" | "down", value: number}) — Headline metric value with an optional struck-through previousValue, a +/- percentage trend, and subtext below.\n- Card blocks lay out 2+ items in a responsive grid (or carousel where supported). Every item in a block must have the same structure.\n- SnippetCardItem: small card with lhs (IconText | ImageText) and optional rhs (Text | BoldText) — good for key/value facts.\n- OverviewCardItem: small card with top (IconText | ImageText | Text) and optional bottom MetricIndicatorInline — good for KPIs.\n- ContextCardItem: medium card with a title (string or Tag), body text and optional background image — good for summaries.\n- CompositeCardItem: rich card with header, body array (Text, BoldText, MetricIndicatorInline, IconText, Image, charts, ListBlock, TagBlock, EntityList) and footer (price + Button) — good for products/offers.\n- VisualCardItem: image-first card with a BoldText body and optional Tag.\n- Text / BoldText / IconText / ImageText / ImageTextLarge / MetricIndicator* are the inline building blocks used INSIDE card items; do not place them directly in the root Card.\n\n## Action — Button Behavior\n\nAn action wires a button click to operations. Pass one @-prefixed step bare, e.g. Button("Ask", @ToAssistant("Tell me more")). Put several steps in Action([...]), e.g. Button("Read", Action([@OpenUrl("https://example.com"), @ToAssistant("Summarize this page")])). Steps execute in order.\nButtons without an action automatically send their label to the assistant (equivalent to @ToAssistant(label)).\n\nAvailable steps:\n- @ToAssistant(message: string, context?: any) — Send a message to the assistant (for conversational buttons like "Tell me more", "Explain this"). The optional context is any value (object, array, string, number) passed to the assistant as hidden data, e.g. @ToAssistant("Show details", {orderId: 42})\n- @OpenUrl(url: string) — Navigate to a URL\n- @Answer(value: any) — Submit the user\'s answer to the agent that asked and resume it. value is any JSON value, typically an object built from form state. Use for every choice, confirmation or form submit that the agent waits for.\n\nExample — simple nav:\n```\nviewBtn = Button("View", @OpenUrl("https://example.com"))\n```\n\n- An action can be assigned to a variable or inlined: Button("Go", onSubmit) and Button("Go", Action([...])) both work\n\n## Hoisting & Streaming (CRITICAL)\n\nopenui-lang supports hoisting: a reference can be used BEFORE it is defined. The parser resolves all references after the full input is parsed.\n\nDuring streaming, the output is re-parsed on every chunk. Undefined references are temporarily unresolved and appear once their definitions stream in. This creates a progressive top-down reveal — structure first, then data fills in.\n\n**Recommended statement order for optimal streaming:**\n1. `root = Stack(...)` — UI shell appears immediately\n2. Component definitions — fill in as they stream\n3. Data values — leaf content last\n\nAlways write the root = Stack(...) statement first so the UI shell appears immediately, even before child data has streamed in.\n\n## Examples\n\nExample 1 — Table (column-oriented):\n\nroot = Stack([title, tbl])\ntitle = TextContent("Top Languages", "large-heavy")\ntbl = Table([Col("Language", langs), Col("Users (M)", users), Col("Year", years)])\nlangs = ["Python", "JavaScript", "Java", "TypeScript", "Go"]\nusers = [15.7, 14.2, 12.1, 8.5, 5.2]\nyears = [1991, 1995, 1995, 2012, 2009]\n\nExample 2 — Bar chart:\n\nroot = Stack([title, chart])\ntitle = TextContent("Q4 Revenue", "large-heavy")\nchart = BarChart(labels, [s1, s2], "grouped")\nlabels = ["Oct", "Nov", "Dec"]\ns1 = Series("Product A", [120, 150, 180])\ns2 = Series("Product B", [90, 110, 140])\n\nExample 3 — Form with validation:\n\nroot = Stack([title, form])\ntitle = TextContent("Contact Us", "large-heavy")\nform = Form("contact", btns, [nameField, emailField, countryField, msgField])\nnameField = FormControl("Name", Input("name", "Your name", "text", { required: true, minLength: 2 }))\nemailField = FormControl("Email", Input("email", "you@example.com", "email", { required: true, email: true }))\ncountryField = FormControl("Country", Select("country", countryOpts, "Select...", { required: true }))\nmsgField = FormControl("Message", TextArea("message", "Tell us more...", 4, { required: true, minLength: 10 }))\ncountryOpts = [SelectItem("us", "United States"), SelectItem("uk", "United Kingdom"), SelectItem("de", "Germany")]\nbtns = Buttons([Button("Submit", @ToAssistant("Submit"), "primary"), Button("Cancel", @ToAssistant("Cancel"), "secondary")])\n\nExample 4 — Tabs with mixed content:\n\nroot = Stack([title, tabs])\ntitle = TextContent("React vs Vue", "large-heavy")\ntabs = Tabs([tabReact, tabVue])\ntabReact = TabItem("react", "React", reactContent)\ntabVue = TabItem("vue", "Vue", vueContent)\nreactContent = [TextContent("React is a library by Meta for building UIs."), Callout("info", "Note", "React uses JSX syntax.")]\nvueContent = [TextContent("Vue is a progressive framework by Evan You."), Callout("success", "Tip", "Vue has a gentle learning curve.")]\n\nExample 5 — KPI and product cards:\n\nroot = Stack([kpiHeader, kpiBlock, productsHeader, productCards])\nkpiHeader = InlineHeader("This Month", "Key account metrics")\nkpiBlock = SnippetCardBlock([kpi1, kpi2, kpi3])\nkpi1 = SnippetCardItem("revenue", kpi1lhs, kpi1rhs)\nkpi1lhs = IconText(kpi1icon, "neutral", "m", "Revenue", "Month to date", false, "horizontal")\nkpi1icon = Icon("circle-dollar-sign", "finance")\nkpi1rhs = BoldText("number", "$48,200", "+8.1%", "metric")\nkpi2 = SnippetCardItem("active-users", kpi2lhs, kpi2rhs)\nkpi2lhs = IconText(kpi2icon, "neutral", "m", "Active Users", "This month", false, "horizontal")\nkpi2icon = Icon("users", "people")\nkpi2rhs = BoldText("number", "1,204", "+3.4%", "metric")\nkpi3 = SnippetCardItem("churn", kpi3lhs, kpi3rhs)\nkpi3lhs = IconText(kpi3icon, "neutral", "m", "Churn", "This month", false, "horizontal")\nkpi3icon = Icon("user-minus", "people")\nkpi3rhs = BoldText("number", "1.8%", "-0.3%", "metric")\nproductsHeader = InlineHeader("Top Products", "By units sold")\nproductCards = CompositeCardBlock([p1, p2])\np1 = CompositeCardItem("widget-pro", p1header, [p1body], p1footer)\np1header = IconText(p1icon, "neutral", "m", "Widget Pro", "Best seller", true, "horizontal")\np1icon = Icon("package", "shopping")\np1body = MetricIndicatorInline("2,410 units", "Sold this month", { direction: "up", value: 12 })\np1footer = { price: BoldText("text", "$29.00"), button: p1btn }\np1btn = Button("View Details", @ToAssistant("Show details for Widget Pro"), "secondary")\np2 = CompositeCardItem("widget-mini", p2header, [p2body], p2footer)\np2header = IconText(p2icon, "neutral", "m", "Widget Mini", "New arrival", true, "horizontal")\np2icon = Icon("box", "shopping")\np2body = MetricIndicatorInline("980 units", "Sold this month", { direction: "up", value: 4 })\np2footer = { price: BoldText("text", "$14.00"), button: p2btn }\np2btn = Button("View Details", @ToAssistant("Show details for Widget Mini"), "secondary")\n\nExample 6 — Editable table and a selection form:\n\nroot = Stack([tableHeader, editTable, formHeader, prefsForm])\ntableHeader = InlineHeader("Team Roster", "Click a cell to edit")\neditTable = EditableTable("roster", [colName, colRole, colStart], [row1, row2])\ncolName = { type: "text", key: "name", header: "Name" }\ncolRole = { type: "select", key: "role", header: "Role", options: [roleEng, roleDesign] }\nroleEng = { value: "eng", label: "Engineering" }\nroleDesign = { value: "design", label: "Design" }\ncolStart = { type: "date-single", key: "start", header: "Start Date" }\nrow1 = { id: "1", values: ["Alex Kim", "eng", "2024-01-15"] }\nrow2 = { id: "2", values: ["Jamie Lee", "design", "2024-03-02"] }\nformHeader = InlineHeader("Preferences", "Tell us how you like to work")\nprefsForm = Form("prefs", formButtons, [fc1, fc2])\nfc1 = FormControl("Working Style", styleCards, "Pick the one that fits best")\nstyleCards = OptionCards("style", "single", [style1, style2])\nstyle1 = OptionCard("focused", "Deep Focus", "Long uninterrupted blocks", style1icon)\nstyle1icon = Icon("target", "tools")\nstyle2 = OptionCard("collab", "Collaborative", "Frequent pairing and syncs", style2icon)\nstyle2icon = Icon("users", "people")\nfc2 = FormControl("Tools", toolChips, "Select all that apply")\ntoolChips = Chips("tools", "multiple", [tool1, tool2, tool3])\ntool1 = ChipItem("figma", "Figma", tool1icon)\ntool1icon = Icon("figma", "design")\ntool2 = ChipItem("slack", "Slack", tool2icon)\ntool2icon = Icon("message-square", "communication")\ntool3 = ChipItem("notion", "Notion", tool3icon)\ntool3icon = Icon("notebook", "text")\nformButtons = Buttons([Button("Save", @ToAssistant("Save preferences"), "primary")])\n\n## Important Rules\n- Choose components that best represent the content (tables for comparisons, charts for trends, forms for input, etc.)\n\n## Final Verification\nBefore finishing, walk your output and verify:\n1. root = Stack(...) is the FIRST line (for optimal streaming).\n2. Every referenced name is defined. Every defined name (other than root) is reachable from root.\n\n- When asked about data, generate realistic/plausible data\n- For grid-like layouts, use Stack with direction "row" and wrap=true. Avoid justify="between" unless you specifically want large gutters.\n- For forms, define one FormControl reference per field so controls can stream progressively.\n- For forms, always provide the second Form argument with Buttons(...) actions: Form(name, buttons, fields).\n- Never nest Form inside Form.\n- Use @Reset($var1, $var2) after form submit to restore defaults — not @Set($var, "")\n- Multi-query refresh: Action([@Run(mutation), @Run(query1), @Run(query2), @Reset(...)])\n- $variables are reactive: changing via Select or @Set re-evaluates all Queries and expressions referencing them\n- Use existing components (Tabs, Accordion, Modal) before inventing ternary show/hide patterns\n- Card blocks (SnippetCardBlock, OverviewCardBlock, ContextCardBlock, CompositeCardBlock, VisualCardBlock) need at least 2 items; every item in a block must have the same structure.\n- Text / BoldText / IconText / ImageText / ImageTextLarge / MetricIndicatorInline / MetricIndicatorWithStrikethrough are inline building blocks used INSIDE card items — do not place them directly in a Stack or Card.\n- EntityList size=\'small\' (no header/footer) is only for use inside a CompositeCardItem body; use size=\'default\' everywhere else.\n- Image URLs must be real (from a tool result or the user) — never invent or template an image URL.\n- Always pass a category to Icon — it enables a topical fallback when the exact icon name is unavailable.\n- EditableTable requires the consuming app to persist edits — use it only when the user or app explicitly asks for an editable table; default to Table for read-only data.\n- You are writing UI for Oqto. It renders natively on web, desktop, phone and terminals in the user\'s own theme: never mention colours, fonts or styling.\n- When you need a decision or input from the user, end with a Button or Form whose action is @Answer(...) and then stop; the answer comes back as the tool result.\n- Only use @OpenUrl for links the user asked for. Never use @ToAssistant to answer on the user\'s behalf.\n- Always state key numbers in text as well as in charts, so the answer is readable without graphics.\n- Prefer one clear Card per answer. Use Tabs, Accordion or Steps to structure long content instead of very long Stacks.';

// pi-openui/vendor-src/fixtures.gen.ts
var FIXTURES = {
  "compare-options": `root = Stack([card])
card = Card([head, form])
head = CardHeader("Pick a sandbox profile", "For the new workspace ~/work/sldr")
form = Form("profile", btns, [FormControl("Profile", cards, "You can change this later in workspace settings."), FormControl("Network", net), FormControl("Extra write paths", paths)])
cards = OptionCards("profile", "single", [OptionCard("minimal", "Minimal", "Home readable, /tmp writable"), OptionCard("development", "Development", "Toolchains + caches, no secrets"), OptionCard("strict", "Strict", "Workspace only, no network")], null, "development")
net = Chips("network", "single", [ChipItem("open", "Open"), ChipItem("proxy", "Via proxy"), ChipItem("isolated", "Isolated")], null, "proxy")
paths = Input("paths", "~/.cache/sldr")
btns = Buttons([Button("Create workspace", @Answer({profile: $profile, network: $network, paths: $paths})), Button("Cancel", @Answer({cancelled: true}), "tertiary")])
`,
  dashboard: `root = Stack([card])
card = Card([head, kpis, tabs])
head = CardHeader("oqto · week 43", "Runner fleet and test health")
kpis = OverviewCardBlock([k1, k2, k3, k4], "grid")
k1 = OverviewCardItem("sessions", Text("text", "Sessions"), MetricIndicatorInline("1,284", "this week", {direction: "up", value: 12}))
k2 = OverviewCardItem("tests", Text("text", "Test pass rate"), MetricIndicatorInline("98.7%", "of 2,941", {direction: "up", value: 1.2}))
k3 = OverviewCardItem("deploys", Text("text", "Deploys"), MetricIndicatorInline("14", "3 rolled back", {direction: "down", value: 8}))
k4 = OverviewCardItem("p95", Text("text", "p95 latency"), MetricIndicatorInline("412 ms", "runner RPC", {direction: "down", value: 5}))
tabs = Tabs([t1, t2, t3])
t1 = TabItem("activity", "Activity", [area, note])
area = AreaChart(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], [Series("Sessions", [160, 210, 198, 240, 231, 120, 125]), Series("Failed", [4, 9, 3, 6, 2, 1, 1])], "natural")
note = TextContent("Peak on Thursday: 240 sessions, 6 failed.", "small")
t2 = TabItem("tests", "Tests", [bars, failing])
bars = HorizontalBarChart(["runner", "history", "personal", "sandbox"], [Series("Passed", [196, 61, 27, 180]), Series("Failed", [0, 2, 0, 0])], "stacked")
failing = Callout("warning", "2 failing in history", "native_head and reader_lifecycle since 4f2a9c1.")
t3 = TabItem("hosts", "Hosts", [hosts])
hosts = Table([Col("Host", ["archvm", "mac-studio", "azure-69"]), Col("Runner", ["0.5.11", "0.5.11", "0.5.9"]), Col("Sessions", [42, 18, 311], "number"), Col("State", ["healthy", "healthy", "degraded"])])
`,
  "editable-table": `root = Stack([card])
card = Card([head, grid, buttons])
head = CardHeader("Release checklist 0.5.12", "Edit owners and dates, then confirm")
grid = EditableTable("checklist", [{type: "text", key: "task", header: "Task"}, {type: "select", key: "owner", header: "Owner", options: [{value: "tommy", label: "Tommy"}, {value: "agent", label: "Agent"}]}, {type: "date-single", key: "due", header: "Due"}, {type: "number", key: "est", header: "Hours"}], [{id: "1", values: ["Qualify Mac runner", "agent", "2026-10-29", 3]}, {id: "2", values: ["Phone pairing acceptance", "tommy", "2026-10-30", 1]}, {id: "3", values: ["Publish SDK 0.4.0", "agent", "2026-10-31", 2]}])
buttons = Buttons([Button("Confirm checklist", @Answer({confirmed: true}))])
`,
  "gallery-followups": `root = Stack([card, next])
card = Card([head, gallery, md])
head = CardHeader("Logo directions", "Three candidates from the Logo Factory run")
gallery = ImageGallery([{src: "https://example.invalid/owl-a.png", alt: "Owl A, geometric", details: "Sharp, mono line"}, {src: "https://example.invalid/owl-b.png", alt: "Owl B, rounded", details: "Soft, friendly"}, {src: "https://example.invalid/owl-c.png", alt: "Owl C, pixel", details: "Departure Mono feel"}])
md = MarkDownRenderer("**Recommendation:** Owl A fits the sharp oqto identity; B suits moss.")
next = ListBlock([ListItem("Refine Owl A", "Three weight variants", null, "Go", @Answer("refine-a")), ListItem("Compare in context", "Render on app icon and favicon", null, "Go", @Answer("context")), ListItem("Start over", "New brief", null, "Go", @Answer("restart"))])
`,
  "invalid-unknown": `root = Stack([card])
card = Card([x, ok])
x = Hologram("nope")
ok = TextContent("still renders")
`,
  "plan-approve": `root = Stack([card])
card = Card([head, steps, risks, buttons])
head = CardHeader("Migrate pairing store", "Plan for oqto-8x3p.10.7.8 · needs your approval")
steps = Steps([StepsItem("Back up", "Hard-link the legacy marker and snapshot the store."), StepsItem("Migrate marker", "Write v2 marker with volume UUID + inode, under the singleton lock."), StepsItem("Restart runner", "One brief restart; native Pi sessions untouched."), StepsItem("Verify", "Listener active, same plan, mTLS health passes.")])
risks = Accordion([AccordionItem("rollback", "Rollback", [TextContent("restore-owner-marker restores the original marker inode; the database is never written.")]), AccordionItem("scope", "What does not change", [TagBlock(["keys", "grants", "tickets", "native sessions"])])])
buttons = Buttons([Button("Approve plan", @Answer({approved: true})), Button("Not now", @Answer({approved: false}), "secondary")])
`
};

// pi-openui/vendor-src/entry.ts
process.env.OPENUI_TELEMETRY_DISABLED = "1";
process.env.DO_NOT_TRACK = "1";
var SYSTEM_PROMPT = prompt_default;
export {
  renderFallback,
  evaluate,
  createOqtoParser,
  SYSTEM_PROMPT,
  PROFILE_VERSION,
  FIXTURES
};
