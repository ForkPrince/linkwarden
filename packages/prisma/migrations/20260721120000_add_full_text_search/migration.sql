-- Add tsvector column for PostgreSQL full-text search
ALTER TABLE "Link" ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Create GIN index on the search vector
CREATE INDEX IF NOT EXISTS link_search_vector_idx ON "Link" USING GIN (search_vector);

-- Create function to auto-update search_vector on insert/update of relevant fields
CREATE OR REPLACE FUNCTION update_link_search_vector()
RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.url, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(NEW."textContent", '')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update search_vector
DROP TRIGGER IF EXISTS link_search_vector_update ON "Link";
CREATE TRIGGER link_search_vector_update
  BEFORE INSERT OR UPDATE OF name, url, description, "textContent"
  ON "Link"
  FOR EACH ROW
  EXECUTE FUNCTION update_link_search_vector();

-- Backfill search_vector for existing links
UPDATE "Link" SET search_vector =
  setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(url, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(description, '')), 'C') ||
  setweight(to_tsvector('english', coalesce("textContent", '')), 'D');
