import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  StreamableFile,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  timestamp: string;
}

/**
 * Wraps all successful responses in a standard envelope:
 * { success: true, data: ..., timestamp: "..." }
 *
 * Binary responses (`StreamableFile`, e.g. the attachment content proxy) are
 * passed through untouched : wrapping them would make Express JSON-serialise a
 * socket (circular structure → 500).
 */
@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((data) =>
        data instanceof StreamableFile
          ? (data as unknown as ApiResponse<T>)
          : {
              success: true,
              data,
              timestamp: new Date().toISOString(),
            },
      ),
    );
  }
}
