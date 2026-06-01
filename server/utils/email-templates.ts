export interface EmailTemplateData {
  appName?: string
  userName?: string
  userEmail?: string
  timestamp?: string
  environment?: string
  [key: string]: any
}

export interface EmailTemplate {
  subject: string
  html: (data: EmailTemplateData) => string
  text: (data: EmailTemplateData) => string
}

// Base template styles and structure
const baseStyles = {
  container: 'font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;',
  header: 'background: linear-gradient(135deg, #000000 0%, #374151 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;',
  content: 'background: white; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;',
  footer: 'text-align: center; margin-top: 20px; color: #9ca3af; font-size: 12px;',
  infoBox: 'background: #f3f4f6; border-left: 4px solid #000000; padding: 15px; margin: 20px 0; border-radius: 0 5px 5px 0;',
  button: 'background: #000000; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;'
}

// Template builder function
function buildEmailTemplate(
  subject: string,
  htmlContent: (data: EmailTemplateData) => string,
  textContent: (data: EmailTemplateData) => string
): EmailTemplate {
  return {
    subject,
    html: (data: EmailTemplateData) => `
      <div style="${baseStyles.container}">
        <div style="${baseStyles.header}">
          <h1 style="margin: 0; font-size: 24px;">${data.appName || 'Base'}</h1>
          <p style="margin: 10px 0 0 0; opacity: 0.9;">${subject}</p>
        </div>
        
        <div style="${baseStyles.content}">
          ${htmlContent(data)}
        </div>
      </div>
    `,
    text: textContent
  }
}

// Test Email Template
export const testEmailTemplate: EmailTemplate = buildEmailTemplate(
  'Test Email',
  (data: EmailTemplateData) => `
    <h2 style="color: #333; margin-top: 0;">Hello ${data.userName || 'User'}!</h2>
    
    <p style="color: #666; line-height: 1.6;">
      This is a test email from the ${data.appName || 'Base'} admin panel. If you're receiving this email,
      it means the email system is working correctly.
    </p>
    
    <div style="${baseStyles.infoBox}">
      <h3 style="margin: 0 0 10px 0; color: #333;">Email Details:</h3>
      <ul style="margin: 0; color: #666;">
        <li><strong>Sent to:</strong> ${data.userEmail || 'Unknown'}</li>
        <li><strong>Sent by:</strong> ${data.userName || 'Admin'}</li>
        <li><strong>Timestamp:</strong> ${data.timestamp || 'Unknown'}</li>
        <li><strong>Environment:</strong> ${data.environment || 'Development (MailHog)'}</li>
      </ul>
    </div>
    
    ${data.environment === 'Development (MailHog)' ? `
    <p style="color: #666; line-height: 1.6;">
      You can view this email in the MailHog web interface at
      <a href="http://localhost:8025" style="color: #000000; text-decoration: underline;">http://localhost:8025</a>
    </p>
    
    <div style="text-align: center; margin-top: 30px;">
      <a href="http://localhost:8025" style="${baseStyles.button}">
        View in MailHog
      </a>
    </div>
    ` : `
    <p style="color: #666; line-height: 1.6;">
      This email was sent via SMTP in production mode.
    </p>
    
    <div style="text-align: center; margin-top: 30px;">
      <div style="${baseStyles.button}; background-color: #374151; cursor: default;">
        ✓ Email Sent Successfully
      </div>
    </div>
    `}
  `,
  (data: EmailTemplateData) => `
Test Email from ${data.appName || 'Base'}

Hello ${data.userName || 'User'}!

This is a test email from the ${data.appName || 'Base'} admin panel. If you're receiving this email,
it means the email system is working correctly.

Email Details:
- Sent to: ${data.userEmail || 'Unknown'}
- Sent by: ${data.userName || 'Admin'}
- Timestamp: ${data.timestamp || 'Unknown'}
- Environment: ${data.environment || 'Development (MailHog)'}

${data.environment === 'Development (MailHog)' ?
`You can view this email in the MailHog web interface at http://localhost:8025

This is a test email sent from the ${data.appName || 'Base'} application.
If you're seeing this in production, please contact your administrator.` :
`This email was sent via SMTP in production mode.

This is a test email sent from the ${data.appName || 'Base'} application.`}
  `
)

// Welcome Email Template
export const welcomeEmailTemplate: EmailTemplate = buildEmailTemplate(
  'Welcome!',
  (data: EmailTemplateData) => `
    <h2 style="color: #333; margin-top: 0;">Welcome ${data.userName || 'User'}!</h2>
    
    <p style="color: #666; line-height: 1.6;">
      Thank you for joining ${data.appName || 'Base'}! We're excited to have you on board.
    </p>
    
    <p style="color: #666; line-height: 1.6;">
      We hope this website is helpful for you, whether you're clearing up some space or preparing for a big transition.
    </p>
    
    <p style="color: #666; line-height: 1.6;">
      Let us know if you have any questions or run into any issues. We're always looking for feedback to improve the website.
    </p>
    
    <p style="color: #666; line-height: 1.6;">
      You can contact us at this email address: <a href="mailto:dev@leakyhugtank.com">dev@leakyhugtank.com</a>
    </p>
    <p style="color: #666; line-height: 1.6;">
      Best regards,
      <br>
      Jonathan
    </p>
  `,
  (data: EmailTemplateData) => `
