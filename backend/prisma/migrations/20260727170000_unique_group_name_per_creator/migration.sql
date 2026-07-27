-- Stop a user creating the same group twice, and make the email UNIQUE constraint mean what it
-- says. Both are integrity rules the application had been assuming without enforcing.
--
-- The two UPDATEs run FIRST and are not optional. They canonicalise existing rows so the new
-- constraint sees the same values the application will write from now on. On this database both
-- are no-ops (checked: zero untrimmed names, zero mixed-case emails), but a migration has to be
-- correct on every environment it will ever run against, not just the one it was written on.

-- Trim existing group names. Without this, a stored " Team" and a newly-created "Team" would be
-- distinct values and the unique index below would happily allow both.
UPDATE "Group" SET "name" = BTRIM("name") WHERE "name" <> BTRIM("name");

-- Lowercase existing emails. RegisterDto/LoginDto/Google sign-in now normalise on the way in, so
-- any row left in mixed case would become unreachable: the account exists, but every login lookup
-- would search for the lowercased form and miss it.
UPDATE "User" SET "email" = LOWER(BTRIM("email")) WHERE "email" <> LOWER(BTRIM("email"));

-- CreateIndex
CREATE UNIQUE INDEX "Group_createdBy_name_key" ON "Group"("createdBy", "name");
