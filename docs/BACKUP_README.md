# Database Backup System

This application includes an automated PostgreSQL database backup system that uploads backups to S3 or S3-compatible storage daily.

## Features

- ✅ Automatic daily backups to S3 or S3-compatible storage
- ✅ Support for AWS S3, DigitalOcean Spaces, Backblaze B2, MinIO, and more
- ✅ Configurable backup schedule (default: 2 AM UTC)
- ✅ Compressed backups using PostgreSQL custom format
- ✅ Server-side encryption (AES256)
- ✅ Automatic cleanup of local backup files

## Supported Storage Providers

This system supports any S3-compatible object storage provider:

- **AWS S3** - Amazon's object storage service
- **DigitalOcean Spaces** - S3-compatible object storage
- **Backblaze B2** - Cloud storage with S3-compatible API
- **Wasabi** - Hot cloud storage
- **MinIO** - Self-hosted object storage
- **Cloudflare R2** - Zero egress object storage
- Any other S3-compatible service

## Setup Instructions

### 1. Configure S3 Storage

Create a bucket/space on your chosen provider and obtain access credentials.

#### AWS S3
Create an IAM user with the following permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject"
      ],
      "Resource": "arn:aws:s3:::your-backup-bucket/*"
    }
  ]
}
```

#### DigitalOcean Spaces
1. Create a Space in your region
2. Generate a Spaces access key and secret key
3. Use endpoint format: `https://{region}.digitaloceanspaces.com`

#### Backblaze B2
1. Create a B2 bucket
2. Create an application key with read/write access
3. Use endpoint from bucket details (e.g., `https://s3.us-west-000.backblazeb2.com`)

### 2. Set Environment Variables

Update your `.env` file with your S3 credentials:

```env
# S3 Configuration (for database backups)
# Works with AWS S3, DigitalOcean Spaces, Backblaze B2, MinIO, etc.
S3_ACCESS_KEY_ID=your-s3-access-key-id
S3_SECRET_ACCESS_KEY=your-s3-secret-access-key
S3_REGION=us-east-1
S3_BACKUP_BUCKET=your-backup-bucket-name
# Optional: Custom S3 endpoint (leave empty for AWS S3)
# Example for DigitalOcean Spaces: https://nyc3.digitaloceanspaces.com
# Example for Backblaze B2: https://s3.us-west-000.backblazeb2.com
S3_ENDPOINT=

# Database Backup Configuration
# Enable scheduled backups (auto-enabled in production)
ENABLE_SCHEDULED_BACKUPS=false
# Cron schedule for backups (default: daily at 2 AM)
BACKUP_CRON_SCHEDULE=0 2 * * *
# Timezone for backup schedule (default: UTC)
BACKUP_TIMEZONE=UTC
```

#### Provider-Specific Configuration

**AWS S3:**
```env
S3_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
S3_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
S3_REGION=us-east-1
S3_BACKUP_BUCKET=my-backups
S3_ENDPOINT=
```

**DigitalOcean Spaces:**
```env
S3_ACCESS_KEY_ID=DO00EXAMPLE
S3_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
S3_REGION=nyc3
S3_BACKUP_BUCKET=my-backups
S3_ENDPOINT=https://nyc3.digitaloceanspaces.com
```

**Backblaze B2:**
```env
S3_ACCESS_KEY_ID=000abcdef123456789
S3_SECRET_ACCESS_KEY=K000wJalrXUtnFEMI/K7MDENG/bPxRfi
S3_REGION=us-west-000
S3_BACKUP_BUCKET=my-backups
S3_ENDPOINT=https://s3.us-west-000.backblazeb2.com
```

### 3. Enable Automatic Backups

Automatic backups are enabled by default in production (`NODE_ENV=production`).

For development/testing, set:
```env
ENABLE_SCHEDULED_BACKUPS=true
```

## Usage

### Automatic Backups

Once configured, backups will run automatically according to the schedule:

- **Default Schedule**: Every day at 2:00 AM (server timezone)
- **Custom Schedule**: Modify `BACKUP_CRON_SCHEDULE` using cron syntax

Cron format: `minute hour day month day-of-week`

Examples:
- `0 2 * * *` - Daily at 2 AM
- `0 3 * * 0` - Weekly on Sunday at 3 AM
- `0 */6 * * *` - Every 6 hours

## Backup Storage

Backups are stored in S3 with the following structure:

```
s3://your-backup-bucket/
  └── database-backups/
      ├── backup-2025-10-10T02-00-00-000Z.sql
      ├── backup-2025-10-11T02-00-00-000Z.sql
      └── backup-2025-10-12T02-00-00-000Z.sql
```

## Restoring from Backup

To restore from a backup:

1. Download the backup file from S3
2. Use `pg_restore` to restore the database:

```bash
# For custom format backups (-Fc)
pg_restore -h localhost -p 5432 -U postgres -d prayertools -c backup-file.sql

# Or using psql for plain SQL backups
psql -h localhost -p 5432 -U postgres -d prayertools < backup-file.sql
```

## Monitoring

Check server logs for backup status:

- ✅ Successful backup: `✅ Scheduled backup completed successfully`
- ❌ Failed backup: `❌ Scheduled backup failed: <error>`

## Troubleshooting

### Backups not running

1. Check `ENABLE_SCHEDULED_BACKUPS` is `true` (or `NODE_ENV=production`)
2. Verify server is running
3. Check server logs for errors

### Upload fails

1. Verify S3 credentials are correct
2. Check S3 bucket/space exists and is accessible
3. Verify permissions include `s3:PutObject` (or equivalent)
4. For non-AWS providers, ensure `S3_ENDPOINT` is correctly set
5. Check network connectivity to the S3 endpoint

### pg_dump not found

Ensure PostgreSQL client tools are installed on the server:

```bash
# Ubuntu/Debian
sudo apt-get install postgresql-client

# macOS
brew install postgresql
```

## Security Notes

- Backups are encrypted at rest using S3 server-side encryption (AES256)
- S3 credentials should never be committed to version control
- Use IAM roles (AWS) or equivalent when running on cloud infrastructure
- Implement S3 lifecycle policies to automatically delete old backups
- For production, consider restricting bucket access to specific IP addresses
- Use strong, unique access keys for your S3 service

## Backup Retention

Consider implementing S3 lifecycle rules for automatic backup retention:

```json
{
  "Rules": [
    {
      "Id": "Delete old backups",
      "Status": "Enabled",
      "Prefix": "database-backups/",
      "Expiration": {
        "Days": 30
      }
    }
  ]
}
```

## File Structure

```
server/
├── plugins/
│   └── backup-scheduler.ts          # Automatic backup scheduler
└── utils/
    └── backup.ts                     # Backup utility functions
```