Welcome to ${data.appName || 'Base'}!

Hello ${data.userName || 'User'}!

Thank you for joining ${data.appName || 'Base'}! We're excited to have you on board.

We hope this website is helpful for you, whether you're clearing up some space or preparing for a big transition.

Let us know if you have any questions or run into any issues. We're always looking for feedback to improve the website.

You can contact us at this email address: dev@leakyhugtank.com

Best regards,
Jonathan
  `
)

// Notification Email Template
export const notificationEmailTemplate: EmailTemplate = buildEmailTemplate(
  'New Notification',
  (data: EmailTemplateData) => `
    <h2 style="color: #333; margin-top: 0;">Hello ${data.userName || 'User'}!</h2>
    
    <p style="color: #666; line-height: 1.6;">
      You have a new notification from ${data.appName || 'Base'}.
    </p>
    
    <div style="${baseStyles.infoBox}">
      <h3 style="margin: 0 0 10px 0; color: #333;">Notification Details:</h3>
      <p style="margin: 0; color: #666;">${data.message || 'No message provided'}</p>
    </div>
    
    ${data.actionUrl ? `
    <div style="text-align: center; margin-top: 30px;">
      <a href="${data.actionUrl}" style="${baseStyles.button}">
        ${data.actionText || 'View Details'}
      </a>
    </div>
    ` : ''}
  `,
  (data: EmailTemplateData) => `
New Notification from ${data.appName || 'Base'}

Hello ${data.userName || 'User'}!

You have a new notification from ${data.appName || 'Base'}.

Notification Details:
${data.message || 'No message provided'}

${data.actionUrl ? `${data.actionText || 'View Details'}: ${data.actionUrl}` : ''}

Best regards,
The ${data.appName || 'Base'} Team
  `
)

// Bulk Email Template
export const bulkEmailTemplate: EmailTemplate = buildEmailTemplate(
  'Admin Message',
  (data: EmailTemplateData) => `
    <h2 style="color: #333; margin-top: 0;">Hello ${data.userName || 'User'}!</h2>
    
    <div style="color: #666; line-height: 1.6;">
      ${data.message || 'No message provided'}
    </div>
    
    ${data.actionUrl ? `
    <div style="text-align: center; margin-top: 30px;">
      <a href="${data.actionUrl}" style="${baseStyles.button}">
        ${data.actionText || 'Learn More'}
      </a>
    </div>
    ` : ''}
  `,
  (data: EmailTemplateData) => `
Admin Message from ${data.appName || 'Base'}

