-- Per-user custom sticker set (emoji list) for the calendar sticker shelf.
alter table user_settings add column if not exists sticker_set text[];
