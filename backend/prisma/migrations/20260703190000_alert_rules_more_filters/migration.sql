-- B10.1 — extend alert_rules with three additional whitelist filters :
--   * template_ids       — workorder template
--   * client_type_codes  — Client.clientType enum code
--   * address_type_codes — ClientAddress.addressType string code
-- All three default to an empty array (= no filter).

ALTER TABLE "alert_rules"
    ADD COLUMN "template_ids"       TEXT[] DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN "client_type_codes"  TEXT[] DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN "address_type_codes" TEXT[] DEFAULT ARRAY[]::TEXT[];
