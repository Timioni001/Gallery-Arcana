-- Waitlist sign-ups: email and role only. No IP address or tracking data.
CREATE TABLE waitlist (
  email text PRIMARY KEY CHECK (length(email) <= 254),
  role text NOT NULL CHECK (role IN ('collector','creator','both')),
  created_at timestamptz NOT NULL DEFAULT now()
);
