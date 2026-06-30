/**
 * An error whose message is intended to be shown directly to the user without a
 * stack trace. Top-level command error handlers should print only `message` for
 * instances of this class.
 */
export class UserFacingError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "UserFacingError";
  }
}
