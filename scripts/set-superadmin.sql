-- Set superadmin credentials from environment variables
-- Usage: psql "$DATABASE_URL" -v username="'$ADMIN_USERNAME'" -v password="'$ADMIN_PASSWORD'" -f scripts/set-superadmin.sql
--
-- Set these env vars before running:
--   export ADMIN_USERNAME="admin@example.com"
--   export ADMIN_PASSWORD="your-secure-password"

-- Add username column if it doesn't exist
ALTER TABLE cv_auth ADD COLUMN IF NOT EXISTS username TEXT DEFAULT 'admin';

-- Update the admin credentials using psql variables
UPDATE cv_auth 
SET username = :'username', 
    password = :'password'
WHERE id = 'admin';

-- If no row exists yet, insert one
INSERT INTO cv_auth (id, username, password)
SELECT 'admin', :'username', :'password'
WHERE NOT EXISTS (SELECT 1 FROM cv_auth WHERE id = 'admin');
