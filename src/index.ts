import type { ZodType } from "zod";

type AnyZodType = ZodType<any, any, any>;

type AnyFieldPath = string | ReadonlyArray<string | number>;

type SchemaValue<T extends AnyZodType> = T["_output"];

type IsAny<T> = 0 extends 1 & T ? true : false;

type Primitive =
  | string
  | number
  | bigint
  | boolean
  | symbol
  | null
  | undefined
  | Date;

type KeyString<K> = K extends string ? K : K extends number ? `${K}` : never;

type ArrayToken = "[]" | "*";
type NumericToken = `${number}`;
type ArrayIndexToken = ArrayToken | NumericToken;

type Depth = 0 | 1 | 2 | 3 | 4;

type DecDepth<D extends Depth> = D extends 4
  ? 3
  : D extends 3
    ? 2
    : D extends 2
      ? 1
      : D extends 1
        ? 0
        : 0;

type HasIndexSignature<T> = T extends readonly any[]
  ? false
  : string extends keyof T
    ? true
    : number extends keyof T
      ? true
      : symbol extends keyof T
        ? true
        : false;

type TupleKeys<T extends readonly unknown[]> = Exclude<keyof T, keyof any[]>;

type TupleValue<
  T extends readonly unknown[],
  K extends string | number,
> = T[K extends number ? K : K extends `${infer N extends number}` ? N : never];

type ArrayPathString<T, D extends Depth> =
  | ArrayIndexToken
  | (PathString<T, DecDepth<D>> extends never
      ? never
      : `${ArrayToken}.${PathString<T, DecDepth<D>>}`)
  | (PathString<T, DecDepth<D>> extends never
      ? never
      : `${NumericToken}.${PathString<T, DecDepth<D>>}`);

type TuplePathString<
  T extends readonly unknown[],
  D extends Depth,
> = TupleKeys<T> extends never
  ? never
  : {
      [K in TupleKeys<T> & (string | number)]:
        | KeyString<K>
        | (PathString<TupleValue<T, K>, DecDepth<D>> extends never
            ? never
            : `${KeyString<K>}.${PathString<TupleValue<T, K>, DecDepth<D>>}`);
    }[TupleKeys<T> & (string | number)];

type ObjectPathString<T, D extends Depth> = {
  [K in keyof T & (string | number)]:
    | KeyString<K>
    | (PathString<T[K], DecDepth<D>> extends never
        ? never
        : `${KeyString<K>}.${PathString<T[K], DecDepth<D>>}`);
}[keyof T & (string | number)];

type IsTupleArray<T extends readonly unknown[]> = number extends T["length"]
  ? false
  : true;

type PathString<T, D extends Depth = 4> = IsAny<T> extends true
  ? string
  : D extends 0
    ? string
    : T extends Primitive
      ? never
      : T extends readonly (infer U)[]
        ?
            | ArrayPathString<U, D>
            | (IsTupleArray<T> extends true ? TuplePathString<T, D> : never)
        : T extends object
          ? HasIndexSignature<T> extends true
            ? string
            : ObjectPathString<T, D>
          : never;

type StructuredFieldPath<T> = PathString<T> extends never
  ? never
  : PathString<T>;

type FieldPathFor<T extends AnyZodType> = StructuredFieldPath<
  SchemaValue<T>
> extends never
  ? AnyFieldPath
  : StructuredFieldPath<SchemaValue<T>> | ReadonlyArray<string | number>;

export type FieldPath<T extends AnyZodType = AnyZodType> = FieldPathFor<T>;

export function isRequiredField<T extends AnyZodType>(
  schema: T,
  path: FieldPath<T>,
): boolean {
  const segments = normalizePath(path);
  if (segments.length === 0) {
    return false;
  }

  const result = evaluateRequirement(schema, segments, 0);
  return result.matched ? result.required : false;
}

function normalizePath(path: AnyFieldPath): string[] {
  if (typeof path === "string") {
    return path
      .split(".")
      .map((value) => value.trim())
      .filter(Boolean);
  }

  return path
    .map((segment) => String(segment).trim())
    .filter((value) => value.length > 0);
}

type EvalResult = { matched: boolean; required: boolean };

