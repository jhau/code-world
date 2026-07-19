/**
 * Shape of the JWT payload issued at register/login and read by auth middleware.
 */
export default interface Payload {
  userId: string;
}
