import "server-only";

// ============================================================================
// Password-reset email template.
//
// Visual chrome matches the bootstrap-admin.ts invite + magic-link design
// (royal black canvas, 2px gold gradient frame, ivory `#FBFAF5` card,
// Cormorant Garamond letter inside). Copy is reset-specific.
//
// Used by app/auth/forgot-password/actions.ts (`requestPasswordResetAction`)
// to render the email body sent via Resend.
//
// Kept inline (not imported from scripts/bootstrap-admin.ts) because that
// script runs under tsx as a CLI tool — different runtime context, and
// adding a "server-only" boundary there would break the CLI. If a unified
// email-chrome library is needed later, extract the inline `<style>` /
// table layout into a shared module both can call.
// ============================================================================

const GOLD_GRADIENT =
  "background-color:#D4AF37;background-image:linear-gradient(135deg, #8B6F2A 0%, #D4AF37 25%, #F4D77E 50%, #D4AF37 75%, #8B6F2A 100%);";

interface ResetPasswordEmailArgs {
  /** Full URL the recipient clicks — points at /auth/confirm?token_hash=…&type=recovery&next=/auth/reset-password */
  resetUrl: string;
  /** Display email shown in the "prepared for" line. */
  recipientEmail: string;
  /** Optional first-name greeting; falls back to a generic salutation. */
  recipientName?: string | null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function resetPasswordEmail(args: ResetPasswordEmailArgs): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = "Reset your Nexvelon password";

  const urlEsc = escapeHtml(args.resetUrl);
  const emailEsc = escapeHtml(args.recipientEmail);
  const greeting = args.recipientName
    ? `${escapeHtml(args.recipientName)},`
    : "Hello,";

