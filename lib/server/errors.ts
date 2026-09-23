export class AppError extends Error {
  status: number;
  code: string;
  retryAfter?: number;
  constructor(status: number, code: string, message: string, retryAfter?: number) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

export function configurationError() {
  return new AppError(503, "CONFIGURATION", "現在サービスの準備中です。しばらくしてからお試しください。");
}
