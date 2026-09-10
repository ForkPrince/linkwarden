DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_collation WHERE collname = 'und-x-icu') THEN
    DROP TRIGGER IF EXISTS link_search_vector_update ON "Link";

    ALTER TABLE "Link" ALTER COLUMN "name" TYPE TEXT COLLATE "und-x-icu";
    ALTER TABLE "Collection" ALTER COLUMN "name" TYPE TEXT COLLATE "und-x-icu";
    ALTER TABLE "Tag" ALTER COLUMN "name" TYPE TEXT COLLATE "und-x-icu";

    CREATE TRIGGER link_search_vector_update
      BEFORE INSERT OR UPDATE OF name, url, description, "textContent"
      ON "Link"
      FOR EACH ROW
      EXECUTE FUNCTION update_link_search_vector();
  END IF;
END
$$;
