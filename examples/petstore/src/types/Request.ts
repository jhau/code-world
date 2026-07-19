import { Request } from "express";

/**
 * Augmented Express Request carrying the authenticated user's id,
 * populated by the auth middleware after JWT verification.
 */
export default interface AuthRequest extends Request {
  userId: string;
}
