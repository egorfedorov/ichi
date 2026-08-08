-- ═══════════════════════════════════════════════════════════════════════════
-- 0009 — archetype ids in plain words
--
-- The catalogue shipped with transliterated ids (baiyanai, uot-ukhhan, …)
-- beside English names (Sage, Ember, …). Two problems, one of them expensive:
--
--   1. The id is what an agent passes to ichchi_adopt, and a model choosing
--      between "sage" and "ember" is choosing between words it understands.
--      Choosing between "baiyanai" and "uot-ukhhan" is choosing between two
--      opaque strings, and it picks worse.
--   2. Every id was a word from one specific tradition, which narrows a
--      product that has no reason to be regional.
--
-- ichchi stays as the product's name. The archetypes are now the plain nouns
-- they always were underneath.
--
-- `archetype` is a text column with no FK — the catalogue lives in code — so
-- this is a straight remap of existing rows.
-- ═══════════════════════════════════════════════════════════════════════════

update ichchi set archetype = case archetype
  when 'baiyanai'         then 'sage'
  when 'uot-ukhhan'       then 'ember'
  when 'ebe'              then 'drift'
  when 'sir-ichchite'     then 'steward'
  when 'aan-alakhchyn'    then 'hearth'
  when 'kyuekh-byollyokh' then 'hunter'
  else archetype
end
where archetype in (
  'baiyanai', 'uot-ukhhan', 'ebe', 'sir-ichchite', 'aan-alakhchyn', 'kyuekh-byollyokh'
);
