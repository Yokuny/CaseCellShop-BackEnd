import { Router } from "express";
import * as controller from "../controllers/order.controller";
import { validParams } from "../middlewares";
import { orderIdParamSchema } from "../schemas";

const ordersRoute = Router();

ordersRoute.get("/:orderId/status", validParams(orderIdParamSchema), controller.getStatus);

export { ordersRoute };