Hello ${data.userName || 'User'}!

${data.message || 'No message provided'}

${data.actionUrl ? `${data.actionText || 'Learn More'}: ${data.actionUrl}` : ''}

Best regards,
The ${data.appName || 'Base'} Team
  `
)

// Email Verification Template
export const verificationEmailTemplate: EmailTemplate = buildEmailTemplate(
  'Verify Your Email Address',
  (data: EmailTemplateData) => `
    <h2 style="color: #333; margin-top: 0;">Hello ${data.userName || 'User'}!</h2>
    
    <p style="color: #666; line-height: 1.6;">
      Thank you for registering with ${data.appName || 'Base'}! To complete your registration,
      please verify your email address by clicking the button below.
    </p>
    
    <div style="text-align: center; margin-top: 30px;">
      <a href="${data.verificationUrl || '#'}" style="${baseStyles.button}">
        Verify Email Address
      </a>
    </div>

    <p style="color: #666; line-height: 1.6; margin-top: 20px; font-size: 14px;">
      If the button doesn't work, you can copy and paste this link into your browser:
      <br>
      <a href="${data.verificationUrl || '#'}" style="color: #000000; text-decoration: underline; word-break: break-all;">
        ${data.verificationUrl || '#'}
      </a>
    </p>

    <p style="color: #666; line-height: 1.6; margin-top: 20px; font-size: 14px;">
      This link will expire in 24 hours. If you didn't create an account with ${data.appName || 'Base'},
      you can safely ignore this email.
    </p>
  `,
  (data: EmailTemplateData) => `
Verify Your Email Address - ${data.appName || 'Base'}

Hello ${data.userName || 'User'}!

Thank you for registering with ${data.appName || 'Base'}! To complete your registration,
please verify your email address by visiting the link below:

${data.verificationUrl || '#'}

If the link doesn't work, copy and paste it into your browser.

This link will expire in 24 hours. If you didn't create an account with ${data.appName || 'Base'},
you can safely ignore this email.

Best regards,
The ${data.appName || 'Base'} Team
  `
)

// Comment Notification Email Template
export const commentNotificationEmailTemplate: EmailTemplate = buildEmailTemplate(
  'New Comment on Your Sale Item',
  (data: EmailTemplateData) => `
    <h2 style="color: #333; margin-top: 0;">Hello ${data.userName || 'Sale Admin'}!</h2>
    
    <p style="color: #666; line-height: 1.6;">
      Someone has posted a new comment on an item in your sale.
    </p>
    
    <h3 style="margin: 0 0 10px 0; color: #333;">Comment Details:</h3>
    <p style="margin: 0 0 20px 0; color: #666;"><strong>Sale:</strong> ${data.saleName || 'Unknown Sale'}</p>
    <p style="margin: 0 0 8px 0; color: #666;"><strong>Item:</strong> ${data.itemName || 'Unknown Item'}</p>
    <p style="margin: 0 0 8px 0; color: #666;"><strong>Commenter:</strong> ${data.commenterName || 'Anonymous'}</p>
    <p style="margin: 0 0 8px 0; color: #666;"><strong>Comment:</strong></p>
    <p style="margin: 0 0 8px 0; color: #666; white-space: pre-wrap;">${data.comment || 'No comment text'}</p>
    
    <div style="text-align: center; margin-top: 30px;">
      <a href="${data.actionUrl || '#'}" style="${baseStyles.button}">
        View Comment
      </a>
    </div>
    
    <p style="color: #666; line-height: 1.6; margin-top: 20px; font-size: 14px;">
      You're receiving this notification because you're an admin of this sale. 
      You can manage your notification preferences in your sale settings.
    </p>
  `,
  (data: EmailTemplateData) => `
New Comment on Your Sale Item - ${data.appName || 'Base'}

Hello ${data.userName || 'Sale Admin'}!

Someone has posted a new comment on an item in your sale.

