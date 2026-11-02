// Centralised error handler. Any error passed to next(err) lands here.
export function errorHandler(err, req, res, next) {
  console.error(err);

  if (err.code === 'P2002') {
    return res.status(409).json({ error: 'A record with that value already exists.' });
  }
  // Missing records and references to another organisation's records both
  // look like "not found", so the existence of other tenants' data never leaks.
  if (err.code === 'P2025' || err.code === 'P2003' || /cross-tenant reference/.test(err.message || '')) {
    return res.status(404).json({ error: 'Record not found.' });
  }

  const status = err.status || 500;
  const message = status >= 500 ? 'Internal server error.' : err.message;
  res.status(status).json({ error: message });
}

export function notFound(req, res) {
  res.status(404).json({ error: `Route ${req.method} ${req.originalUrl} not found.` });
}