function evaluateRequirement(
  schema: AnyZodType | undefined,
  segments: string[],
  index: number,
): EvalResult {
  if (!schema) {
    return { matched: false, required: false };
  }

  const { schema: base } = unwrapSchema(schema);
  const typeName = getTypeName(base);

  if (!typeName) {
    return { matched: false, required: false };
  }

  if (index >= segments.length) {
    return { matched: true, required: isSampleRejected(schema) };
  }

  if (isIntersectionType(typeName)) {
    const { left, right } = getIntersectionSides(base);
    const leftResult = left
      ? evaluateRequirement(left, segments, index)
      : { matched: false, required: false };
    const rightResult = right
      ? evaluateRequirement(right, segments, index)
      : { matched: false, required: false };
    const matched = leftResult.matched || rightResult.matched;
    if (!matched) {
      return { matched: false, required: false };
    }
    const required =
      (leftResult.matched ? leftResult.required : false) ||
      (rightResult.matched ? rightResult.required : false);
    return { matched: true, required };
  }

  const segment = segments[index];
  const isFinal = index === segments.length - 1;

  if (isObjectType(typeName)) {
    const next = getShape(base)?.[segment];
    if (!next) {
      return { matched: false, required: false };
    }
    if (isFinal) {
      return { matched: true, required: isSampleRejected(next) };
    }
    if (!requiresPresence(next)) {
      return { matched: true, required: false };
    }
    return evaluateRequirement(next, segments, index + 1);
  }

  if (isRecordType(typeName)) {
    const next = getRecordValueType(base);
    if (!next) {
      return { matched: false, required: false };
    }
    if (isFinal) {
      return { matched: true, required: isSampleRejected(next) };
    }
    return evaluateRequirement(next, segments, index + 1);
  }

  if (isArrayType(typeName)) {
    if (!isArrayToken(segment)) {
      return { matched: false, required: false };
    }
    const next = getArrayElement(base);
    if (!next) {
      return { matched: false, required: false };
    }
    if (isFinal) {
      return { matched: true, required: isSampleRejected(next) };
    }
    return evaluateRequirement(next, segments, index + 1);
  }

  if (isTupleType(typeName)) {
    if (!isArrayToken(segment)) {
      return { matched: false, required: false };
    }
    const tupleIndex = parseTupleIndex(segment);
    if (tupleIndex === undefined) {
      return { matched: false, required: false };
    }
    const next = getTupleItem(base, tupleIndex);
    if (!next) {
      return { matched: false, required: false };
    }
    if (isFinal) {
      return { matched: true, required: isSampleRejected(next) };
    }
    return evaluateRequirement(next, segments, index + 1);
  }

  return { matched: false, required: false };
}

function isSampleRejected(schema: AnyZodType): boolean {
  if (!requiresPresence(schema)) {
    return false;
  }
  const sample = createSampleValue(schema);
  return !safeParse(schema, sample);
}

function requiresPresence(schema: AnyZodType): boolean {
  return !safeParse(schema, undefined);
}

function safeParse(schema: AnyZodType, value: unknown): boolean {
  try {
    return schema.safeParse(value).success;
  } catch {
    return false;
  }
}

function createSampleValue(schema: AnyZodType): unknown {
  const { schema: base } = unwrapSchema(schema);
  const typeName = getTypeName(base);

  switch (typeName) {
    case "ZodString":
    case "string":
      return "";
    case "ZodArray":
    case "array":
      return [];
    case "ZodObject":
    case "object":
      return {};
    case "ZodNumber":
    case "number":
    case "ZodBoolean":
    case "boolean":
    case "ZodBigInt":
    case "bigint":
    case "ZodDate":
    case "date":
    default:
      return undefined;
  }
}

const ARRAY_TOKENS = new Set(["*", "[]"]);

function isArrayToken(segment: string): boolean {
  return ARRAY_TOKENS.has(segment) || /^\d+$/.test(segment);
}

function parseTupleIndex(segment: string): number | undefined {
  if (segment === "*" || segment === "[]") {
    return 0;
  }
  const value = Number(segment);
  return Number.isNaN(value) || value < 0 ? undefined : value;
}

