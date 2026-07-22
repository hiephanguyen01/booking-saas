-- Add zalopay to the payment_gateway enum (wallet gateway, parallel-enabled).
ALTER TYPE payment_gateway ADD VALUE IF NOT EXISTS 'zalopay';
