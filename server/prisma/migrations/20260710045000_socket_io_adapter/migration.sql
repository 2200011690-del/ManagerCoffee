CREATE TABLE IF NOT EXISTS socket_io_attachments (
  id BIGSERIAL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  payload BYTEA
);

CREATE INDEX IF NOT EXISTS socket_io_attachments_created_at_idx
  ON socket_io_attachments(created_at);
