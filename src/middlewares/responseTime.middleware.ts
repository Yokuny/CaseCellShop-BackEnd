import type { Request, Response } from "express";
import resTime from "response-time";
import { reqResTime } from "../metrics";

export const responseTime = resTime((req: Request, res: Response, time: number) => {
  if (req?.route?.path) {
    reqResTime.observe(
      {
        method: req.method,
        route: req.baseUrl + req.route.path,
        status_code: res.statusCode,
      },
      time / 1000,
    );
  }
});
