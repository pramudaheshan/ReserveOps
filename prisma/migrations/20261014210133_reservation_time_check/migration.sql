ALTER TABLE "Reservation"
ADD CONSTRAINT "reservation_valid_time"
CHECK ("endTime" > "startTime");