-- Capital One joins the lineup: manual miles balance slot.
INSERT INTO rewards_balances (program, display_name, note, balance)
VALUES ('capone_miles', 'Capital One Miles', 'Capital One', 0)
ON CONFLICT (program) DO NOTHING;