Comment Details:
- Item: ${data.itemName || 'Unknown Item'}
- Commenter: ${data.commenterName || 'Anonymous'}
- Comment: ${data.comment || 'No comment text'}
- Sale: ${data.saleName || 'Unknown Sale'}

View the comment at: ${data.actionUrl || '#'}

You're receiving this notification because you're an admin of this sale.

Best regards,
The ${data.appName || 'Base'} Team
  `
)

// Subscriber Comment Notification Email Template
export const subscriberCommentNotificationEmailTemplate: EmailTemplate = buildEmailTemplate(
  'New Comment on Sale Item',
  (data: EmailTemplateData) => `
    <h2 style="color: #333; margin-top: 0;">Hi ${data.userName || 'there'}!</h2>
    
    <p style="color: #666; line-height: 1.6;">
      ${data.commenterName || 'Someone'} posted a new comment on ${data.itemName || 'a sale item'}.
    </p>
    
    <p style="margin: 0 0 10px 0; color: #333;">The comment:</p>
    <div style="${baseStyles.infoBox}">
      <p style="margin: 0; color: #666; white-space: pre-wrap;">${data.comment || 'No comment text'}</p>
    </div>
    
    <div style="text-align: center; margin-top: 30px;">
      <a href="${data.actionUrl || '#'}" style="${baseStyles.button}">
        View the Entry
      </a>
    </div>
    
    <p style="color: #666; line-height: 1.6; margin-top: 20px; font-size: 14px;">
      You're receiving this because you subscribed to notifications for this item.
    </p>
  `,
  (data: EmailTemplateData) => `
New Comment on: ${data.itemName || 'Sale Item'} - ${data.appName || 'Base'}

Hi ${data.userName || 'there'}!

${data.commenterName || 'Someone'} posted a new comment on ${data.itemName || 'a sale item'}.

The comment:
${data.comment || 'No comment text'}

View the entry at: ${data.actionUrl || '#'}

You're receiving this because you subscribed to notifications for this item.

Best regards,
The ${data.appName || 'Base'} Team
  `
)

// Entry Claimed Notification Email Template
export const entryClaimedNotificationEmailTemplate: EmailTemplate = buildEmailTemplate(
  'Item Claimed',
  (data: EmailTemplateData) => `
    <h2 style="color: #333; margin-top: 0;">Hi ${data.userName || 'there'}!</h2>
    
    <p style="color: #666; line-height: 1.6;">
      The item "${data.itemName || 'Unknown Item'}" has been marked as claimed.
    </p>
    
    <div style="${baseStyles.infoBox}">
      <h3 style="margin: 0 0 10px 0; color: #333;">Item Details:</h3>
      <p style="margin: 0; color: #666;"><strong>Item:</strong> ${data.itemName || 'Unknown Item'}</p>
      <p style="margin: 0; color: #666;"><strong>Price:</strong> ${data.price || 'Not specified'}</p>
      <p style="margin: 0; color: #666;"><strong>Sale:</strong> ${data.saleName || 'Unknown Sale'}</p>
    </div>
    
    <div style="text-align: center; margin-top: 30px;">
      <a href="${data.actionUrl || '#'}" style="${baseStyles.button}">
        View the Entry
      </a>
    </div>
    
    <p style="color: #666; line-height: 1.6; margin-top: 20px; font-size: 14px;">
      You're receiving this because you subscribed to notifications for this item.
    </p>
  `,
  (data: EmailTemplateData) => `
Item Claimed - ${data.appName || 'Base'}

Hi ${data.userName || 'there'}!

The item "${data.itemName || 'Unknown Item'}" has been marked as claimed.

Item Details:
- Item: ${data.itemName || 'Unknown Item'}
- Price: ${data.price || 'Not specified'}
- Sale: ${data.saleName || 'Unknown Sale'}

View the entry at: ${data.actionUrl || '#'}

You're receiving this because you subscribed to notifications for this item.

