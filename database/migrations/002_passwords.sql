CREATE TABLE user_passwords (
  user_id varchar(64) NOT NULL PRIMARY KEY,
  password_hash varchar(255) NOT NULL,
  updated_at bigint NOT NULL,
  CONSTRAINT fk_user_passwords_user FOREIGN KEY (user_id) REFERENCES users (id)
)
