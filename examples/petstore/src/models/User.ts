import { Document, model, Schema } from "mongoose";

/**
 * Interface to model the User Schema for TypeScript.
 */
export interface IUser extends Document {
  email: string;
  password: string;
  avatar: string;
}

const userSchema: Schema = new Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  avatar: { type: String },
});

const User = model<IUser>("User", userSchema);

export default User;