Best regards,
The ${data.appName || 'Base'} Team
  `
)

// Email Change Verification Template
export const emailChangeVerificationTemplate: EmailTemplate = buildEmailTemplate(
  'Confirm Your New Email Address',
  (data: EmailTemplateData) => `
    <h2 style="color: #333; margin-top: 0;">Hello ${data.userName || 'User'}!</h2>
    
    <p style="color: #666; line-height: 1.6;">
      You requested to change your email address from <strong>${data.oldEmail || 'your current email'}</strong> 
      to <strong>${data.newEmail || 'a new email'}</strong>.
    </p>
    
    <p style="color: #666; line-height: 1.6;">
      To confirm this change, please click the button below:
    </p>
    
    <div style="text-align: center; margin-top: 30px;">
      <a href="${data.verificationUrl || '#'}" style="${baseStyles.button}">
        Confirm Email Change
      </a>
    </div>
    
    <p style="color: #666; line-height: 1.6; margin-top: 20px; font-size: 14px;">
      If the button doesn't work, you can copy and paste this link into your browser:
      <br>
      <a href="${data.verificationUrl || '#'}" style="color: #000000; text-decoration: underline; word-break: break-all;">
        ${data.verificationUrl || '#'}
      </a>
    </p>

    <p style="color: #666; line-height: 1.6; margin-top: 20px; font-size: 14px;">
      This link will expire in 24 hours. If you didn't request this email change,
      you can safely ignore this email and your current email address will remain unchanged.
    </p>
  `,
  (data: EmailTemplateData) => `
Confirm Your New Email Address - ${data.appName || 'Base'}

Hello ${data.userName || 'User'}!

You requested to change your email address from ${data.oldEmail || 'your current email'}
to ${data.newEmail || 'a new email'}.

To confirm this change, please visit the link below:

${data.verificationUrl || '#'}

If the link doesn't work, copy and paste it into your browser.

This link will expire in 24 hours. If you didn't request this email change,
you can safely ignore this email and your current email address will remain unchanged.

Best regards,
The ${data.appName || 'Base'} Team
  `
)

// Password Reset Email Template
export const passwordResetEmailTemplate: EmailTemplate = buildEmailTemplate(
  'Reset Your Password',
  (data: EmailTemplateData) => `
    <h2 style="color: #333; margin-top: 0;">Hello ${data.userName || 'User'}!</h2>

    <p style="color: #666; line-height: 1.6;">
      You requested to reset your password for your ${data.appName || 'Base'} account.
    </p>

    <p style="color: #666; line-height: 1.6;">
      To reset your password, please click the button below:
    </p>

    <div style="text-align: center; margin-top: 30px;">
      <a href="${data.resetUrl || '#'}" style="${baseStyles.button}">
        Reset Password
      </a>
    </div>

    <p style="color: #666; line-height: 1.6; margin-top: 20px; font-size: 14px;">
      If the button doesn't work, you can copy and paste this link into your browser:
      <br>
      <a href="${data.resetUrl || '#'}" style="color: #000000; text-decoration: underline; word-break: break-all;">
        ${data.resetUrl || '#'}
      </a>
    </p>

    <p style="color: #666; line-height: 1.6; margin-top: 20px; font-size: 14px;">
      This link will expire in 1 hour. If you didn't request a password reset,
      you can safely ignore this email and your password will remain unchanged.
    </p>

    <p style="color: #666; line-height: 1.6; margin-top: 20px; font-size: 14px;">
      For security reasons, if you didn't request this password reset,
      we recommend changing your password immediately after logging in.
    </p>
  `,
  (data: EmailTemplateData) => `
Reset Your Password - ${data.appName || 'Base'}

Hello ${data.userName || 'User'}!

You requested to reset your password for your ${data.appName || 'Base'} account.

To reset your password, please visit the link below:

${data.resetUrl || '#'}

If the link doesn't work, copy and paste it into your browser.

