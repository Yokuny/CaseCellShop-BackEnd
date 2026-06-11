import type { NextFunction, Request, Response } from "express";
import { respObj } from "../helpers";
import * as service from "../services/product.service";

export const list = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const resp = await service.getCatalog();
    res.status(200).json(respObj(resp));
  } catch (e) {
    next(e);
  }
};

export const getById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const resp = await service.getProductById(req.params.id as string);
    res.status(200).json(respObj(resp));
  } catch (e) {
    next(e);
  }
};
