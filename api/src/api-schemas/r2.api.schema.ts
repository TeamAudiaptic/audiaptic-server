import { z } from 'zod';

export const R2Upload = {
  route: {
    description: 'Upload a file to Cloudflare R2',
    tags: ['R2'],
    response: {
      201: z.object({
        success: z.boolean(),
        message: z.string(),
        etag: z.string(),
      }),
      400: z.object({
        error: z.string(),
      }),
      500: z.object({
        error: z.string(),
      }),
    },
  },
};

export const R2List = {
  route: {
    description: 'List all files in R2 bucket',
    tags: ['R2'],
    response: {
      200: z.object({
        files: z.array(z.object({
          name: z.string(),
          size: z.number(),
          lastModified: z.date().optional(),
        })),
      }),
      500: z.object({
        error: z.string(),
      }),
    },
  },
};

export type R2UploadResponse201 = z.infer<typeof R2Upload.route.response[201]>;
export type R2ListResponse200 = z.infer<typeof R2List.route.response[200]>;