-- Notes vs todos: false = sticky note (no checkbox). Default true keeps existing rows as todos.
alter table tasks add column if not exists is_todo boolean default true;
