-- Set superadmin credentials
-- username: cponce123.com@gmail.com
-- password: Hadrones456%

-- Add username column if it doesn't exist
ALTER TABLE cv_auth ADD COLUMN IF NOT EXISTS username TEXT DEFAULT 'admin';

-- Update the admin credentials
UPDATE cv_auth 
SET username = 'cponce123.com@gmail.com', 
    password = 'Hadrones456%'
WHERE id = 'admin';

-- If no row exists yet, insert one
INSERT INTO cv_auth (id, username, password)
SELECT 'admin', 'cponce123.com@gmail.com', 'Hadrones456%'
WHERE NOT EXISTS (SELECT 1 FROM cv_auth WHERE id = 'admin');
