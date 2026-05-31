-- Ajouter la colonne nullable
ALTER TABLE "task_types" ADD COLUMN "prefix" VARCHAR(10);

-- Générer des préfixes uniques à partir du nom (3 premières lettres en majuscules)
UPDATE "task_types" SET "prefix" = UPPER(LEFT(REGEXP_REPLACE(name, '[^a-zA-Z0-9]', '', 'g'), 3));

-- S'assurer qu'il n'y a pas de doublons en ajoutant un suffixe numérique si nécessaire
-- (cas rare mais possible)
DO $$
DECLARE
  r RECORD;
  counter INT;
  new_prefix VARCHAR(10);
BEGIN
  FOR r IN (
    SELECT id, prefix, ROW_NUMBER() OVER (PARTITION BY prefix ORDER BY created_at) as rn
    FROM task_types
    WHERE prefix IN (SELECT prefix FROM task_types GROUP BY prefix HAVING COUNT(*) > 1)
  ) LOOP
    IF r.rn > 1 THEN
      counter := r.rn;
      new_prefix := r.prefix || counter::text;
      UPDATE task_types SET prefix = new_prefix WHERE id = r.id;
    END IF;
  END LOOP;
END $$;

-- Rendre NOT NULL
ALTER TABLE "task_types" ALTER COLUMN "prefix" SET NOT NULL;

-- Ajouter la contrainte d'unicité
ALTER TABLE "task_types" ADD CONSTRAINT "task_types_prefix_key" UNIQUE ("prefix");
