\copy molecules (molecule_id, sequence, n_terminus, c_terminus, stereo, linear_cyclic, molecular_weight, synthesis_type, assembly_type, structure, structure_description, special_type) FROM 'molecules.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')
\copy peptide_records FROM 'peptide_records.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')
\copy publications FROM 'publications.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')
\copy source_texts FROM 'source_texts.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')
\copy bioactivities FROM 'bioactivities.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')
\copy record_publications FROM 'record_publications.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')
SELECT setval(pg_get_serial_sequence('molecules','molecule_id'), (SELECT max(molecule_id) FROM molecules));
SELECT setval(pg_get_serial_sequence('peptide_records','adam_id'), (SELECT max(adam_id) FROM peptide_records));
SELECT setval(pg_get_serial_sequence('publications','publication_id'), (SELECT max(publication_id) FROM publications));
SELECT setval(pg_get_serial_sequence('bioactivities','bioactivity_id'), (SELECT max(bioactivity_id) FROM bioactivities));
ANALYZE;
