-- Las zonas de reparto admiten, además de códigos postales exactos (28029), prefijos de provincia con
-- asterisco (28* = toda la Comunidad de Madrid). La restricción ck_delivery_zone_postal_codes ya usa
-- esta función, así que basta con reemplazarla.
CREATE OR REPLACE FUNCTION is_valid_postal_code_list(codes text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT cardinality(codes) > 0
     AND array_to_string(codes, ',') ~ '^([0-9]{5}|[0-9]{2}\*)(,([0-9]{5}|[0-9]{2}\*))*$'
$$;
