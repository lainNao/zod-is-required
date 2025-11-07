import { describe, expect, it } from "vitest";
import { z } from "zod";
import { isRequiredField } from "../src/index.ts";

describe("isRequiredField", () => {
  describe("primitive types", () => {
    const schema = z.object({
      string: z.string(),
      stringMin0: z.string().min(0),
      stringMin1: z.string().min(1),
      stringNullable: z.string().nullable(),
      stringRequired: z.string().optional(),
      number: z.number(),
      numberOptional: z.number().optional(),
      date: z.date(),
      dateOptional: z.date().optional(),
      enum: z.enum(["A", "B"]),
      enumOptional: z.enum(["A", "B"]).optional(),
    });

    it("detects required vs optional primitives", () => {
      expect(isRequiredField(schema, "string")).toBe(false);
      expect(isRequiredField(schema, "stringMin0")).toBe(false);
      expect(isRequiredField(schema, "stringMin1")).toBe(true);
      expect(isRequiredField(schema, "stringNullable")).toBe(false);
      expect(isRequiredField(schema, "stringRequired")).toBe(false);
      expect(isRequiredField(schema, "number")).toBe(true);
      expect(isRequiredField(schema, "numberOptional")).toBe(false);
      expect(isRequiredField(schema, "date")).toBe(true);
      expect(isRequiredField(schema, "dateOptional")).toBe(false);
      expect(isRequiredField(schema, "enum")).toBe(true);
      expect(isRequiredField(schema, "enumOptional")).toBe(false);
    });
  });

  describe("arrays and tuples", () => {
    const schema = z.object({
      stringArray: z.array(z.string()),
      stringArrayMin1: z.array(z.string().min(1)).min(1),
      numberArrayOptional: z.array(z.number()).optional(),
      tuple: z.tuple([z.number(), z.string().optional()]),
      objectArray: z.array(
        z.object({
          requiredInner: z.boolean(),
          optionalInner: z.boolean().optional(),
        }),
      ),
    });

    it("handles array elements and tuples", () => {
      expect(isRequiredField(schema, "stringArray")).toBe(false);
      expect(isRequiredField(schema, "stringArrayMin1")).toBe(true);
      expect(isRequiredField(schema, "stringArrayMin1.*")).toBe(true);
      expect(isRequiredField(schema, "stringArrayMin1.0")).toBe(true);
      expect(isRequiredField(schema, "numberArrayOptional")).toBe(false);
      expect(isRequiredField(schema, "numberArrayOptional.*")).toBe(false);
      expect(isRequiredField(schema, "numberArrayOptional.0")).toBe(false);
      expect(isRequiredField(schema, "tuple.0")).toBe(true);
      expect(isRequiredField(schema, "tuple.1")).toBe(false);
      expect(isRequiredField(schema, "objectArray.*.requiredInner")).toBe(true);
      expect(isRequiredField(schema, "objectArray.*.optionalInner")).toBe(
        false,
      );
      expect(isRequiredField(schema, "objectArray.0.requiredInner")).toBe(true);
      expect(isRequiredField(schema, "objectArray.0.optionalInner")).toBe(
        false,
      );
    });
  });

  describe("nested objects and records", () => {
    const schema = z.object({
      object: z.object({
        string: z.string(),
        stringMin1: z.string().min(1),
        stringOptional: z.string().optional(),
      }),
      record: z.record(z.string(), z.string()),
    });

    it("evaluates object trees and records", () => {
      expect(isRequiredField(schema, "object.string")).toBe(false);
      expect(isRequiredField(schema, "object.stringMin1")).toBe(true);
      expect(isRequiredField(schema, "object.stringOptional")).toBe(false);
      expect(isRequiredField(schema, "record.someKey")).toBe(false);
    });
  });

  describe("unions and intersections", () => {
    const unionSchema = z.object({
      unionField: z.union([z.string(), z.undefined()]),
    });

    const intersectionSchema = z
      .object({ alwaysRequired: z.string().min(1) })
      .and(z.object({ maybePresent: z.string().optional() }));

    it("flags optional unions correctly", () => {
      expect(isRequiredField(unionSchema, "unionField")).toBe(false);
    });

    it("merges requirement info across intersections", () => {
      expect(isRequiredField(intersectionSchema, "alwaysRequired")).toBe(true);
      expect(isRequiredField(intersectionSchema, "maybePresent")).toBe(false);
    });
  });

  describe("invalid paths", () => {
    const schema = z.object({
      string: z.string(),
    });

    it("returns false for unknown paths", () => {
      // @ts-expect-error invalid path should be caught by types
      expect(isRequiredField(schema, "not.exists")).toBe(false);
      // @ts-expect-error empty path should be caught by types
      expect(isRequiredField(schema, "")).toBe(false);
    });
  });
});
