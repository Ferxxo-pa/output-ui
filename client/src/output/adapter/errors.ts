/** A failed OUTPUT operation. Live mode throws this instead of pretending the action worked. */
export class OutputOperationError extends Error {
  readonly operation: string;
  readonly code: string;

  constructor(operation: string, message: string, code = "backend_unavailable") {
    super(message);
    this.name = "OutputOperationError";
    this.operation = operation;
    this.code = code;
  }
}
