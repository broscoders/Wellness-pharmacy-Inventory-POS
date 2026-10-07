// Parses ?page=&limit= and returns mongoose-friendly values.
function getPagination(query, defaultLimit = 20, maxLimit = 100) {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || defaultLimit, 1), maxLimit);
  return { page, limit, skip: (page - 1) * limit };
}

function pageMeta(total, page, limit) {
  return { total, page, limit, pages: Math.max(Math.ceil(total / limit), 1) };
}

// Escapes user input so it is safe inside a RegExp.
function escapeRegex(str = '') {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { getPagination, pageMeta, escapeRegex };
