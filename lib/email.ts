import { Resend } from 'resend'

let _resend: Resend | null = null

function getResend(): Resend {
  if (_resend) return _resend
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured')
  }
  _resend = new Resend(apiKey)
  return _resend
}

const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL || 'OrgChart <noreply@example.com>'

export interface SendClaimEmailArgs {
  to: string
  employeeName: string
  organizationName: string
  claimUrl: string
}

export async function sendClaimEmail(args: SendClaimEmailArgs) {
  const { to, employeeName, organizationName, claimUrl } = args
  const resend = getResend()

  return resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `Claim your profile on ${organizationName}'s org chart`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <h2>Hi ${employeeName},</h2>
        <p>${organizationName} added you to their org chart on OrgChart. Click below to claim your profile and add a headshot, role context, and what you own.</p>
        <p style="margin: 32px 0;">
          <a href="${claimUrl}"
             style="background: #0f172a; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block;">
            Claim my profile
          </a>
        </p>
        <p style="color: #64748b; font-size: 14px;">
          This link expires in 14 days. If you weren't expecting this email, you can ignore it.
        </p>
      </div>
    `,
  })
}