This link will expire in 1 hour. If you didn't request a password reset,
you can safely ignore this email and your password will remain unchanged.

For security reasons, if you didn't request this password reset,
we recommend changing your password immediately after logging in.

Best regards,
The ${data.appName || 'Base'} Team
  `
)

// Daily Summary Email Template
export const dailySummaryEmailTemplate: EmailTemplate = buildEmailTemplate(
  'Daily Activity Summary',
  (data: EmailTemplateData) => `
    <h2 style="color: #333; margin-top: 0;">Daily Activity Report</h2>

    <p style="color: #666; line-height: 1.6;">
      Here's your daily summary for <strong>${data.date || 'today'}</strong>:
    </p>

    ${data.totalActivity === 0 ? `
      <div style="${baseStyles.infoBox}">
        <p style="margin: 0; color: #666;">
          No new activity in the last 24 hours.
        </p>
      </div>
    ` : `
      <div style="background: white; border: 1px solid #e1e5e9; border-radius: 8px; overflow: hidden; margin: 20px 0;">
        <!-- New Users -->
        <div style="padding: 20px; border-bottom: 1px solid #e1e5e9;">
          <h3 style="margin: 0 0 10px 0; color: #333; display: flex; align-items: center;">
            <span style="background: #f3f4f6; color: #000000; padding: 4px 12px; border-radius: 20px; font-size: 14px; font-weight: bold;">
              ${data.newUsers?.count || 0}
            </span>
            <span style="margin-left: 10px;">New Users</span>
          </h3>
          ${data.newUsers?.count > 0 ? `
            <ul style="margin: 10px 0 0 0; padding-left: 20px; color: #666;">
              ${data.newUsers.users.slice(0, 5).map((user: any) => `
                <li style="margin-bottom: 5px;">
                  <strong>${user.display_name || user.email}</strong>
                  ${user.display_name ? `<span style="color: #999;">(${user.email})</span>` : ''}
                </li>
              `).join('')}
              ${data.newUsers.count > 5 ? `<li style="color: #999;">... and ${data.newUsers.count - 5} more</li>` : ''}
            </ul>
          ` : '<p style="margin: 0; color: #999; font-style: italic;">No new users</p>'}
        </div>

        <!-- New Sales -->
        <div style="padding: 20px; border-bottom: 1px solid #e1e5e9;">
          <h3 style="margin: 0 0 10px 0; color: #333; display: flex; align-items: center;">
            <span style="background: #f3f4f6; color: #000000; padding: 4px 12px; border-radius: 20px; font-size: 14px; font-weight: bold;">
              ${data.newSales?.count || 0}
            </span>
            <span style="margin-left: 10px;">New Sales Created</span>
          </h3>
          ${data.newSales?.count > 0 ? `
            <ul style="margin: 10px 0 0 0; padding-left: 20px; color: #666;">
              ${data.newSales.sales.slice(0, 5).map((sale: any) => `
                <li style="margin-bottom: 5px;">
                  <strong>${sale.name}</strong>
                </li>
              `).join('')}
              ${data.newSales.count > 5 ? `<li style="color: #999;">... and ${data.newSales.count - 5} more</li>` : ''}
            </ul>
          ` : '<p style="margin: 0; color: #999; font-style: italic;">No new sales</p>'}
        </div>

        <!-- Sale Activity -->
        <div style="padding: 20px;">
          <h3 style="margin: 0 0 10px 0; color: #333; display: flex; align-items: center;">
            <span style="background: #f3f4f6; color: #000000; padding: 4px 12px; border-radius: 20px; font-size: 14px; font-weight: bold;">
              ${(data.newItems?.count || 0) + (data.totalComments || 0) + (data.totalClaimed || 0)}
            </span>
            <span style="margin-left: 10px;">Sale Activity</span>
          </h3>
          ${data.newItems?.count > 0 || data.totalComments > 0 || data.totalClaimed > 0 ? `
            <ul style="margin: 10px 0 0 0; padding-left: 20px; color: #666;">
              ${data.newItems.itemsBySale.map((sale: any) => {
                const parts = []
                if (sale.itemCount > 0) parts.push(`${sale.itemCount} new item${sale.itemCount > 1 ? 's' : ''}`)
                if (sale.commentCount > 0) parts.push(`${sale.commentCount} comment${sale.commentCount > 1 ? 's' : ''}`)
                if (sale.claimedCount > 0) parts.push(`${sale.claimedCount} item${sale.claimedCount > 1 ? 's' : ''} claimed`)
                return `
                  <li style="margin-bottom: 5px;">
                    <strong>${sale.saleName}</strong>: ${parts.join(', ')}
                  </li>
                `
              }).join('')}
            </ul>
          ` : '<p style="margin: 0; color: #999; font-style: italic;">No new activity</p>'}
        </div>
      </div>
    `}

    <p style="color: #666; line-height: 1.6; margin-top: 20px; font-size: 14px;">
      This is an automated daily summary sent to all superadmins.
    </p>
  `,
  (data: EmailTemplateData) => `
