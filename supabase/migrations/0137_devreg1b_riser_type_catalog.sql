-- 0137_devreg1b_riser_type_catalog.sql
-- DEVREG-1B — load Riser Studio's device type catalog into public.device_types.
--
-- DEVREG-1 (0136) shipped device_types EMPTY, so every device read "unmatched".
-- These are Riser Studio's 62 type ids, extracted from the tool by Jay, seeded
-- exactly as given: not invented, renamed or re-ordered. The id is what must
-- round-trip unchanged. Seeded as DATA, not a CHECK constraint (§1): the catalog
-- grows by INSERT. The same rows live in lib/devices/riser-catalog.ts, and a test
-- asserts the two agree row for row, in order.
--
-- ADDITIVE only (§1), on a table that had 0 rows when this was written:
--   • device_types.kind: 'device' | 'door_group'. No CHECK (§1). typA/typB/typC/
--     typD and doorleaf are DOOR GROUPS, not single devices: placing a typical
--     creates a door leaf plus member devices sharing one door id.
--   • device_types.sort_order: the catalog's own order, so "do not re-order" holds
--     in every list.
--   • 62 rows. ON CONFLICT (id) DO NOTHING, so re-running never overwrites a row.
--
-- Mount height is metres (0 is a real value for door groups and the floor rack).
-- Default cable is NULL where the catalog lists none ("—"). homes_to, default_fov
-- and accessories are NOT in what was extracted, so they stay NULL rather than
-- being guessed (§2.8). The catalog carries NO pricing (confirmed by Jay);
-- accessory → ERP product mapping is DEVREG-3.

BEGIN;

ALTER TABLE public.device_types ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'device';
ALTER TABLE public.device_types ADD COLUMN IF NOT EXISTS sort_order int NOT NULL DEFAULT 0;

INSERT INTO public.device_types
  (id, name, system, label_prefix, default_mount_height_m, default_cable_type, kind, sort_order, source)
