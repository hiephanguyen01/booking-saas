ALTER TABLE "bookings"
ADD COLUMN "listing_snapshot" JSONB;

UPDATE "bookings" AS b
SET "listing_snapshot" = jsonb_build_object(
  'title', l."title",
  'slug', l."slug",
  'description', l."description",
  'photos', COALESCE(l."photos", '[]'::jsonb),
  'attributes', COALESCE(l."attributes", '{}'::jsonb),
  'attributeSchema', COALESCE(lt."attribute_schema", '[]'::jsonb),
  'capacity', l."capacity",
  'group', CASE
    WHEN lg."id" IS NULL THEN 'null'::jsonb
    ELSE jsonb_build_object('title', lg."title", 'slug', lg."slug")
  END
)
FROM "listings" AS l
JOIN "listing_types" AS lt ON lt."id" = l."listing_type_id"
LEFT JOIN "listing_groups" AS lg ON lg."id" = l."group_id"
WHERE b."listing_id" = l."id";
