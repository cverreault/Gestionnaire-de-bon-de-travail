-- Allow addresses to exist without a client. They can be attached later
-- (PATCH /clients/:id/addresses or a dedicated re-link endpoint).
ALTER TABLE "client_addresses" ALTER COLUMN "client_id" DROP NOT NULL;