VALUES
  ('dome', 'Dome camera', 'cctv', 'CAM', 2.8, 'cat6', 'device', 1, 'riser_studio'),
  ('bullet', 'Bullet camera', 'cctv', 'CAM', 3, 'cat6', 'device', 2, 'riser_studio'),
  ('turret', 'Turret camera', 'cctv', 'CAM', 2.8, 'cat6', 'device', 3, 'riser_studio'),
  ('ptz', 'PTZ camera', 'cctv', 'PTZ', 4, 'cat6', 'device', 4, 'riser_studio'),
  ('fish', '360° fisheye camera', 'cctv', 'CAM', 3, 'cat6', 'device', 5, 'riser_studio'),
  ('multi', 'Multi-sensor camera', 'cctv', 'CAM', 4, 'cat6', 'device', 6, 'riser_studio'),
  ('lpr', 'LPR camera', 'cctv', 'LPR', 3, 'cat6', 'device', 7, 'riser_studio'),
  ('nvr', 'NVR / recorder', 'cctv', 'NVR', 1.2, NULL, 'device', 8, 'riser_studio'),
  ('mon', 'Monitor / video wall', 'cctv', 'MON', 1.6, 'cat6', 'device', 9, 'riser_studio'),
  ('reader', 'Card reader', 'access', 'RDR', 1.1, 'c226', 'device', 10, 'riser_studio'),
  ('kpreader', 'Keypad reader', 'access', 'KPR', 1.1, 'r224', 'device', 11, 'riser_studio'),
  ('mobreader', 'Mobile / BLE reader', 'access', 'RDR', 1.1, 'c226', 'device', 12, 'riser_studio'),
  ('strike', 'Electric strike', 'access', 'STR', 1.0, 'l182', 'device', 13, 'riser_studio'),
  ('mag', 'Maglock', 'access', 'MAG', 2.05, 'l182', 'device', 14, 'riser_studio'),
  ('dc', 'Door contact', 'access', 'DC', 2.05, 's222', 'device', 15, 'riser_studio'),
  ('rex', 'REX motion sensor', 'access', 'REX', 2.3, 's222', 'device', 16, 'riser_studio'),
  ('pte', 'Push-to-exit button', 'access', 'PTE', 1.1, 's222', 'device', 17, 'riser_studio'),
  ('ado', 'Automatic door operator', 'access', 'ADO', 2.2, 's222', 'device', 18, 'riser_studio'),
  ('pb', 'ADO push button (wave-to-open)', 'access', 'PB', 1.0, 's222', 'device', 19, 'riser_studio'),
  ('elevrdr', 'Elevator cab reader', 'access', 'ERD', 1.2, 'c226', 'device', 20, 'riser_studio'),
  ('elevio', 'Elevator floor-select I/O board', 'access', 'EIO', 1.5, 'rs485', 'device', 21, 'riser_studio'),
  ('rim', 'Reader interface module', 'access', 'RIM', 1.6, 'rs485', 'device', 22, 'riser_studio'),
  ('psu', 'Access power supply', 'access', 'PSU', 1.6, 'p142', 'device', 23, 'riser_studio'),
  ('gate', 'Gate / barrier operator', 'access', 'GATE', 1, 'c226', 'device', 24, 'riser_studio'),
  ('turnstile', 'Turnstile / speed lane', 'access', 'TRN', 1, 'c226', 'device', 25, 'riser_studio'),
  ('dgp', 'Door controller (DGP)', 'access', 'DGP', 1.6, 'cat6', 'device', 26, 'riser_studio'),
  ('typA', 'Door typical A · strike', 'access', 'D', 0, NULL, 'door_group', 27, 'riser_studio'),
  ('typB', 'Door typical B · maglock', 'access', 'D', 0, NULL, 'door_group', 28, 'riser_studio'),
  ('typC', 'Door typical C · ADO', 'access', 'D', 0, NULL, 'door_group', 29, 'riser_studio'),
  ('doorleaf', 'Door', 'access', 'DR', 0, NULL, 'door_group', 30, 'riser_studio'),
  ('entry', 'Entryphone / lobby panel', 'intercom', 'ENT', 1.4, 'ic224', 'device', 31, 'riser_studio'),
  ('suite', 'Suite station', 'intercom', 'STE', 1.5, 'ic222', 'device', 32, 'riser_studio'),
  ('ipds', 'IP door station', 'intercom', 'IPD', 1.4, 'cat6', 'device', 33, 'riser_studio'),
  ('guard', 'Guard / concierge station', 'intercom', 'GRD', 1, 'cat6', 'device', 34, 'riser_studio'),
  ('icm', 'Intercom controller', 'intercom', 'ICM', 1.6, 'cat6', 'device', 35, 'riser_studio'),
  ('kp', 'Alarm keypad', 'intrusion', 'KP', 1.4, 'a224', 'device', 36, 'riser_studio'),
  ('pir', 'Motion detector (PIR)', 'intrusion', 'PIR', 2.4, 'a224', 'device', 37, 'riser_studio'),
  ('gb', 'Glass-break detector', 'intrusion', 'GB', 2.4, 'a222', 'device', 38, 'riser_studio'),
  ('idc', 'Intrusion door contact', 'intrusion', 'CT', 2.05, 'a222', 'device', 39, 'riser_studio'),
  ('duress', 'Duress / panic button', 'intrusion', 'DUR', 0.75, 'a222', 'device', 40, 'riser_studio'),
  ('siren', 'Siren / strobe', 'intrusion', 'SRN', 2.6, 'a222', 'device', 41, 'riser_studio'),
  ('zexp', 'Zone expander', 'intrusion', 'ZEX', 1.6, 'a224', 'device', 42, 'riser_studio'),
  ('ipanel', 'Intrusion panel', 'intrusion', 'IAP', 1.6, NULL, 'device', 43, 'riser_studio'),
  ('typD', 'Door typical D · intrusion', 'intrusion', 'D', 0, NULL, 'door_group', 44, 'riser_studio'),
  ('facp', 'Fire alarm control panel', 'fire', 'FACP', 1.6, NULL, 'device', 45, 'riser_studio'),
  ('stu', 'ULC signal transmitter (STU)', 'fire', 'STU', 1.6, 'fplr18', 'device', 46, 'riser_studio'),
  ('smoke', 'Smoke detector', 'fire', 'SD', 2.9, 'fplr18', 'device', 47, 'riser_studio'),
  ('heat', 'Heat detector', 'fire', 'HD', 2.9, 'fplr18', 'device', 48, 'riser_studio'),
  ('pull', 'Manual pull station', 'fire', 'MPS', 1.2, 'fplr18', 'device', 49, 'riser_studio'),
  ('hs', 'Horn / strobe', 'fire', 'HS', 2.3, 'fplr16', 'device', 50, 'riser_studio'),
  ('mm', 'Monitor / control module', 'fire', 'MM', 2.4, 'fplr18', 'device', 51, 'riser_studio'),
  ('ann', 'Remote annunciator', 'fire', 'ANN', 1.5, 'fplr18', 'device', 52, 'riser_studio'),
  ('rack', 'Floor rack 42U', 'network', 'RACK', 0, NULL, 'device', 53, 'riser_studio'),
  ('wrack', 'Wall rack 12U', 'network', 'WR', 1.2, 'fmm', 'device', 54, 'riser_studio'),
  ('sw', 'PoE switch', 'network', 'SW', 1.3, 'fmm', 'device', 55, 'riser_studio'),
  ('ws', 'Workstation / client', 'network', 'WS', 0.8, 'cat6', 'device', 56, 'riser_studio'),
  ('ups', 'UPS', 'network', 'UPS', 0.3, 'p122', 'device', 57, 'riser_studio'),
  ('mc', 'Media converter', 'network', 'MC', 1.4, 'fmm', 'device', 58, 'riser_studio'),
  ('epanel', 'Electrical panel', 'electrical', 'EP', 1.5, NULL, 'device', 59, 'riser_studio'),
  ('rcpt', 'Receptacle 120 V', 'electrical', 'RCP', 0.45, 'p142', 'device', 60, 'riser_studio'),
  ('jb', 'Junction / pull box', 'electrical', 'JB', 2.8, NULL, 'device', 61, 'riser_studio'),
  ('xfmr', 'Transformer 24 VAC', 'electrical', 'XF', 1.6, 'p142', 'device', 62, 'riser_studio')
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- ── Existence check (run after applying, every line should match its comment) ─
--   -- New columns (expect 2)
--   SELECT column_name FROM information_schema.columns WHERE table_schema='public'
--     AND table_name='device_types' AND column_name IN ('kind','sort_order');
--
--   -- Rows (expect 62), per system (expect access 21, cctv 9, electrical 4, fire 8,
--   -- intercom 5, intrusion 9, network 6), door groups (expect 5)
--   SELECT count(*) FROM public.device_types WHERE source='riser_studio';
--   SELECT system, count(*) FROM public.device_types GROUP BY 1 ORDER BY 1;
--   SELECT id FROM public.device_types WHERE kind='door_group' ORDER BY sort_order;
--
--   -- "Matched" is a join on devices.type_id = device_types.id, so every device whose
--   -- type is one of these 62 ids reads matched from now on. Devices still unmatched
--   -- (expect 0 while the register is empty; any later ones carry an id that isn't
--   -- in the catalog):
--   SELECT d.type_id, count(*) FROM public.devices d
--     WHERE d.deleted_at IS NULL AND d.type_id IS NOT NULL
--       AND NOT EXISTS (SELECT 1 FROM public.device_types t WHERE t.id = d.type_id)
--     GROUP BY 1;

-- ── Rollback (reverse migration) ──────────────────────────────────────────────
-- BEGIN;
-- DELETE FROM public.device_types WHERE source='riser_studio';
-- ALTER TABLE public.device_types DROP COLUMN IF EXISTS sort_order;
-- ALTER TABLE public.device_types DROP COLUMN IF EXISTS kind;
-- COMMIT;
