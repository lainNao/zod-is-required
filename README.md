# zod-is-required

Tiny helper that tells you whether a field inside a Zod schema is required.  
Describe the target using dot-separated paths (with array wildcards or indices) and `isRequiredField` returns `true` if the field must be present.

```ts
import { z } from "zod";
import { isRequiredField } from "lainnao/zod-is-required";

const Schema = z.object({
  string: z.string(),
  stringMin1: z.string().min(1),
  stringOptional: z.string().optional(),
});

isRequiredField(Schema, "string"); // true
isRequiredField(Schema, "stringMin1"); // true
isRequiredField(Schema, "stringOptional"); // false
```

Also works with other primitives, nested objects, arrays, tuples, and records. Please see the [tests](https://github.com/lainNao/zod-is-required/blob/main/tests/isRequiredField.test.ts) for more examples.

## Installation

The package treats `zod` as a peer dependency, so install it alongside this helper:

```bash
npm install zod zod-is-required
```

## Path syntax

| Path example     | Meaning                                |
| ---------------- | -------------------------------------- |
| `foo.bar`        | Property access via dots               |
| `list.*.field`   | Wildcard across every array element    |
| `list.0.field`   | Explicit numeric index in an array     |
| `tuple.1`        | Tuple position                         |
| `record.someKey` | Records are always treated as optional |

Invalid paths or empty segments simply result in `false`.

## TypeScript support

`FieldPath<T>` is inferred from the schema, so only valid paths compile:

```ts
isRequiredField(Schema, "profile.email"); // ✅
isRequiredField(Schema, "profile.notExist"); // ❌ type error
```
