ALTER TABLE "reviews"
ADD COLUMN "media" JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "reviews"
ADD CONSTRAINT "reviews_media_array_check"
CHECK (jsonb_typeof("media") = 'array' AND jsonb_array_length("media") <= 5);
