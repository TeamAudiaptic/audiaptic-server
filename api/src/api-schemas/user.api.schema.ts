import { z } from 'zod';
import { APIError, createAPIError } from '../api-general/error.api.schema.js';

export class APIUser {
  static readonly route = {
    body: z.object({
      username: z.string().min(3),
      email: z.string().email(),
    }),
    response: {
      201: z.object({
        success: z.boolean(),
        id: z.string(),
      }),
      404: createAPIError('User not found'), // Reuse the APIError schema for all error-like responses
    },
  } as const;
}

export type APIUserRequestBody = z.infer<typeof APIUser.route.body>;
export type APIUserResponse201 = z.infer<typeof APIUser.route.response[201]>;
export type APIUserResponseNotFound = z.infer<typeof APIUser.route.response[404]>;