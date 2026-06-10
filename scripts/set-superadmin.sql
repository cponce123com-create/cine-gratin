-- Set superadmin credentials with bcrypt-hashed password.
-- 
-- IMPORTANT: The password MUST be pre-hashed with bcrypt before running this script.
-- Use the following Node.js one-liner to generate a hash:
--   node -e "const bcrypt = require('bcrypt'); bcrypt.hash('your-password', 10).then(h => console.log(h))"
--
-- Usage: psql "$DATABASE_URL" -v username="'$ADMIN_USERNAME'" -v password="'$BCRYPT_HASH'" -f scripts/set-superadmin.sql
--
-- Set these env vars before running:
--   export ADMIN_USERNAME="admin@example.com"
--   export BCRYPT_HASH='$2b$10$...'

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
