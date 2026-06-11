import type { NextFunction, Request, Response } from "express";
import { respObj } from "../helpers";
import * as service from "../services/order.service";

export const getStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const resp = await service.getOrderStatus(req.params.orderId as string);
    res.status(200).json(respObj(resp));
  } catch (e) {
    next(e);
  }
};
