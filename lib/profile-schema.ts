/**
 * Profile validation schema — safe to import from both server and client
 * components. Contains NO server-only imports.
 */
import { z } from 'zod'

const customLinkSchema = z.object({
  label: z.string().min(1, 'Label is required').max(50, 'Label must be 50 characters or fewer'),
  url: z
    .string()
    .url('Must be a valid URL')
    .regex(/^https?:\/\//, 'Must start with http:// or https://'),
})

export const profileSchema = z.object({
  position: z
    .string()
    .max(200, 'Position must be 200 characters or fewer')
    .optional()
    .or(z.literal('')),
  context: z
    .string()
    .max(2000, 'Context must be 2000 characters or fewer')
    .optional()
    .or(z.literal('')),
  linkedin_url: z
    .string()
    .optional()
    .or(z.literal(''))
    .refine(
      (val) => {
        if (!val || val.trim() === '') return true
        return /^https:\/\/(?:www\.)?linkedin\.com\//.test(val)
      },
      { message: 'Must be a LinkedIn URL (https://...linkedin.com/...)' },
    ),
  phone: z
    .string()
    .max(50, 'Phone must be 50 characters or fewer')
    .optional()
    .or(z.literal('')),
  custom_links: z
    .array(customLinkSchema)
    .max(10, 'Maximum 10 custom links allowed'),
})

export type ProfileFormValues = z.infer<typeof profileSchema>