function getShape(schema: AnyZodType): Record<string, AnyZodType> | undefined {
  const directShape = (schema as unknown as Record<string, unknown>).shape;
  if (typeof directShape === "object" && directShape !== null) {
    return directShape as Record<string, AnyZodType>;
  }

  const def = getDef(schema);
  if (!def) {
    return undefined;
  }

  if (typeof def.shape === "function") {
    return def.shape();
  }

  if (typeof def.shape === "object") {
    return def.shape;
  }

  return undefined;
}

function getRecordValueType(schema: AnyZodType): AnyZodType | undefined {
  const def = getDef(schema);
  return def?.valueType ?? def?.valueSchema;
}

function getArrayElement(schema: AnyZodType): AnyZodType | undefined {
  const def = getDef(schema);
  return def?.element ?? def?.type;
}

function getTupleItem(
  schema: AnyZodType,
  index: number,
): AnyZodType | undefined {
  const def = getDef(schema);
  if (!def) {
    return undefined;
  }
  const items: AnyZodType[] = def.items ?? [];
  const rest: AnyZodType | undefined | null = def.rest;
  return items[index] ?? rest ?? undefined;
}

function unwrapSchema(schema: AnyZodType): { schema: AnyZodType } {
  let current = schema;
  const seen = new Set<AnyZodType>();

  while (current && !seen.has(current)) {
    seen.add(current);
    const def = getDef(current);
    const typeName = getTypeName(current);

    if (!def || !typeName) {
      break;
    }

    if (
      matchesType(typeName, [
        "ZodOptional",
        "optional",
        "ZodDefault",
        "default",
      ])
    ) {
      current = def.innerType ?? current;
      continue;
    }

    if (matchesType(typeName, ["ZodNullable", "nullable"])) {
      current = def.innerType ?? current;
      continue;
    }

    if (matchesType(typeName, ["ZodLazy", "lazy"])) {
      current = typeof def.getter === "function" ? def.getter() : current;
      continue;
    }

    if (matchesType(typeName, ["ZodCatch", "catch"])) {
      current = def.innerType ?? def.schema ?? current;
      continue;
    }

    if (
      matchesType(typeName, [
        "ZodEffects",
        "effects",
        "ZodPipeline",
        "pipeline",
        "pipe",
      ])
    ) {
      if (def.schema) {
        current = def.schema;
        continue;
      }
      if (def.out) {
        current = def.out;
        continue;
      }
    }

    if (matchesType(typeName, ["ZodBranded", "branded"])) {
      current = def.type ?? def.innerType ?? current;
      continue;
    }

    break;
  }

  return { schema: current };
}

function getIntersectionSides(schema: AnyZodType): {
  left?: AnyZodType;
  right?: AnyZodType;
} {
  const def = getDef(schema);
  if (!def) {
    return {};
  }
  return {
    left: def.left,
    right: def.right,
  };
}

function getDef(schema: AnyZodType): Record<string, any> | undefined {
  const asAny = schema as Record<string, any>;
  return asAny._def ?? asAny.def ?? asAny._zod?.def;
}

function getTypeName(schema: AnyZodType): string | undefined {
  const def = getDef(schema);
  if (!def) {
    return undefined;
  }
  if (typeof def.typeName === "string") {
    return def.typeName;
  }
  if (typeof def.type === "string") {
    return def.type;
  }
  return undefined;
}

function matchesType(
  typeName: string | undefined,
  candidates: readonly string[],
): boolean {
  return Boolean(typeName && candidates.includes(typeName));
}

function isObjectType(typeName?: string): boolean {
  return matchesType(typeName, ["ZodObject", "object"]);
}

function isRecordType(typeName?: string): boolean {
  return matchesType(typeName, ["ZodRecord", "record"]);
}

function isArrayType(typeName?: string): boolean {
  return matchesType(typeName, ["ZodArray", "array"]);
}

function isTupleType(typeName?: string): boolean {
  return matchesType(typeName, ["ZodTuple", "tuple"]);
}

function isIntersectionType(typeName?: string): boolean {
  return matchesType(typeName, ["ZodIntersection", "intersection"]);
}
