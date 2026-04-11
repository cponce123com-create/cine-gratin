-- Limpiar la asignación incorrecta de collection_id para las películas de La Momia (ID 1733)
-- que estaban asignadas erróneamente al Universo Yellowstone.
UPDATE movies SET collection_id = NULL, collection_name = NULL WHERE collection_id = 1733;
UPDATE cv_series SET collection_id = NULL, collection_name = NULL WHERE collection_id = 1733;
