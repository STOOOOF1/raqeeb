# ترحيلات قاعدة البيانات

الترحيلات تُطبَّق على مشروع Supabase مباشرة، وهذه نسخة مرجعية منها في المستودع.

- `trips_and_family_games` + `ahnbj_norm_fix` + `trips_revoke_internal` (2026-11-22): جداول «رحلاتنا» (`trips`، `trip_answers`، `children.trips_enabled`) والألعاب العائلية (`game_rooms`، `game_players`، `game_answers`) ودوالها `game_*`. انظر SYSTEM.md.
- `20261125_stale_pause.sql` (2026-11-25): الإيقاف المؤقت لا يتجاوز يومه (`pause_is_stale`، وتعديل `pause_time` و`start_grant`)، مع مسح الإيقافات المعلّقة القديمة.
