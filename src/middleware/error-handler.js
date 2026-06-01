export function errorHandler(err, _req, res, _next) {
  console.error(err);
  res.status(500).json({
    ok: false,
    data: null,
    message: err?.message || 'Internal Server Error',
  });
}
