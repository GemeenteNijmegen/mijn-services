

export class ErrorResponse extends Error {
  readonly statusCode;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}