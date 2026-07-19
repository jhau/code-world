import config from "config";
import { NextFunction, Response } from "express";
import HttpStatusCodes from "http-status-codes";
import jwt from "jsonwebtoken";

import Payload from "../types/Payload";
import Request from "../types/Request";

export default function (req: Request, res: Response, next: NextFunction) {
  const token = req.header("x-auth-token");

  if (!token) {
    return res
      .status(HttpStatusCodes.UNAUTHORIZED)
      .json({ msg: "No token, authorization denied" });
  }

  try {
    const payload: Payload | any = jwt.verify(token, config.get("jwtSecret"));
    req.userId = payload.userId;
    next();
  } catch (err) {
    res
      .status(HttpStatusCodes.UNAUTHORIZED)
      .json({ msg: "Token is not valid" });
  }
}
