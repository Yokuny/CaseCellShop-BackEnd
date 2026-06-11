import { Router } from "express";
import * as controller from "../controllers/product.controller";
import { validParams } from "../middlewares";
import { productIdParamSchema } from "../schemas";

const productsRoute = Router();

productsRoute.get("/", controller.list);
productsRoute.get("/:id", validParams(productIdParamSchema), controller.getById);

export { productsRoute };