  const preheader =
    "Reset your Nexvelon Enterprise Suite password. Single-use, expires in one hour.";

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="light only" />
<meta name="supported-color-schemes" content="light only" />
<title>Nexvelon Enterprise Suite — Password Reset</title>
<!--[if mso]>
<style type="text/css">
table, td, div, p, a { font-family: Georgia, 'Times New Roman', serif !important; }
</style>
<xml>
<o:OfficeDocumentSettings>
<o:PixelsPerInch>96</o:PixelsPerInch>
</o:OfficeDocumentSettings>
</xml>
<![endif]-->
<style type="text/css">
  body { margin:0 !important; padding:0 !important; width:100% !important; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; background-color:#000000; }
  table { border-collapse:collapse !important; mso-table-lspace:0pt; mso-table-rspace:0pt; }
  img { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; display:block; }
  a { text-decoration:none; }

  .serif { font-family: 'Cormorant Garamond', Georgia, 'Times New Roman', serif; }
  .sans  { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }

  @media screen and (max-width: 620px) {
    .container { width:100% !important; max-width:100% !important; }
    .px-pad    { padding-left:24px !important; padding-right:24px !important; }
    .h1        { font-size:28px !important; line-height:1.2 !important; }
    .body-text { font-size:15px !important; }
    .btn       { padding:14px 32px !important; font-size:10px !important; }
    .wordmark  { font-size:26px !important; }
    .flank     { width:32px !important; }
  }
</style>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,400&display=swap" rel="stylesheet" />
</head>
<body style="margin:0;padding:0;background-color:#000000;">

<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;color:#000000;">
${escapeHtml(preheader)}
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#000000;">
  <tr>
    <td align="center" style="padding:48px 12px;background-color:#000000;">

      <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
        <tr>
          <td style="${GOLD_GRADIENT}padding:2px;">

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FBFAF5;">

              <tr>
                <td style="padding:6px 0 0;background-color:#FBFAF5;">
                  <div style="height:1px;background-color:#D4AF37;background-image:linear-gradient(90deg, #8B6F2A 0%, #D4AF37 50%, #8B6F2A 100%);font-size:0;line-height:0;">&nbsp;</div>
                </td>
              </tr>

              <tr>
                <td align="center" style="padding:24px 24px 0;background-color:#FBFAF5;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
                    <tr>
                      <td valign="middle" class="flank" style="width:54px;font-size:0;line-height:0;">
                        <div style="width:54px;height:1px;background-color:#D4AF37;background-image:linear-gradient(90deg, rgba(212,175,55,0) 0%, #D4AF37 100%);font-size:0;line-height:0;">&nbsp;</div>
                      </td>
                      <td valign="middle" class="wordmark serif" style="font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif;font-size:32px;line-height:1.1;color:#A8843F;font-weight:500;letter-spacing:0.02em;white-space:nowrap;padding:0 18px;">
                        Nexvelon Enterprise Suite
                      </td>
                      <td valign="middle" class="flank" style="width:54px;font-size:0;line-height:0;">
                        <div style="width:54px;height:1px;background-color:#D4AF37;background-image:linear-gradient(90deg, #D4AF37 0%, rgba(212,175,55,0) 100%);font-size:0;line-height:0;">&nbsp;</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td align="center" class="px-pad" style="padding:30px 56px 0;background-color:#FBFAF5;">
                  <div class="h1 serif" style="font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif;font-size:34px;line-height:1.15;color:#0A0A0A;font-weight:400;letter-spacing:-0.3px;mso-line-height-rule:exactly;">
                    Reset your<br/>Nexvelon password.
                  </div>
                </td>
              </tr>

              <tr>
                <td class="px-pad body-text serif" style="padding:30px 56px 0;background-color:#FBFAF5;font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif;font-size:16px;line-height:1.7;color:#2A1F0F;font-weight:400;text-align:left;">
                  <p style="margin:0 0 18px;">${greeting} we received a request to reset the password on your Nexvelon Enterprise Suite account.</p>
                  <p style="margin:0;">Use the button below to set a new password. The link is single-use and expires within the hour. If you didn&rsquo;t request this reset, you can safely ignore this email &mdash; your account remains secure.</p>
                </td>
              </tr>

              <tr>
                <td align="center" class="px-pad" style="padding:32px 56px 0;background-color:#FBFAF5;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
                    <tr>
                      <td style="${GOLD_GRADIENT}padding:1px;">
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                          <tr>
                            <td style="background-color:#0A0A0A;background-image:linear-gradient(180deg, #1A1A1A 0%, #0A0A0A 100%);mso-padding-alt:15px 42px;">
                              <a href="${urlEsc}" target="_blank" class="btn sans" style="display:inline-block;padding:15px 42px;color:#F4D77E;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:10px;letter-spacing:0.32em;text-transform:uppercase;font-weight:700;text-decoration:none;">
                                Reset Your Password
                              </a>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td align="center" class="px-pad" style="padding:14px 56px 0;background-color:#FBFAF5;">
                  <div class="sans" style="font-size:9px;letter-spacing:0.3em;color:#8C7846;text-transform:uppercase;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-weight:600;">
                    Single-use link
                  </div>
                </td>
              </tr>

              <tr>
                <td align="center" class="px-pad serif" style="padding:14px 56px 36px;background-color:#FBFAF5;font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif;font-size:13px;font-style:italic;color:#6B5A40;line-height:1.6;">
                  This link expires in one hour. Use it once.
                </td>
              </tr>

              <tr>
                <td class="px-pad" style="padding:0 56px;background-color:#FBFAF5;">
                  <div style="height:1px;background-color:#D4AF37;background-image:linear-gradient(90deg, rgba(212,175,55,0) 0%, #D4AF37 50%, rgba(212,175,55,0) 100%);font-size:0;line-height:0;">&nbsp;</div>
                </td>
              </tr>

              <tr>
                <td class="px-pad" style="padding:32px 56px 36px;background-color:#FBFAF5;">
                  <div class="serif" style="font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif;font-size:14px;font-style:italic;color:#6B5A40;line-height:1.4;">With regards from,</div>
                  <div class="serif" style="margin-top:8px;font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif;font-size:20px;color:#0A0A0A;font-weight:500;letter-spacing:0;">The Nexvelon Global Group.</div>
                  <div class="sans" style="margin-top:8px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:9px;letter-spacing:0.3em;text-transform:uppercase;color:#A8843F;font-weight:600;">Enterprise Suite &middot; Private Issue</div>
                </td>
              </tr>

              <tr>
                <td align="center" style="background-color:#F5F1E4;padding:18px 24px;">
                  <div class="sans" style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:9px;letter-spacing:0.25em;text-transform:uppercase;color:#6B5A40;font-weight:500;">
                    <span style="color:#A8843F;font-family:Georgia,serif;">&#9670;</span>
                    &nbsp;&nbsp;&copy; 2026 Nexvelon Global Inc.&nbsp;&nbsp;
                    <span style="color:#A8843F;font-family:Georgia,serif;">&#9670;</span>
                  </div>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>

      <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
        <tr>
          <td align="center" class="px-pad" style="padding:24px 24px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;color:#6B5E40;line-height:1.7;letter-spacing:0.04em;">
            This password reset was requested for <span style="color:#D4AF37;letter-spacing:0.06em;">${emailEsc}</span>.
          </td>
        </tr>
      </table>

    </td>
  </tr>
</table>

</body>
</html>`;

  const text = [
    "Nexvelon Enterprise Suite",
    "",
    "Reset your Nexvelon password.",
    "",
    `${args.recipientName ?? "Hello"}, we received a request to reset the password on your Nexvelon Enterprise Suite account.`,
    "",
    "Use the link below to set a new password. The link is single-use and expires within the hour. If you didn't request this reset, you can safely ignore this email — your account remains secure.",
    "",
    "Reset Your Password (single-use link):",
    args.resetUrl,
    "",
    "This link expires in one hour. Use it once.",
    "",
    "—",
    "",
    "With regards from,",
    "The Nexvelon Global Group.",
    "Enterprise Suite · Private Issue",
    "",
    `This password reset was requested for ${args.recipientEmail}.`,
    "",
    "© 2026 Nexvelon Global Inc.",
  ].join("\n");

  return { subject, html, text };
}
