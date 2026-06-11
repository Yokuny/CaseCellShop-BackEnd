import type { NextFunction, Request, Response } from "express";
import { type Schema, ZodError } from "zod";
import { CustomError } from "../models";

const formatZodError = (e: ZodError): string => {
  return e.issues
    .map((issue) => {
      const path = issue.path.join(".") || "campo";
      return `O campo '${path}' é inválido. Erro: '${issue.message}'`;
    })
    .join(" | ");
};

const validate = (schema: Schema, type: "body" | "params" | "query") => {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      schema.parse(req[type]);
      next();
    } catch (e) {
      if (e instanceof ZodError) {
        next(new CustomError(formatZodError(e), 400));
      } else {
        next(new CustomError((e as Error).message, 400));
      }
    }
  };
};

export const validBody = (schema: Schema) => validate(schema, "body");
export const validParams = (schema: Schema) => validate(schema, "params");
export const validQuery = (schema: Schema) => validate(schema, "query");
