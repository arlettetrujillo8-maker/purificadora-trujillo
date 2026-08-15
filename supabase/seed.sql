-- Non-sensitive development seed. No users or operational transactions.
insert into public.inventory_locations(location_code, container_type, quantity)
values
  ('local','full',0),
  ('local','empty',0),
  ('wash','empty',0),
  ('route_1','full',0),
  ('route_1','empty',0),
  ('route_2','full',0),
  ('route_2','empty',0),
  ('damaged','damaged',0)
on conflict (location_code, container_type) do nothing;

insert into public.settings(key,value)
values
  ('business', '{"name":"Purificadora Trujillo","currency":"MXN"}'::jsonb),
  ('pricing', '{"default_price_cents":1400}'::jsonb),
  ('maintenance', '{"threshold":375}'::jsonb)
on conflict (key) do nothing;

