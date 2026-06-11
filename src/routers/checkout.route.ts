import { Router } from "express";
import * as controller from "../controllers/checkout.controller";
import { validBody } from "../middlewares";
import { checkoutSchema } from "../schemas";

const checkoutRoute = Router();

checkoutRoute.post("/", validBody(checkoutSchema), controller.create);

export { checkoutRoute };
