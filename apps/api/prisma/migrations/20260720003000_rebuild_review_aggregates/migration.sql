-- Rating aggregates are projections of persisted reviews. Rebuild every row so
-- legacy/demo values cannot advertise reviews that do not exist.
UPDATE "listings" AS l
SET
  "rating_avg" = (
    SELECT ROUND(AVG(r.rating)::numeric, 2)
    FROM "reviews" AS r
    WHERE r.listing_id = l.id
  ),
  "review_count" = (
    SELECT COUNT(r.id)::integer
    FROM "reviews" AS r
    WHERE r.listing_id = l.id
  );

UPDATE "listing_groups" AS g
SET
  "rating_avg" = (
    SELECT ROUND(AVG(r.rating)::numeric, 2)
    FROM "reviews" AS r
    WHERE r.group_id = g.id
  ),
  "review_count" = (
    SELECT COUNT(r.id)::integer
    FROM "reviews" AS r
    WHERE r.group_id = g.id
  );