Daily Activity Report - ${data.appName || 'Base'}

Here's your daily summary for ${data.date || 'today'}:

New Users: ${data.newUsers?.count || 0}
${data.newUsers?.count > 0 ? data.newUsers.users.slice(0, 5).map((user: any) =>
  `  - ${user.display_name || user.email}${user.display_name ? ` (${user.email})` : ''}`
).join('\n') : '  No new users'}
${data.newUsers?.count > 5 ? `  ... and ${data.newUsers.count - 5} more` : ''}

New Sales Created: ${data.newSales?.count || 0}
${data.newSales?.count > 0 ? data.newSales.sales.slice(0, 5).map((sale: any) =>
  `  - ${sale.name}`
).join('\n') : '  No new sales'}
${data.newSales?.count > 5 ? `  ... and ${data.newSales.count - 5} more` : ''}

Sale Activity: ${(data.newItems?.count || 0) + (data.totalComments || 0) + (data.totalClaimed || 0)}
${data.newItems?.count > 0 || data.totalComments > 0 || data.totalClaimed > 0 ? data.newItems.itemsBySale.map((sale: any) => {
  const parts = []
  if (sale.itemCount > 0) parts.push(`${sale.itemCount} new item${sale.itemCount > 1 ? 's' : ''}`)
  if (sale.commentCount > 0) parts.push(`${sale.commentCount} comment${sale.commentCount > 1 ? 's' : ''}`)
  if (sale.claimedCount > 0) parts.push(`${sale.claimedCount} item${sale.claimedCount > 1 ? 's' : ''} claimed`)
  return `  - ${sale.saleName}: ${parts.join(', ')}`
}).join('\n') : '  No activity'}

This is an automated daily summary sent to all superadmins.

Best regards,
The ${data.appName || 'Base'} Team
  `
)

// Template registry for easy access
export const emailTemplates = {
  test: testEmailTemplate,
  welcome: welcomeEmailTemplate,
  notification: notificationEmailTemplate,
  bulk: bulkEmailTemplate,
  verification: verificationEmailTemplate,
  emailChangeVerification: emailChangeVerificationTemplate,
  passwordReset: passwordResetEmailTemplate,
  commentNotification: commentNotificationEmailTemplate,
  subscriberCommentNotification: subscriberCommentNotificationEmailTemplate,
  entryClaimedNotification: entryClaimedNotificationEmailTemplate,
  dailySummary: dailySummaryEmailTemplate
}

// Helper function to render a template
export function renderEmailTemplate(
  templateName: keyof typeof emailTemplates,
  data: EmailTemplateData
): { subject: string; html: string; text: string } {
  const template = emailTemplates[templateName]
  if (!template) {
    throw new Error(`Email template '${templateName}' not found`)
  }
  
  return {
    subject: template.subject,
    html: template.html(data),
    text: template.text(data)
  }
} 