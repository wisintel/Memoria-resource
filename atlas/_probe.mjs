try {
  const m = await import('./.eve/compile/module-map.mjs');
  console.log('MODULE MAP LOADED OK');
} catch (e) {
  console.log('THROWN:', e && e.stack ? e.stack : e);
}
