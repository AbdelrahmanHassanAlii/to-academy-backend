export interface FieldError {
  path: string;
  message: string;
  code: string;
}

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly errors: FieldError[] = [],
  ) {
    super(message);
    this.name = 'AppError';
  }
}
